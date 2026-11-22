"""Supabase JWT verification.

Registration, login and session refresh happen on the frontend through Supabase Auth.
The backend only verifies the access token on each request and scopes every query to
the resulting user id.
"""
import uuid
from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import User
from app.services.category_service import seed_default_categories

_bearer = HTTPBearer(auto_error=False)


@lru_cache
def _jwks_client(url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(f"{url.rstrip('/')}/auth/v1/.well-known/jwks.json", cache_keys=True)


def decode_token(token: str) -> dict:
    settings = get_settings()
    try:
        alg = jwt.get_unverified_header(token).get("alg")
        if alg == "HS256":
            if not settings.supabase_jwt_secret:
                raise jwt.InvalidTokenError("HS256 token but SUPABASE_JWT_SECRET is not configured")
            key = settings.supabase_jwt_secret
        else:
            if not settings.supabase_url:
                raise jwt.InvalidTokenError("SUPABASE_URL is not configured")
            key = _jwks_client(settings.supabase_url).get_signing_key_from_jwt(token).key
        return jwt.decode(token, key, algorithms=["HS256", "RS256", "ES256"], audience="authenticated")
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid token: {exc}") from exc


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    payload = decode_token(creds.credentials)
    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError) as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token has no valid subject") from exc

    user = db.get(User, user_id)
    if user is None:
        user = _provision_user(db, user_id, payload.get("email"))
    return user


def _provision_user(db: Session, user_id: uuid.UUID, email: str | None) -> User:
    """Create the user row and default categories on first request.

    A new user's first page load fires several API calls at once, so concurrent requests can
    race to insert the same row. The loser rolls back and reads the winner's row.
    """
    try:
        user = User(id=user_id, email=email, default_currency=get_settings().default_currency)
        db.add(user)
        db.flush()
        seed_default_categories(db, user.id)
        db.commit()
        return user
    except IntegrityError:
        db.rollback()
        user = db.get(User, user_id)
        if user is None:
            raise
        return user
