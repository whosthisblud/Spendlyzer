import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import TransactionType, User
from app.schemas.transaction import ImportResult, TransactionCreate, TransactionList, TransactionOut, TransactionUpdate
from app.services import csv_import, transaction_service

router = APIRouter(prefix="/api/transactions", tags=["transactions"])
MAX_UPLOAD_BYTES = 5 * 1024 * 1024


@router.get("", response_model=TransactionList)
def list_transactions(
    start: date | None = None,
    end: date | None = None,
    type: TransactionType | None = None,
    category_id: uuid.UUID | None = None,
    uncategorized: bool = False,
    q: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items, total = transaction_service.list_transactions(
        db, user.id, start=start, end=end, txn_type=type, category_id=category_id,
        uncategorized=uncategorized, search=q, limit=limit, offset=offset,
    )
    return TransactionList(items=items, total=total, limit=limit, offset=offset)


@router.post("", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
def create_transaction(data: TransactionCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return transaction_service.create(db, user.id, data)


@router.post("/import", response_model=ImportResult)
async def import_transactions(
    file: UploadFile = File(...), user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    if file.filename and not file.filename.lower().endswith(".csv"):
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Upload a .csv file")
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "CSV must be under 5 MB")
    try:
        return csv_import.import_csv(db, user.id, content, user.default_currency)
    except csv_import.CSVFormatError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get("/{txn_id}", response_model=TransactionOut)
def get_transaction(txn_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return transaction_service.get_owned(db, user.id, txn_id)


@router.patch("/{txn_id}", response_model=TransactionOut)
def update_transaction(
    txn_id: uuid.UUID, data: TransactionUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return transaction_service.update(db, user.id, txn_id, data)


@router.delete("/{txn_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(txn_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    transaction_service.delete(db, user.id, txn_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
