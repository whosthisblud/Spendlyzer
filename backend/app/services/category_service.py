import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Category, TransactionType

DEFAULT_CATEGORIES: dict[TransactionType, list[str]] = {
    TransactionType.expense: [
        "Food & Dining", "Groceries", "Transport", "Shopping", "Bills & Utilities", "Rent",
        "Subscriptions", "Entertainment", "Health", "Education", "Travel", "Other",
    ],
    TransactionType.income: ["Salary", "Freelance", "Investments", "Refunds", "Gifts", "Other"],
}


def seed_default_categories(db: Session, user_id: uuid.UUID) -> None:
    for txn_type, names in DEFAULT_CATEGORIES.items():
        for name in names:
            db.add(Category(user_id=user_id, name=name, type=txn_type))


def list_categories(db: Session, user_id: uuid.UUID) -> list[Category]:
    return list(db.scalars(select(Category).where(Category.user_id == user_id).order_by(Category.type, Category.name)))


def get_owned(db: Session, user_id: uuid.UUID, category_id: uuid.UUID) -> Category | None:
    return db.scalar(select(Category).where(Category.id == category_id, Category.user_id == user_id))


def find_by_name(db: Session, user_id: uuid.UUID, name: str, txn_type: TransactionType) -> Category | None:
    for c in db.scalars(select(Category).where(Category.user_id == user_id, Category.type == txn_type)):
        if c.name.lower() == name.strip().lower():
            return c
    return None


def get_or_create(db: Session, user_id: uuid.UUID, name: str, txn_type: TransactionType) -> Category:
    cat = find_by_name(db, user_id, name, txn_type)
    if cat is None:
        cat = Category(user_id=user_id, name=name.strip()[:50], type=txn_type)
        db.add(cat)
        db.flush()
    return cat
