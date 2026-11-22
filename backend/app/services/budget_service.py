import calendar
import uuid
from datetime import date
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Budget, Transaction, TransactionType
from app.schemas.budget import BudgetCreate, BudgetStatus, BudgetUpdate
from app.services import category_service

WARNING_THRESHOLD = 0.8


def month_bounds(period: date) -> tuple[date, date]:
    start = period.replace(day=1)
    return start, start.replace(day=calendar.monthrange(start.year, start.month)[1])


def list_budgets(db: Session, user_id: uuid.UUID, period: date | None = None) -> list[Budget]:
    stmt = select(Budget).where(Budget.user_id == user_id)
    if period:
        stmt = stmt.where(Budget.period == period.replace(day=1))
    return list(db.scalars(stmt.order_by(Budget.period.desc())).unique())


def get_owned(db: Session, user_id: uuid.UUID, budget_id: uuid.UUID) -> Budget:
    b = db.scalar(select(Budget).where(Budget.id == budget_id, Budget.user_id == user_id))
    if b is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Budget not found")
    return b


def create(db: Session, user_id: uuid.UUID, data: BudgetCreate) -> Budget:
    if data.category_id:
        cat = category_service.get_owned(db, user_id, data.category_id)
        if cat is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
        if cat.type != TransactionType.expense:
            raise HTTPException(422, "Budgets apply to expense categories only")
    cat_filter = Budget.category_id == data.category_id if data.category_id else Budget.category_id.is_(None)
    if db.scalar(select(Budget.id).where(Budget.user_id == user_id, Budget.period == data.period, cat_filter)):
        raise HTTPException(status.HTTP_409_CONFLICT, "A budget for this category and month already exists")
    b = Budget(user_id=user_id, **data.model_dump())
    db.add(b)
    db.commit()
    db.refresh(b)
    return b


def update(db: Session, user_id: uuid.UUID, budget_id: uuid.UUID, data: BudgetUpdate) -> Budget:
    b = get_owned(db, user_id, budget_id)
    b.monthly_limit = data.monthly_limit
    db.commit()
    db.refresh(b)
    return b


def delete(db: Session, user_id: uuid.UUID, budget_id: uuid.UUID) -> None:
    db.delete(get_owned(db, user_id, budget_id))
    db.commit()


def budget_status(db: Session, user_id: uuid.UUID, period: date) -> list[BudgetStatus]:
    start, end = month_bounds(period)
    out = []
    for b in list_budgets(db, user_id, start):
        stmt = select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.user_id == user_id, Transaction.type == TransactionType.expense,
            Transaction.currency == b.currency, Transaction.date >= start, Transaction.date <= end,
        )
        if b.category_id:
            stmt = stmt.where(Transaction.category_id == b.category_id)
        spent = Decimal(str(db.scalar(stmt) or 0)).quantize(Decimal("0.01"))
        util = float(spent / b.monthly_limit) if b.monthly_limit else 0.0
        state = "exceeded" if util > 1 else "warning" if util >= WARNING_THRESHOLD else "ok"
        out.append(BudgetStatus(
            id=b.id, category_id=b.category_id, category_name=b.category_name or "Overall",
            monthly_limit=b.monthly_limit, currency=b.currency, period=b.period,
            spent=spent, remaining=b.monthly_limit - spent, utilization=round(util, 4), status=state,
        ))
    return out
