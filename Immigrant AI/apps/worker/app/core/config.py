from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    app_name: str = "Immigrant AI Worker"
    app_slug: str = "immigrant-ai-worker"
    app_env: Literal["local", "development", "test", "staging", "production"] = (
        "development"
    )
    app_version: str = "0.1.0"
    log_level: str = "INFO"
    database_url: str = "postgresql+asyncpg://immigrant_ai:immigrant_ai@localhost:5432/immigrant_ai"
    redis_url: str = "redis://localhost:6379/0"
    local_storage_root: str = "./storage"
    heartbeat_channel: str = "immigrant-ai:worker:heartbeat"
    heartbeat_interval_seconds: int = Field(default=30, gt=0)
    document_processing_queue_name: str = "immigrant-ai:jobs:document-processing"
    document_processing_block_timeout_seconds: int = Field(default=5, gt=0)
    document_processing_max_retries: int = Field(default=3, ge=1, le=10)
    document_text_preview_chars: int = Field(default=2000, gt=0)

    @property
    def local_storage_root_path(self) -> Path:
        return Path(self.local_storage_root).expanduser().resolve()


@lru_cache
def get_settings() -> Settings:
    return Settings()
