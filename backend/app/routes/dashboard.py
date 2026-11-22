from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import User
from app.schemas.dashboard import Dashboard
from app.services import analytics_service

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("", response_model=Dashboard)
def get_dashboard(
    start: date | None = None,
    end: date | None = None,
    currency: str | None = Query(default=None, pattern=r"^[A-Z]{3}$"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return analytics_service.build_dashboard(db, user.id, start, end, currency or user.default_currency)
