from __future__ import annotations

import re

from app.schemas.knowledge import (
    KnowledgeStructuringRequest,
    KnowledgeStructuringResponse,
)


class KnowledgeStructuringService:
    """Convert raw immigration text into compact searchable knowledge fields."""

    _visa_pattern = re.compile(
        r"\b(?:EB-\dA?|H-1B|L-1A|L-1B|O-1|TN|E-2|F-1|J-1|B-1|B-2|PERM|Express Entry|EU Blue Card)\b",
        re.IGNORECASE,
    )
    _sentence_splitter = re.compile(r"(?<=[.!?])\s+|\n+")

    def structure(
        self,
        *,
        payload: KnowledgeStructuringRequest,
    ) -> KnowledgeStructuringResponse:
        text = payload.text.strip()
        sentences = [
            sentence.strip(" -\t")
            for sentence in self._sentence_splitter.split(text)
            if sentence.strip(" -\t")
        ]
        topic = self._extract_topic(text=text, sentences=sentences)
        related_visas = self._extract_related_visas(text=text)
        key_rules = self._extract_key_rules(sentences=sentences)
        exceptions = self._extract_exceptions(sentences=sentences)
        summary = self._build_summary(sentences=sentences, topic=topic)

        return KnowledgeStructuringResponse(
            topic=topic,
            summary=summary,
            key_rules=key_rules,
            exceptions=exceptions,
            related_visas=related_visas,
        )

    def _extract_topic(self, *, text: str, sentences: list[str]) -> str:
        visas = self._extract_related_visas(text=text)
        if visas:
            return visas[0]
        if sentences:
            candidate = sentences[0][:160].strip(" .:")
            return candidate or "Immigration rule"
        return "Immigration rule"

    def _extract_related_visas(self, *, text: str) -> list[str]:
        seen: set[str] = set()
        results: list[str] = []
        for match in self._visa_pattern.findall(text):
            normalized = match.upper() if "-" in match or match.isupper() else match
            if normalized in seen:
                continue
            seen.add(normalized)
            results.append(normalized)
        return results[:10]

    @staticmethod
    def _extract_key_rules(*, sentences: list[str]) -> list[str]:
        rule_markers = (
            "require",
            "must",
            "need",
            "eligible",
            "cannot",
            "should",
            "subject to",
            "applies to",
        )
        rules: list[str] = []
        for sentence in sentences:
            lowered = sentence.lower()
            if any(marker in lowered for marker in rule_markers):
                rules.append(sentence.rstrip("."))
        if not rules and sentences:
            rules = [sentences[0].rstrip(".")]
        return rules[:10]

    @staticmethod
    def _extract_exceptions(*, sentences: list[str]) -> list[str]:
        exception_markers = (
            "except",
            "unless",
            "cap-exempt",
            "exempt",
            "however",
            "but",
        )
        exceptions = [
            sentence.rstrip(".")
            for sentence in sentences
            if any(marker in sentence.lower() for marker in exception_markers)
        ]
        return exceptions[:10]

    @staticmethod
    def _build_summary(*, sentences: list[str], topic: str) -> str:
        if sentences:
            summary = sentences[0].rstrip(".")
            return summary[:400]
        return topic
