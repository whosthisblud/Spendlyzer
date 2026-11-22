import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Category, User
from app.schemas.category import CategoryCreate, CategoryOut
from app.services import category_service

router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut])
def list_categories(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return category_service.list_categories(db, user.id)


@router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
def create_category(data: CategoryCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if category_service.find_by_name(db, user.id, data.name, data.type):
        raise HTTPException(status.HTTP_409_CONFLICT, "Category already exists")
    cat = Category(user_id=user.id, name=data.name.strip(), type=data.type)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(category_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cat = category_service.get_owned(db, user.id, category_id)
    if cat is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
    db.delete(cat)  # transactions keep existing with category set to NULL
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
