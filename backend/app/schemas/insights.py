from typing import Any, Literal

from pydantic import BaseModel


class Insight(BaseModel):
    kind: Literal["summary", "top_category", "change", "budget", "savings", "anomaly", "info"]
    severity: Literal["info", "positive", "warning", "critical"]
    title: str
    detail: str
    data: dict[str, Any] = {}


class InsightsReport(BaseModel):
    period: str
    currency: str
    insights: list[Insight]
