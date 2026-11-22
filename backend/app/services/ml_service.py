"""Glue between the database and the pure ML modules in backend/ml."""
import json
import uuid
from datetime import date
from pathlib import Path

import joblib
import pandas as pd
from fastapi import HTTPException, status
from sqlalchemy import delete, select, true
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Category, CategorySource, MLPrediction, Transaction, TransactionType, User
from app.schemas.ml import (
    AnomalyItem,
    AnomalyReport,
    ClassifierStatus,
    ClassifyResponse,
    ForecastPoint,
    ForecastReport,
)
from ml.anomaly_detection.detector import MODEL_VERSION as ANOMALY_VERSION
from ml.anomaly_detection.detector import detect_anomalies
from ml.classification.classifier import TransactionClassifier
from ml.classification.rules import match_rule
from ml.forecasting.forecaster import MODEL_VERSION as FORECAST_VERSION
from ml.forecasting.forecaster import forecast_expenses

_cache: dict[uuid.UUID, tuple[float, TransactionClassifier]] = {}


# ---------- persistence ----------

def _model_path(user_id: uuid.UUID) -> Path:
    return Path(get_settings().model_dir) / str(user_id) / "classifier.joblib"


def _load_classifier(user_id: uuid.UUID) -> TransactionClassifier | None:
    path = _model_path(user_id)
    if not path.exists():
        _cache.pop(user_id, None)
        return None
    mtime = path.stat().st_mtime
    cached = _cache.get(user_id)
    if cached and cached[0] == mtime:
        return cached[1]
    model = joblib.load(path)
    _cache[user_id] = (mtime, model)
    return model


def _save_classifier(user_id: uuid.UUID, model: TransactionClassifier) -> None:
    path = _model_path(user_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, path)
    path.with_suffix(".json").write_text(json.dumps(model.metrics, indent=2))
    _cache.pop(user_id, None)


# ---------- classification ----------

def _labeled_frame(db: Session, user_id: uuid.UUID) -> pd.DataFrame:
    rows = db.execute(
        select(Transaction.description, Transaction.type, Transaction.amount, Category.name)
        .join(Category, Transaction.category_id == Category.id)
        .where(
            Transaction.user_id == user_id,
            # Only user-provided labels; never train on the model's own guesses.
            Transaction.category_source.in_([CategorySource.manual, CategorySource.imported]),
        )
    ).all()
    df = pd.DataFrame(rows, columns=["description", "type", "amount", "category"])
    if not df.empty:
        df["type"] = df["type"].map(lambda t: t.value if hasattr(t, "value") else t)
        df["amount"] = df["amount"].astype(float)
        # Disambiguate same-named categories across types (e.g. "Other").
        df["category"] = df["type"] + "::" + df["category"]
    return df


def train_classifier(db: Session, user_id: uuid.UUID) -> ClassifierStatus:
    s = get_settings()
    model = TransactionClassifier()
    result = model.fit(_labeled_frame(db, user_id), s.classifier_min_samples, s.classifier_min_macro_f1)
    if model.trained:
        _save_classifier(user_id, model)
    return ClassifierStatus(
        trained=model.trained, reliable=result.reliable, status=result.status,
        metrics=result.metrics, message=result.message,
    )


def classifier_status(user_id: uuid.UUID) -> ClassifierStatus:
    model = _load_classifier(user_id)
    if model is None:
        return ClassifierStatus(
            trained=False, reliable=False, status="untrained",
            message="No model trained yet. Keyword rules are used for auto-categorization.",
        )
    return ClassifierStatus(
        trained=True, reliable=model.reliable, status="trained", metrics=model.metrics,
        message="Model is reliable." if model.reliable else "Model is below the reliability bar; rules are used.",
    )


def classify(
    db: Session, user_id: uuid.UUID, description: str, txn_type: TransactionType, amount: float | None
) -> ClassifyResponse:
    s = get_settings()
    model = _load_classifier(user_id)
    if model is not None and model.reliable:
        pred = model.predict(description, txn_type.value, amount)
        if pred:
            label, conf = pred
            label_type, _, name = label.partition("::")
            if label_type == txn_type.value and conf >= s.classifier_min_confidence:
                cat = db.scalar(select(Category).where(
                    Category.user_id == user_id, Category.name == name, Category.type == txn_type))
                if cat:
                    return ClassifyResponse(category=cat.name, category_id=cat.id, confidence=round(conf, 4),
                                            source="model", reliable=True)

    name = match_rule(description, txn_type.value)
    if name:
        cat = db.scalar(select(Category).where(
            Category.user_id == user_id, Category.name == name, Category.type == txn_type))
        if cat:
            return ClassifyResponse(category=cat.name, category_id=cat.id, confidence=None,
                                    source="rules", reliable=False)
    return ClassifyResponse(category=None, category_id=None, confidence=None, source="none", reliable=False)


# ---------- anomaly detection ----------

