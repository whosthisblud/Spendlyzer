import uuid
from datetime import date

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import User
from app.schemas.budget import BudgetCreate, BudgetOut, BudgetStatus, BudgetUpdate
from app.services import budget_service

router = APIRouter(prefix="/api/budgets", tags=["budgets"])


@router.get("", response_model=list[BudgetOut])
def list_budgets(period: date | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return budget_service.list_budgets(db, user.id, period)


@router.get("/status", response_model=list[BudgetStatus])
def budget_status(period: date | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return budget_service.budget_status(db, user.id, period or date.today())


@router.post("", response_model=BudgetOut, status_code=status.HTTP_201_CREATED)
def create_budget(data: BudgetCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return budget_service.create(db, user.id, data)


@router.patch("/{budget_id}", response_model=BudgetOut)
def update_budget(
    budget_id: uuid.UUID, data: BudgetUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return budget_service.update(db, user.id, budget_id, data)


@router.delete("/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_budget(budget_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    budget_service.delete(db, user.id, budget_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
