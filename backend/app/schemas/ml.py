import uuid
from datetime import date
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.models import TransactionType


class ClassifyRequest(BaseModel):
    description: str = Field(min_length=1, max_length=255)
    amount: Decimal | None = Field(default=None, gt=0)
    type: TransactionType = TransactionType.expense


class ClassifyResponse(BaseModel):
    category: str | None
    category_id: uuid.UUID | None
    confidence: float | None
    source: Literal["model", "rules", "none"]
    reliable: bool


class ClassifierStatus(BaseModel):
    trained: bool
    reliable: bool
    status: str
    metrics: dict[str, Any] = {}
    message: str


class AnomalyItem(BaseModel):
    transaction_id: uuid.UUID
    date: date
    description: str
    amount: Decimal
    currency: str
    category: str | None
    score: float
    reason: str


class AnomalyReport(BaseModel):
    status: Literal["ok", "insufficient_data"]
    message: str
    evaluated_on: int
    metrics: dict[str, Any] = {}
    anomalies: list[AnomalyItem]


class AnomalyReview(BaseModel):
    is_anomaly: bool


class ForecastPoint(BaseModel):
    month: str
    actual: float | None
    predicted: float | None


class ForecastReport(BaseModel):
    status: Literal["ok", "insufficient_data"]
    message: str
    reliable: bool
    method: str | None
    next_month: str | None
    predicted: float | None
    lower: float | None
    upper: float | None
    current_month_actual: float | None
    metrics: dict[str, Any] = {}
    history: list[ForecastPoint]
