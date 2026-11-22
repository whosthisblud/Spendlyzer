import uuid
import datetime as dt
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import CategorySource, TransactionType
from app.schemas.common import CURRENCY_PATTERN, PaymentMethod


class TransactionBase(BaseModel):
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    currency: str = Field(default="INR", pattern=CURRENCY_PATTERN)
    description: str = Field(min_length=1, max_length=255)
    date: date
    type: TransactionType
    payment_method: PaymentMethod | None = None
    category_id: uuid.UUID | None = None

    @field_validator("description")
    @classmethod
    def strip_description(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("description cannot be blank")
        return v


class TransactionCreate(TransactionBase):
    pass


class TransactionUpdate(BaseModel):
    amount: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    currency: str | None = Field(default=None, pattern=CURRENCY_PATTERN)
    description: str | None = Field(default=None, min_length=1, max_length=255)
    date: dt.date | None = None
    type: TransactionType | None = None
    payment_method: PaymentMethod | None = None
    category_id: uuid.UUID | None = None


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    amount: Decimal
    currency: str
    description: str
    date: date
    type: TransactionType
    payment_method: str | None
    category_id: uuid.UUID | None
    category_name: str | None
    category_source: CategorySource
    created_at: datetime | None = None


class TransactionList(BaseModel):
    items: list[TransactionOut]
    total: int
    limit: int
    offset: int


class ImportRowError(BaseModel):
    row: int
    error: str


class ImportResult(BaseModel):
    total_rows: int
    imported: int
    duplicates: int
    failed: int
    errors: list[ImportRowError]
