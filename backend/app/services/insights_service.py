"""Rule-based insights computed strictly from the user's own transactions."""
import uuid
from datetime import date

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import MLPrediction
from app.schemas.insights import Insight, InsightsReport
from app.services import analytics_service, budget_service

CHANGE_PCT = 0.30
MIN_CHANGE_ABS = 500.0


def _fmt(amount: float, currency: str) -> str:
    symbol = "₹" if currency == "INR" else f"{currency} "
    return f"{symbol}{amount:,.0f}"


def _prev_month(d: date) -> date:
    return (d.replace(day=1) - pd.Timedelta(days=1)).replace(day=1)


def build_insights(db: Session, user_id: uuid.UUID, period: date, currency: str) -> InsightsReport:
    start, end = budget_service.month_bounds(period)
    p_start, p_end = budget_service.month_bounds(_prev_month(start))
    cur = analytics_service.load_frame(db, user_id, start, end, currency)
    prev = analytics_service.load_frame(db, user_id, p_start, p_end, currency)
    label = start.strftime("%B %Y")
    out: list[Insight] = []

    if cur.empty:
        out.append(Insight(kind="info", severity="info", title="No transactions this month",
                           detail=f"Add or import transactions for {label} to see insights."))
        return InsightsReport(period=start.strftime("%Y-%m"), currency=currency, insights=out)

    def totals(df: pd.DataFrame) -> tuple[float, float]:
        if df.empty:
            return 0.0, 0.0
        return (float(df.loc[df["type"] == "income", "amount"].sum()),
                float(df.loc[df["type"] == "expense", "amount"].sum()))

    inc, exp = totals(cur)
    p_inc, p_exp = totals(prev)

    detail = f"You spent {_fmt(exp, currency)} and earned {_fmt(inc, currency)} in {label}."
    if p_exp > 0:
        ch = (exp - p_exp) / p_exp
        detail += f" Spending is {'up' if ch >= 0 else 'down'} {abs(ch):.0%} versus last month ({_fmt(p_exp, currency)})."
    out.append(Insight(kind="summary", severity="info", title="Monthly summary", detail=detail,
                       data={"income": inc, "expense": exp, "previous_expense": p_exp}))

    if inc > 0:
        rate = (inc - exp) / inc
        sev = "positive" if rate >= 0.2 else "warning" if rate < 0 else "info"
        out.append(Insight(kind="savings", severity=sev, title="Savings rate",
                           detail=f"You kept {rate:.0%} of your income this month." if rate >= 0
                           else f"You spent {_fmt(exp - inc, currency)} more than you earned.",
                           data={"savings_rate": round(rate, 4)}))

    cats = analytics_service.category_breakdown(cur)
    if cats:
        top = cats[:3]
        out.append(Insight(
            kind="top_category", severity="info", title=f"Top category: {top[0].category}",
            detail=", ".join(f"{c.category} {_fmt(float(c.total), currency)} ({c.share:.0%})" for c in top),
            data={"top": [c.model_dump(mode="json") for c in top]},
        ))

    if not prev.empty:
        cur_c = cur[cur["type"] == "expense"].groupby("category")["amount"].sum().astype(float)
        prev_c = prev[prev["type"] == "expense"].groupby("category")["amount"].sum().astype(float)
        for cat in sorted(set(cur_c.index) | set(prev_c.index)):
            a, b = float(cur_c.get(cat, 0.0)), float(prev_c.get(cat, 0.0))
            diff = a - b
            if abs(diff) < MIN_CHANGE_ABS or b == 0 and a < MIN_CHANGE_ABS * 2:
                continue
            pct = diff / b if b else None
            if pct is not None and abs(pct) < CHANGE_PCT:
                continue
            title = f"{cat} {'up' if diff > 0 else 'down'} {_fmt(abs(diff), currency)}"
            detail = (f"{_fmt(a, currency)} this month vs {_fmt(b, currency)} last month"
                      + (f" ({pct:+.0%})." if pct is not None else " (new this month)."))
            out.append(Insight(kind="change", severity="warning" if diff > 0 else "positive",
                               title=title, detail=detail, data={"category": cat, "current": a, "previous": b}))

    for bs in budget_service.budget_status(db, user_id, start):
        if bs.status == "exceeded":
            out.append(Insight(kind="budget", severity="critical", title=f"{bs.category_name} budget exceeded",
                               detail=f"Spent {_fmt(float(bs.spent), currency)} of {_fmt(float(bs.monthly_limit), currency)} "
                                      f"({bs.utilization:.0%}).", data=bs.model_dump(mode="json")))
        elif bs.status == "warning":
            out.append(Insight(kind="budget", severity="warning", title=f"{bs.category_name} budget at {bs.utilization:.0%}",
                               detail=f"{_fmt(float(bs.remaining), currency)} left for {label}.",
                               data=bs.model_dump(mode="json")))

    flagged = [p for p in db.scalars(select(MLPrediction).where(
        MLPrediction.user_id == user_id, MLPrediction.prediction_type == "anomaly"))
        if not p.result.get("reviewed")]
    if flagged:
        out.append(Insight(kind="anomaly", severity="warning", title=f"{len(flagged)} transaction(s) flagged for review",
                           detail="These deviate from your usual spending pattern. Review them on the Insights page.",
                           data={"count": len(flagged)}))

    return InsightsReport(period=start.strftime("%Y-%m"), currency=currency, insights=out)
