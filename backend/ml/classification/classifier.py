"""Per-user transaction category classifier.

Text features (word + char n-grams of the description) plus tokens for transaction
type and an amount bucket, fed to a balanced logistic regression. The model is
evaluated with stratified cross-validation before it is allowed to drive automatic
categorization.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.pipeline import FeatureUnion, Pipeline

MODEL_VERSION = "clf-tfidf-logreg-v1"


def _amount_bucket(amount: float | None) -> str:
    if amount is None or amount <= 0 or math.isnan(amount):
        return "amt_na"
    return f"amt_{min(int(math.log10(amount) * 2), 12)}"  # half-decade buckets


def build_text(description: str, txn_type: str, amount: float | None) -> str:
    return f"{description.lower()} __{txn_type} __{_amount_bucket(amount)}"


def _make_pipeline() -> Pipeline:
    features = FeatureUnion([
        ("word", TfidfVectorizer(analyzer="word", ngram_range=(1, 2), min_df=1, sublinear_tf=True)),
        ("char", TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), min_df=1, sublinear_tf=True)),
    ])
    clf = LogisticRegression(max_iter=2000, class_weight="balanced", C=5.0)
    return Pipeline([("features", features), ("clf", clf)])


@dataclass
class TrainResult:
    status: str  # trained | insufficient_data
    reliable: bool
    metrics: dict[str, Any] = field(default_factory=dict)
    message: str = ""


class TransactionClassifier:
    def __init__(self) -> None:
        self.pipeline: Pipeline | None = None
        self.metrics: dict[str, Any] = {}
        self.reliable: bool = False

    @property
    def trained(self) -> bool:
        return self.pipeline is not None

    def fit(
        self,
        df: pd.DataFrame,
        min_samples: int = 30,
        min_macro_f1: float = 0.70,
    ) -> TrainResult:
        """df columns: description, type, amount, category."""
        df = df.dropna(subset=["description", "category"])
        counts = df["category"].value_counts()
        if len(df) < min_samples or len(counts) < 2:
            self.pipeline, self.reliable = None, False
            return TrainResult(
                "insufficient_data", False, {"samples": int(len(df)), "classes": int(len(counts))},
                f"Need at least {min_samples} categorized transactions across 2+ categories "
                f"(have {len(df)} across {len(counts)}).",
            )

        X = [build_text(d, t, a) for d, t, a in zip(df["description"], df["type"], df["amount"])]
        y = df["category"].to_numpy()

        # Evaluate on classes with enough samples to stratify.
        eval_mask = df["category"].map(counts).to_numpy() >= 2
        X_eval = [x for x, m in zip(X, eval_mask) if m]
        y_eval = y[eval_mask]
        n_splits = int(min(5, pd.Series(y_eval).value_counts().min())) if len(y_eval) else 0

        metrics: dict[str, Any] = {
            "samples": int(len(df)),
            "classes": int(len(counts)),
            "model_version": MODEL_VERSION,
            "trained_at": datetime.now(timezone.utc).isoformat(),
        }
        reliable = False
        if n_splits >= 2 and len(set(y_eval)) >= 2:
            cv = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)
            preds = cross_val_predict(_make_pipeline(), X_eval, y_eval, cv=cv)
            acc = float(accuracy_score(y_eval, preds))
            f1 = float(f1_score(y_eval, preds, average="macro", zero_division=0))
            metrics.update({"cv_folds": n_splits, "accuracy": round(acc, 4), "macro_f1": round(f1, 4)})
            reliable = f1 >= min_macro_f1
        else:
            metrics["note"] = "Too few samples per category for cross-validation."

        self.pipeline = _make_pipeline().fit(X, y)
        self.metrics = metrics
        self.reliable = reliable
        msg = (
            f"Model is reliable (macro F1 {metrics.get('macro_f1')})."
            if reliable
            else f"Model trained but below the reliability bar (macro F1 >= {min_macro_f1}); "
                 "keyword rules will be used for auto-categorization."
        )
        return TrainResult("trained", reliable, metrics, msg)

    def predict(self, description: str, txn_type: str, amount: float | None) -> tuple[str, float] | None:
        if self.pipeline is None:
            return None
        proba = self.pipeline.predict_proba([build_text(description, txn_type, amount)])[0]
        idx = int(np.argmax(proba))
        return str(self.pipeline.classes_[idx]), float(proba[idx])
