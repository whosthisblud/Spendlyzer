import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.models import TransactionType


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    type: TransactionType


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    type: TransactionType
