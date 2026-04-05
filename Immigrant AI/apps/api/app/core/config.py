from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_JWT_SECRET = "dev-only-change-me-to-a-secure-jwt-secret-key"


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    app_name: str = "Immigrant AI API"
    app_slug: str = "immigrant-ai-api"
    app_env: Literal["local", "development", "test", "staging", "production"] = (
        "development"
    )
    app_version: str = "0.1.0"
    api_v1_prefix: str = "/api/v1"
    debug: bool = False
    log_level: str = "INFO"
    database_url: str = "postgresql+asyncpg://immigrant_ai:immigrant_ai@localhost:5432/immigrant_ai"
    redis_url: str = "redis://localhost:6379/0"
    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:3000"]
    )
    cors_allow_credentials: bool = True
    cors_allow_methods: list[str] = Field(
        default_factory=lambda: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    )
    cors_allow_headers: list[str] = Field(
        default_factory=lambda: ["Authorization", "Content-Type", "X-Request-ID"]
    )
    admin_emails: list[str] = Field(default_factory=list)
    jwt_secret_key: SecretStr = SecretStr(DEFAULT_JWT_SECRET)
    jwt_algorithm: str = "HS256"
    jwt_issuer: str = "immigrant-ai-api"
    access_token_expire_minutes: int = 30
    ai_provider: str = "disabled"
    ai_base_url: str = ""
    ai_api_key: SecretStr | None = None
    ai_model: str = ""
    ai_timeout_seconds: float = 30.0
    ai_temperature: float = 0.2
    openai_api_key: SecretStr | None = None
    openai_model: str = ""
    openai_base_url: str = ""
    openai_timeout_seconds: float = 30.0
    openai_max_retries: int = 2
    local_storage_root: str = "./storage"
    document_max_upload_bytes: int = 25 * 1024 * 1024
    document_processing_queue_name: str = "immigrant-ai:jobs:document-processing"
    timeline_snapshot_ttl_minutes: int = 720
    knowledge_retrieval_backend: str = "lexical"
    knowledge_search_candidate_limit: int = 50
    knowledge_vector_candidate_limit: int = 40
    knowledge_hybrid_rrf_k: int = 50
    knowledge_hybrid_lexical_weight: float = 0.45
    knowledge_hybrid_vector_weight: float = 0.35
    knowledge_hybrid_freshness_weight: float = 0.10
    knowledge_hybrid_authority_weight: float = 0.10
    knowledge_embedding_provider: str = "hashing"
    knowledge_embedding_model: str = "hashing-v1"
    knowledge_embedding_dimensions: int = 256

    # Email (Resend)
    resend_api_key: str = ""
    resend_from_email: str = "Immigrant Guru <noreply@immigrant.guru>"

    # Stripe
    stripe_secret_key: str = ""
    stripe_publishable_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_starter_price_id: str = ""
    stripe_plus_price_id: str = ""
    stripe_premium_price_id: str = ""

    @field_validator("admin_emails")
    @classmethod
    def normalize_admin_emails(cls, value: list[str]) -> list[str]:
        normalized: list[str] = []
        seen: set[str] = set()

        for email in value:
            candidate = email.strip().lower()
            if not candidate or candidate in seen:
                continue
            seen.add(candidate)
            normalized.append(candidate)

        return normalized

    @model_validator(mode="after")
    def validate_runtime_security(self) -> "Settings":
        secret = self.jwt_secret_key.get_secret_value().strip()

        if self.app_env in {"staging", "production"}:
            if secret == DEFAULT_JWT_SECRET:
                raise ValueError(
                    "JWT_SECRET_KEY must be changed before running in staging or production."
                )
            if len(secret) < 32:
                raise ValueError(
                    "JWT_SECRET_KEY must be at least 32 characters in staging or production."
                )

        return self

    @property
    def local_storage_root_path(self) -> Path:
        return Path(self.local_storage_root).expanduser().resolve()


@lru_cache
def get_settings() -> Settings:
    """Return a cached settings instance."""

    return Settings()
