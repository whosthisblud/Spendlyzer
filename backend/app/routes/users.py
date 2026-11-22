from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import User

router = APIRouter(prefix="/api/me", tags=["users"])


class Profile(BaseModel):
    id: str
    email: str | None
    default_currency: str


class ProfileUpdate(BaseModel):
    default_currency: str = Field(pattern=r"^[A-Z]{3}$")


@router.get("", response_model=Profile)
def me(user: User = Depends(get_current_user)):
    return Profile(id=str(user.id), email=user.email, default_currency=user.default_currency)


@router.patch("", response_model=Profile)
def update_me(data: ProfileUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.default_currency = data.default_currency
    db.commit()
    return Profile(id=str(user.id), email=user.email, default_currency=user.default_currency)
