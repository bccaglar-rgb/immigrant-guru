from __future__ import annotations

from collections.abc import Sequence
from decimal import Decimal

from app.schemas.scoring import ScoreContribution, ScoreImpact


def is_present(value: object) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    return True


def ratio_score(completed: int, total: int) -> float:
    if total <= 0:
        return 0.0
    return round((completed / total) * 100, 1)


def round_score(value: float) -> float:
    return round(max(0.0, min(100.0, value)), 1)


def bucket_points(value: Decimal | int | float | None, buckets: Sequence[tuple[float, float]]) -> float:
    if value is None:
        return 0.0

    numeric_value = float(value)
    awarded = 0.0
    for threshold, points in buckets:
        if numeric_value >= threshold:
            awarded = points
    return awarded


def contribution(
    *,
    label: str,
    points: float,
    impact: ScoreImpact,
    explanation: str,
) -> ScoreContribution:
    return ScoreContribution(
        label=label,
        points=round(points, 1),
        impact=impact,
        explanation=explanation,
    )


def top_reasons(contributions: Sequence[ScoreContribution], limit: int = 3) -> list[str]:
    ordered = sorted(
        contributions,
        key=lambda item: (abs(item.points), item.impact != ScoreImpact.NEGATIVE),
        reverse=True,
    )
    return [item.explanation for item in ordered[:limit]]
