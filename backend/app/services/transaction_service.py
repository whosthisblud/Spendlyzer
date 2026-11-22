import hashlib
import uuid
from datetime import date
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import CategorySource, MLPrediction, Transaction, TransactionType
from app.schemas.transaction import TransactionCreate, TransactionUpdate
from app.services import category_service, ml_service


def fingerprint(txn_date: date, amount: Decimal, description: str, txn_type: str, currency: str) -> str:
    norm = " ".join(description.lower().split())
    raw = f"{txn_date.isoformat()}|{Decimal(amount).quantize(Decimal('0.01'))}|{norm}|{txn_type}|{currency}"
    return hashlib.sha256(raw.encode()).hexdigest()


def get_owned(db: Session, user_id: uuid.UUID, txn_id: uuid.UUID) -> Transaction:
    txn = db.scalar(select(Transaction).where(Transaction.id == txn_id, Transaction.user_id == user_id))
    if txn is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Transaction not found")
    return txn


def _validate_category(db: Session, user_id: uuid.UUID, category_id: uuid.UUID, txn_type: TransactionType) -> None:
    cat = category_service.get_owned(db, user_id, category_id)
    if cat is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
    if cat.type != txn_type:
        raise HTTPException(422, f"Category '{cat.name}' is for {cat.type.value}")


def auto_categorize(db: Session, txn: Transaction) -> None:
    """Fill category from the classifier (if reliable) or keyword rules. Records the prediction."""
    pred = ml_service.classify(db, txn.user_id, txn.description, txn.type, float(txn.amount))
    if pred.category_id is None:
        return
    txn.category_id = pred.category_id
    txn.category_source = CategorySource.ml if pred.source == "model" else CategorySource.rules
    db.flush()
    db.add(MLPrediction(
        user_id=txn.user_id, transaction_id=txn.id, prediction_type="category",
        result={"category": pred.category, "source": pred.source}, score=pred.confidence,
        model_version=pred.source,
    ))


def create(db: Session, user_id: uuid.UUID, data: TransactionCreate) -> Transaction:
    if data.category_id:
        _validate_category(db, user_id, data.category_id, data.type)
    txn = Transaction(
        user_id=user_id,
        fingerprint=fingerprint(data.date, data.amount, data.description, data.type.value, data.currency),
        category_source=CategorySource.manual,
        **data.model_dump(),
    )
    db.add(txn)
    db.flush()
    if txn.category_id is None:
        auto_categorize(db, txn)
    db.commit()
    db.refresh(txn)
    return txn


def update(db: Session, user_id: uuid.UUID, txn_id: uuid.UUID, data: TransactionUpdate) -> Transaction:
    txn = get_owned(db, user_id, txn_id)
    changes = data.model_dump(exclude_unset=True)
    new_type = changes.get("type", txn.type)
    if "category_id" in changes:
        if changes["category_id"] is not None:
            _validate_category(db, user_id, changes["category_id"], new_type)
        # Any explicit category choice counts as a user label (manual correction of a prediction).
        txn.category_source = CategorySource.manual
    elif "type" in changes and txn.category and txn.category.type != new_type:
        txn.category_id = None
    for key, value in changes.items():
        setattr(txn, key, value)
    txn.fingerprint = fingerprint(txn.date, txn.amount, txn.description, txn.type.value, txn.currency)
    db.commit()
    db.refresh(txn)
    return txn


def delete(db: Session, user_id: uuid.UUID, txn_id: uuid.UUID) -> None:
    db.delete(get_owned(db, user_id, txn_id))
    db.commit()


def list_transactions(
    db: Session,
    user_id: uuid.UUID,
    *,
    start: date | None = None,
    end: date | None = None,
    txn_type: TransactionType | None = None,
    category_id: uuid.UUID | None = None,
    uncategorized: bool = False,
    search: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[Transaction], int]:
    stmt = select(Transaction).where(Transaction.user_id == user_id)
    if start:
        stmt = stmt.where(Transaction.date >= start)
    if end:
        stmt = stmt.where(Transaction.date <= end)
    if txn_type:
        stmt = stmt.where(Transaction.type == txn_type)
    if category_id:
        stmt = stmt.where(Transaction.category_id == category_id)
    if uncategorized:
        stmt = stmt.where(Transaction.category_id.is_(None))
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.where(or_(Transaction.description.ilike(like), Transaction.payment_method.ilike(like)))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.order_by(Transaction.date.desc(), Transaction.created_at.desc()).limit(limit).offset(offset)
    ).unique()
    return list(rows), total
