from __future__ import annotations

import hashlib
import math
import re
from dataclasses import dataclass
from typing import Protocol

from app.core.config import Settings

TOKEN_PATTERN = re.compile(r"[a-z0-9]+")


@dataclass(frozen=True)
class EmbeddingVector:
    provider: str
    model: str
    values: list[float]


class KnowledgeEmbeddingProvider(Protocol):
    provider_name: str
    model_name: str
    dimensions: int

    async def embed_text(self, text: str) -> EmbeddingVector: ...


class DisabledKnowledgeEmbeddingProvider:
    provider_name = "disabled"
    model_name = "disabled"
    dimensions = 0

    async def embed_text(self, text: str) -> EmbeddingVector:
        raise RuntimeError("Knowledge embedding provider is disabled.")


class HashingKnowledgeEmbeddingProvider:
    """Deterministic local embedding provider for practical hybrid retrieval fallback."""

    provider_name = "hashing"
    model_name = "hashing-v1"

    def __init__(self, *, dimensions: int) -> None:
        self.dimensions = max(dimensions, 64)

    async def embed_text(self, text: str) -> EmbeddingVector:
        vector = [0.0] * self.dimensions
        tokens = [token for token in TOKEN_PATTERN.findall(text.lower()) if len(token) > 1]
        if not tokens:
            return EmbeddingVector(
                provider=self.provider_name,
                model=self.model_name,
                values=vector,
            )

        for token in tokens:
            digest = hashlib.sha256(token.encode("utf-8")).digest()
            index = int.from_bytes(digest[:4], "big") % self.dimensions
            sign = 1.0 if digest[4] % 2 == 0 else -1.0
            vector[index] += sign

        norm = math.sqrt(sum(value * value for value in vector))
        if norm > 0:
            vector = [value / norm for value in vector]

        return EmbeddingVector(
            provider=self.provider_name,
            model=self.model_name,
            values=vector,
        )


def build_knowledge_embedding_provider(settings: Settings) -> KnowledgeEmbeddingProvider:
    provider = settings.knowledge_embedding_provider.strip().lower()

    if provider in {"disabled", ""}:
        return DisabledKnowledgeEmbeddingProvider()
    if provider == "hashing":
        return HashingKnowledgeEmbeddingProvider(
            dimensions=settings.knowledge_embedding_dimensions,
        )

    raise ValueError(
        f"Unsupported knowledge embedding provider: {settings.knowledge_embedding_provider}"
    )
