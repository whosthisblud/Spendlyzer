import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, DateTime, Enum, ForeignKey, Index, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CategorySource, Timestamps, TransactionType, UUIDPk
from app.models.category import Category


class Transaction(UUIDPk, Timestamps, Base):
    __tablename__ = "transactions"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_transaction_amount_positive"),
        Index("ix_transactions_user_date", "user_id", "date"),
        Index("ix_transactions_user_fingerprint", "user_id", "fingerprint"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    description: Mapped[str] = mapped_column(String(255))
    date: Mapped[date] = mapped_column(Date)
    type: Mapped[TransactionType] = mapped_column(Enum(TransactionType, native_enum=False, length=10))
    payment_method: Mapped[str | None] = mapped_column(String(30))
    category_source: Mapped[CategorySource] = mapped_column(
        Enum(CategorySource, native_enum=False, length=10), default=CategorySource.manual
    )
    fingerprint: Mapped[str] = mapped_column(String(64))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    category: Mapped[Category | None] = relationship(lazy="joined")

    @property
    def category_name(self) -> str | None:
        return self.category.name if self.category else None
