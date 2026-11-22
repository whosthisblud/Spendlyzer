import uuid
from datetime import date, timedelta
from decimal import Decimal

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Category, Transaction, TransactionType
from app.schemas.dashboard import CategoryShare, Dashboard, MonthlyPoint, Summary, TrendPoint
from app.services import budget_service

ZERO = Decimal("0.00")


def load_frame(db: Session, user_id: uuid.UUID, start: date, end: date, currency: str) -> pd.DataFrame:
    rows = db.execute(
        select(Transaction.date, Transaction.amount, Transaction.type, Category.name)
        .outerjoin(Category, Transaction.category_id == Category.id)
        .where(Transaction.user_id == user_id, Transaction.currency == currency,
               Transaction.date >= start, Transaction.date <= end)
    ).all()
    df = pd.DataFrame(rows, columns=["date", "amount", "type", "category"])
    if not df.empty:
        df["type"] = df["type"].map(lambda t: t.value if hasattr(t, "value") else t)
        df["category"] = df["category"].fillna("Uncategorized")
        df["date"] = pd.to_datetime(df["date"])
    return df


def _dec(x) -> Decimal:
    return Decimal(str(round(float(x), 2))).quantize(Decimal("0.01"))


def summary(df: pd.DataFrame, currency: str) -> Summary:
    if df.empty:
        return Summary(total_income=ZERO, total_expense=ZERO, balance=ZERO, transaction_count=0, currency=currency)
    inc = df.loc[df["type"] == "income", "amount"].sum()
    exp = df.loc[df["type"] == "expense", "amount"].sum()
    return Summary(total_income=_dec(inc), total_expense=_dec(exp), balance=_dec(inc - exp),
                   transaction_count=int(len(df)), currency=currency)


def category_breakdown(df: pd.DataFrame) -> list[CategoryShare]:
    exp = df[df["type"] == "expense"] if not df.empty else df
    if exp.empty:
        return []
    totals = exp.groupby("category")["amount"].sum().astype(float).sort_values(ascending=False)
    grand = totals.sum()
    return [CategoryShare(category=c, total=_dec(v), share=round(v / grand, 4)) for c, v in totals.items()]


def _bucketed(df: pd.DataFrame, freq: str, start: date, end: date, fmt: str) -> list[dict]:
    idx = pd.period_range(start, end, freq=freq)
    out = {str(p): {"income": 0.0, "expense": 0.0} for p in idx}
    if not df.empty:
        g = df.assign(p=df["date"].dt.to_period(freq)).groupby(["p", "type"])["amount"].sum().astype(float)
        for (p, t), v in g.items():
            if str(p) in out:
                out[str(p)][t] = v
    return [{"period": pd.Period(k, freq=freq).strftime(fmt), **v} for k, v in out.items()]


def monthly(df: pd.DataFrame, start: date, end: date) -> list[MonthlyPoint]:
    return [MonthlyPoint(month=b["period"], income=_dec(b["income"]), expense=_dec(b["expense"]))
            for b in _bucketed(df, "M", start, end, "%Y-%m")]


def trend(df: pd.DataFrame, start: date, end: date) -> list[TrendPoint]:
    span = (end - start).days
    freq, fmt = ("D", "%Y-%m-%d") if span <= 62 else ("W", "%Y-%m-%d") if span <= 366 else ("M", "%Y-%m")
    return [TrendPoint(period=b["period"], income=_dec(b["income"]), expense=_dec(b["expense"]))
            for b in _bucketed(df, freq, start, end, fmt)]


def build_dashboard(db: Session, user_id: uuid.UUID, start: date | None, end: date | None, currency: str) -> Dashboard:
    end = end or date.today()
    start = start or (end.replace(day=1) - timedelta(days=150)).replace(day=1)  # ~6 months
    if start > end:
        start, end = end, start
    df = load_frame(db, user_id, start, end, currency)
    return Dashboard(
        start=start, end=end,
        summary=summary(df, currency),
        monthly=monthly(df, start, end),
        categories=category_breakdown(df),
        trend=trend(df, start, end),
        budgets=budget_service.budget_status(db, user_id, end.replace(day=1)),
    )
