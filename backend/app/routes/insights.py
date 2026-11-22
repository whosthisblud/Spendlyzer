from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import User
from app.schemas.insights import InsightsReport
from app.services import insights_service

router = APIRouter(prefix="/api/insights", tags=["insights"])


@router.get("", response_model=InsightsReport)
def get_insights(
    period: date | None = None,
    currency: str | None = Query(default=None, pattern=r"^[A-Z]{3}$"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return insights_service.build_insights(db, user.id, period or date.today(), currency or user.default_currency)