def _dismissed_ids(db: Session, user_id: uuid.UUID) -> set[uuid.UUID]:
    preds = db.scalars(select(MLPrediction).where(
        MLPrediction.user_id == user_id, MLPrediction.prediction_type == "anomaly"))
    return {p.transaction_id for p in preds if p.result.get("reviewed") and not p.result.get("is_anomaly")}


def run_anomaly_detection(db: Session, user: User) -> AnomalyReport:
    txns = list(db.scalars(select(Transaction).where(
        Transaction.user_id == user.id,
        Transaction.type == TransactionType.expense,
        Transaction.currency == user.default_currency,
    )).unique())
    df = pd.DataFrame([
        {"id": t.id, "amount": float(t.amount), "category": t.category_name, "date": t.date} for t in txns
    ], columns=["id", "amount", "category", "date"])

    s = get_settings()
    result = detect_anomalies(df, min_samples=s.anomaly_min_samples)
    if result.status != "ok":
        return AnomalyReport(status="insufficient_data", message=result.message, evaluated_on=len(df),
                             metrics=result.metrics, anomalies=[])

    dismissed = _dismissed_ids(db, user.id)
    reviewed_ids = {
        p.transaction_id for p in db.scalars(select(MLPrediction).where(
            MLPrediction.user_id == user.id, MLPrediction.prediction_type == "anomaly")) if p.result.get("reviewed")
    }
    # Replace stale unreviewed flags with the fresh run.
    db.execute(delete(MLPrediction).where(
        MLPrediction.user_id == user.id, MLPrediction.prediction_type == "anomaly",
        MLPrediction.transaction_id.not_in(reviewed_ids) if reviewed_ids else true(),
    ))
    by_id = {t.id: t for t in txns}
    items = []
    for row in result.flagged.itertuples():
        if row.id in dismissed:
            continue
        t = by_id[row.id]
        if row.id not in reviewed_ids:
            db.add(MLPrediction(
                user_id=user.id, transaction_id=t.id, prediction_type="anomaly",
                result={"reason": row.reason, "reviewed": False}, score=row.score, model_version=ANOMALY_VERSION,
            ))
        items.append(AnomalyItem(
            transaction_id=t.id, date=t.date, description=t.description, amount=t.amount,
            currency=t.currency, category=t.category_name, score=row.score, reason=row.reason,
        ))
    db.commit()
    return AnomalyReport(status="ok", message=result.message, evaluated_on=len(df),
                         metrics=result.metrics, anomalies=items)


def review_anomaly(db: Session, user_id: uuid.UUID, txn_id: uuid.UUID, is_anomaly: bool) -> None:
    txn = db.scalar(select(Transaction).where(Transaction.id == txn_id, Transaction.user_id == user_id))
    if txn is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Transaction not found")
    pred = db.scalar(select(MLPrediction).where(
        MLPrediction.user_id == user_id, MLPrediction.transaction_id == txn_id,
        MLPrediction.prediction_type == "anomaly"))
    if pred is None:
        pred = MLPrediction(user_id=user_id, transaction_id=txn_id, prediction_type="anomaly",
                            result={}, model_version=ANOMALY_VERSION)
        db.add(pred)
    pred.result = {**pred.result, "reviewed": True, "is_anomaly": is_anomaly}
    db.commit()


# ---------- forecasting ----------

def run_forecast(db: Session, user: User, today: date | None = None) -> ForecastReport:
    today = today or date.today()
    rows = db.execute(select(Transaction.date, Transaction.amount).where(
        Transaction.user_id == user.id,
        Transaction.type == TransactionType.expense,
        Transaction.currency == user.default_currency,
    )).all()
    df = pd.DataFrame(rows, columns=["date", "amount"])
    if not df.empty:
        df["amount"] = df["amount"].astype(float)

    s = get_settings()
    current = pd.Period(today, freq="M")
    result = forecast_expenses(df, current, s.forecast_min_months, s.forecast_max_reliable_mape)

    current_actual = None
    if not df.empty:
        months = pd.to_datetime(df["date"]).dt.to_period("M")
        current_actual = round(float(df.loc[months == current, "amount"].sum()), 2)

    history = [ForecastPoint(**h) for h in result.history]
    if result.status == "ok":
        history.append(ForecastPoint(month=str(current), actual=current_actual, predicted=result.predicted))
        db.add(MLPrediction(
            user_id=user.id, transaction_id=None, prediction_type="forecast",
            result={"month": result.next_month, "predicted": result.predicted, "method": result.method,
                    "reliable": result.reliable, "mape": result.metrics.get("mape")},
            score=result.metrics.get("mape"), model_version=FORECAST_VERSION,
        ))
        db.commit()

    return ForecastReport(
        status=result.status, message=result.message, reliable=result.reliable, method=result.method,
        next_month=result.next_month, predicted=result.predicted, lower=result.lower, upper=result.upper,
        current_month_actual=current_actual, metrics=result.metrics, history=history,
    )
