"""Verify Google and Apple ID tokens via their published JWKS.

These run on every Google/Apple sign-in request, so we cache the JWKS for the
lifetime of the process. Both providers rotate keys infrequently and the JWKS
endpoints set Cache-Control accordingly.
"""
from __future__ import annotations

import logging
import time
from typing import Any

import httpx
import jwt
from jwt import PyJWKClient

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# JWKS endpoints — public URLs documented by Google / Apple.
GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
GOOGLE_ISSUERS = {"https://accounts.google.com", "accounts.google.com"}

APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"
APPLE_ISSUER = "https://appleid.apple.com"

_JWK_CACHE: dict[str, PyJWKClient] = {}


def _jwk_client(url: str) -> PyJWKClient:
    client = _JWK_CACHE.get(url)
    if client is None:
        client = PyJWKClient(url, cache_keys=True, lifespan=86400)
        _JWK_CACHE[url] = client
    return client


def verify_google_id_token(id_token: str) -> dict[str, Any]:
    """Validate a Google ID token. Returns the decoded payload.

    Raises ValueError if the token is invalid, expired, or its `aud` does not
    match a configured client ID.
    """
    settings = get_settings()
    if not settings.google_oauth_client_ids:
        raise ValueError("google_sign_in_not_configured")

    try:
        jwk = _jwk_client(GOOGLE_JWKS_URL).get_signing_key_from_jwt(id_token)
        payload = jwt.decode(
            id_token,
            jwk.key,
            algorithms=["RS256"],
            audience=settings.google_oauth_client_ids,
            options={"require": ["sub", "email", "iss", "exp"]},
        )
    except jwt.PyJWTError as exc:
        logger.info("google.id_token_invalid reason=%s", exc)
        raise ValueError("invalid_id_token") from exc

    if payload.get("iss") not in GOOGLE_ISSUERS:
        raise ValueError("invalid_issuer")

    if not payload.get("email_verified", False):
        raise ValueError("email_not_verified")

    return payload


def verify_apple_id_token(id_token: str) -> dict[str, Any]:
    """Validate an Apple identityToken. Returns the decoded payload.

    Apple uses ES256 (rather than RS256) so we hand the signing key to PyJWT
    explicitly. The `aud` claim must match one of the configured client IDs
    — this is the Service ID (for web) or the app's Bundle ID (for native).
    """
    settings = get_settings()
    if not settings.apple_oauth_client_ids:
        raise ValueError("apple_sign_in_not_configured")

    try:
        jwk = _jwk_client(APPLE_JWKS_URL).get_signing_key_from_jwt(id_token)
        payload = jwt.decode(
            id_token,
            jwk.key,
            algorithms=["ES256"],
            audience=settings.apple_oauth_client_ids,
            issuer=APPLE_ISSUER,
            options={"require": ["sub", "iss", "exp"]},
        )
    except jwt.PyJWTError as exc:
        logger.info("apple.id_token_invalid reason=%s", exc)
        raise ValueError("invalid_id_token") from exc

    return payload
