import uuid

from sqlalchemy import Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Timestamps, TransactionType, UUIDPk


class Category(UUIDPk, Timestamps, Base):
    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("user_id", "name", "type", name="uq_category_user_name_type"),)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(50))
    type: Mapped[TransactionType] = mapped_column(Enum(TransactionType, native_enum=False, length=10))
