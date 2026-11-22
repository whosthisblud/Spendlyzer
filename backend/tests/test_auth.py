import time

import jwt
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app


def test_missing_token_rejected():
    with TestClient(app) as c:
        assert c.get("/api/transactions").status_code == 401


def test_invalid_token_rejected():
    with TestClient(app) as c:
        r = c.get("/api/transactions", headers={"Authorization": "Bearer not-a-jwt"})
        assert r.status_code == 401


def test_hs256_token_accepted_and_user_provisioned(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "supabase_jwt_secret", "test-secret-that-is-long-enough-123456")
    token = jwt.encode(
        {"sub": "11111111-1111-1111-1111-111111111111", "email": "x@y.z", "aud": "authenticated",
         "exp": int(time.time()) + 60},
        settings.supabase_jwt_secret, algorithm="HS256",
    )
    with TestClient(app) as c:
        r = c.get("/api/categories", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        assert any(cat["name"] == "Groceries" for cat in r.json())

        expired = jwt.encode({"sub": "11111111-1111-1111-1111-111111111111", "aud": "authenticated",
                              "exp": int(time.time()) - 10}, settings.supabase_jwt_secret, algorithm="HS256")
        assert c.get("/api/me", headers={"Authorization": f"Bearer {expired}"}).status_code == 401


def test_concurrent_first_requests_do_not_500(monkeypatch):
    """Simulates the race: another request creates the user between our lookup and insert."""
    import uuid

    from app import auth
    from app.database import SessionLocal
    from app.models import Category, User
    from app.services.category_service import seed_default_categories

    uid = uuid.UUID("33333333-3333-3333-3333-333333333333")
    winner = SessionLocal()
    winner.add(User(id=uid, email="w@x.y"))
    winner.flush()
    seed_default_categories(winner, uid)
    winner.commit()
    winner.close()

    db = SessionLocal()
    try:
        user = auth._provision_user(db, uid, "w@x.y")  # loser path: insert collides
        assert user.id == uid
        assert db.query(Category).filter(Category.user_id == uid).count() == 18  # no duplicate seeding
    finally:
        db.close()
