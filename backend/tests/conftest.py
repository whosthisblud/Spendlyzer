import os
import tempfile
import uuid

_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["MODEL_DIR"] = f"{_tmp}/models"

import pytest  # noqa: E402
from fastapi import Header  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.auth import get_current_user  # noqa: E402
from app.database import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base, User  # noqa: E402
from app.services.category_service import seed_default_categories  # noqa: E402

USER_A = uuid.UUID("00000000-0000-0000-0000-00000000000a")
USER_B = uuid.UUID("00000000-0000-0000-0000-00000000000b")


def _fake_user(x_test_user: str = Header(...)) -> User:
    uid = uuid.UUID(x_test_user)
    db = SessionLocal()
    try:
        user = db.get(User, uid)
        if user is None:
            user = User(id=uid, email=f"{uid}@test.dev", default_currency="INR")
            db.add(user)
            db.flush()
            seed_default_categories(db, uid)
            db.commit()
        return user
    finally:
        db.close()


@pytest.fixture(autouse=True)
def _db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield


@pytest.fixture
def client():
    app.dependency_overrides[get_current_user] = _fake_user
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def a():
    return {"X-Test-User": str(USER_A)}


@pytest.fixture
def b():
    return {"X-Test-User": str(USER_B)}
