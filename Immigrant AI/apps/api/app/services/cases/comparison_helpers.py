from __future__ import annotations

from app.schemas.comparison import ComparisonCostLevel, ComparisonDifficultyLevel


def contains_keyword(text: str | None, *keywords: str) -> bool:
    normalized = (text or "").strip().lower()
    return any(keyword in normalized for keyword in keywords)


def deduplicate_strings(values: list[str], *, limit: int) -> list[str]:
    seen: set[str] = set()
    deduplicated: list[str] = []

    for value in values:
        normalized = value.strip()
        if not normalized:
            continue
        key = normalized.lower()
        if key in seen:
            continue
        seen.add(key)
        deduplicated.append(normalized)
        if len(deduplicated) >= limit:
            break

    return deduplicated


def difficulty_weight(level: ComparisonDifficultyLevel) -> float:
    return {
        ComparisonDifficultyLevel.LOW: 12.0,
        ComparisonDifficultyLevel.MEDIUM: 6.0,
        ComparisonDifficultyLevel.HIGH: 0.0,
    }[level]


def timeline_weight(months: float) -> float:
    if months <= 10:
        return 14.0
    if months <= 14:
        return 10.0
    if months <= 18:
        return 6.0
    return 2.0


def country_cost_baseline(country: str | None) -> int:
    normalized = (country or "").strip().lower()
    if normalized in {"united states", "usa", "united kingdom", "uk", "australia"}:
        return 2
    if normalized in {"canada", "germany", "ireland", "netherlands"}:
        return 1
    return 0


def pathway_cost_baseline(pathway: str | None) -> int:
    normalized = (pathway or "").strip().lower()
    if contains_keyword(normalized, "invest", "investor", "golden visa", "startup", "entrepreneur"):
        return 2
    if contains_keyword(normalized, "study", "student", "mba", "degree"):
        return 1
    return 0


def resolve_cost_level(
    *,
    country: str | None,
    pathway: str | None,
    has_capital: bool,
) -> ComparisonCostLevel:
    score = country_cost_baseline(country) + pathway_cost_baseline(pathway)
    if not has_capital and score >= 2:
        score += 1

    if score >= 3:
        return ComparisonCostLevel.HIGH
    if score >= 1:
        return ComparisonCostLevel.MEDIUM
    return ComparisonCostLevel.LOW
