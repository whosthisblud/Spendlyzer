from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import engine
from app.models import Base
from app.routes import budgets, categories, dashboard, insights, ml, transactions, users


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Creates tables if missing. For Supabase, prefer running docs/schema.sql (adds RLS policies).
    Base.metadata.create_all(bind=engine)
    yield


settings = get_settings()
app = FastAPI(title="Spendlyzer API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (users, transactions, categories, budgets, dashboard, ml, insights):
    app.include_router(r.router)


@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok"}
