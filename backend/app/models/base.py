import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Uuid, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class TransactionType(str, enum.Enum):
    income = "income"
    expense = "expense"


class CategorySource(str, enum.Enum):
    manual = "manual"      # set or corrected by the user
    imported = "imported"  # came from a CSV column
    ml = "ml"              # predicted by the classifier
    rules = "rules"        # predicted by keyword rules


class UUIDPk:
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)


class Timestamps:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
