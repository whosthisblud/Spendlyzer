"""Entry point shim so both `uvicorn main:app` and `uvicorn app.main:app` work."""
from app.main import app  # noqa: F401
