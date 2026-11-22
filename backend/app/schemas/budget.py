import uuid
from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import CURRENCY_PATTERN


class BudgetCreate(BaseModel):
    category_id: uuid.UUID | None = None  # None = overall monthly budget
    monthly_limit: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    currency: str = Field(default="INR", pattern=CURRENCY_PATTERN)
    period: date

    @field_validator("period")
    @classmethod
    def first_of_month(cls, v: date) -> date:
        return v.replace(day=1)


class BudgetUpdate(BaseModel):
    monthly_limit: Decimal = Field(gt=0, max_digits=14, decimal_places=2)


class BudgetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    category_id: uuid.UUID | None
    category_name: str | None
    monthly_limit: Decimal
    currency: str
    period: date


class BudgetStatus(BudgetOut):
    spent: Decimal
    remaining: Decimal
    utilization: float  # 0.0 - n, 1.0 = 100%
    status: Literal["ok", "warning", "exceeded"]
