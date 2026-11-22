import uuid

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import User
from app.schemas.ml import AnomalyReport, AnomalyReview, ClassifierStatus, ClassifyRequest, ClassifyResponse, ForecastReport
from app.services import ml_service

router = APIRouter(prefix="/api/ml", tags=["ml"])


@router.get("/classifier", response_model=ClassifierStatus)
def classifier_status(user: User = Depends(get_current_user)):
    return ml_service.classifier_status(user.id)


@router.post("/classifier/train", response_model=ClassifierStatus)
def train_classifier(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ml_service.train_classifier(db, user.id)


@router.post("/classifier/predict", response_model=ClassifyResponse)
def predict_category(data: ClassifyRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    amount = float(data.amount) if data.amount is not None else None
    return ml_service.classify(db, user.id, data.description, data.type, amount)


@router.get("/anomalies", response_model=AnomalyReport)
def anomalies(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ml_service.run_anomaly_detection(db, user)


@router.post("/anomalies/{txn_id}/review", status_code=status.HTTP_204_NO_CONTENT)
def review_anomaly(
    txn_id: uuid.UUID, data: AnomalyReview, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    ml_service.review_anomaly(db, user.id, txn_id, data.is_anomaly)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/forecast", response_model=ForecastReport)
def forecast(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ml_service.run_forecast(db, user)
