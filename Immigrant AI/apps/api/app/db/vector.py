from __future__ import annotations

from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.sql.type_api import TypeEngine
from sqlalchemy.types import Float, UserDefinedType


class VectorType(UserDefinedType):
    """Minimal pgvector-compatible SQLAlchemy type with basic bind/result support."""

    cache_ok = True

    def __init__(self, dimensions: int) -> None:
        self.dimensions = dimensions

    def get_col_spec(self, **kw: object) -> str:
        return f"vector({self.dimensions})"

    def bind_processor(self, dialect: object):
        def process(value: list[float] | tuple[float, ...] | None) -> str | None:
            if value is None:
                return None
            return "[" + ",".join(f"{float(item):.10f}" for item in value) + "]"

        return process

    def result_processor(self, dialect: object, coltype: object):
        def process(value: object) -> list[float] | None:
            if value is None:
                return None
            if isinstance(value, list):
                return [float(item) for item in value]
            if isinstance(value, str):
                normalized = value.strip().strip("[]")
                if not normalized:
                    return []
                return [float(item) for item in normalized.split(",")]
            return None

        return process

    @property
    def python_type(self) -> type[list[float]]:
        return list


def fallback_vector_array_type() -> TypeEngine[object]:
    return ARRAY(Float)
