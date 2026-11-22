import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, Timestamps, UUIDPk
from app.models.category import Category


class Budget(UUIDPk, Timestamps, Base):
    """Monthly limit. `category_id = NULL` means an overall monthly budget."""

    __tablename__ = "budgets"
    __table_args__ = (
        UniqueConstraint("user_id", "category_id", "period", name="uq_budget_user_category_period"),
        CheckConstraint("monthly_limit > 0", name="ck_budget_limit_positive"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("categories.id", ondelete="CASCADE"))
    monthly_limit: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    period: Mapped[date] = mapped_column(Date)  # always the first day of the month

    category: Mapped[Category | None] = relationship(lazy="joined")

    @property
    def category_name(self) -> str | None:
        return self.category.name if self.category else None
