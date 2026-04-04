import json
import logging
from datetime import datetime, timezone
from logging.config import dictConfig
from typing import Any


class ServiceContextFilter(logging.Filter):
    """Attach static service metadata to each log record."""

    def __init__(self, service: str, environment: str) -> None:
        super().__init__()
        self.service = service
        self.environment = environment

    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, "service"):
            record.service = self.service
        if not hasattr(record, "environment"):
            record.environment = self.environment
        return True


class JsonFormatter(logging.Formatter):
    """Render log records as structured JSON."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        for key in (
            "service",
            "environment",
            "request_id",
            "method",
            "path",
            "status_code",
            "duration_ms",
            "case_id",
            "context_mode",
            "provider",
            "model",
        ):
            value = getattr(record, key, None)
            if value is not None:
                payload[key] = value

        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)

        return json.dumps(payload, ensure_ascii=True)


def configure_logging(log_level: str, service: str, environment: str) -> None:
    """Configure application-wide structured logging."""

    dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "json": {"()": "app.core.logging.JsonFormatter"}
            },
            "handlers": {
                "default": {
                    "class": "logging.StreamHandler",
                    "formatter": "json",
                    "filters": ["service_context"],
                }
            },
            "filters": {
                "service_context": {
                    "()": "app.core.logging.ServiceContextFilter",
                    "service": service,
                    "environment": environment,
                }
            },
            "root": {
                "handlers": ["default"],
                "level": log_level.upper(),
            },
        }
    )
