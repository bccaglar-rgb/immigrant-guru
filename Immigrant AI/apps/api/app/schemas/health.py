from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class DependencyCheck(BaseModel):
    name: str
    status: Literal["up", "down"]
    latency_ms: float | None = None
    detail: str | None = None


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    service: str
    environment: str
    version: str
    timestamp: datetime
    checks: dict[str, DependencyCheck]
