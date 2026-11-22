from datetime import date
from decimal import Decimal

from pydantic import BaseModel

from app.schemas.budget import BudgetStatus


class Summary(BaseModel):
    total_income: Decimal
    total_expense: Decimal
    balance: Decimal
    transaction_count: int
    currency: str


class MonthlyPoint(BaseModel):
    month: str  # YYYY-MM
    income: Decimal
    expense: Decimal


class CategoryShare(BaseModel):
    category: str
    total: Decimal
    share: float


class TrendPoint(BaseModel):
    period: str
    expense: Decimal
    income: Decimal


class Dashboard(BaseModel):
    start: date
    end: date
    summary: Summary
    monthly: list[MonthlyPoint]
    categories: list[CategoryShare]
    trend: list[TrendPoint]
    budgets: list[BudgetStatus]
