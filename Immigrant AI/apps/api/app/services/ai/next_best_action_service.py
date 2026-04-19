from __future__ import annotations

from app.schemas.workspace import ActionPriority, ActionRoadmapItemRead, NextBestActionRead, TimingCategory


class NextBestActionService:
    """Resolve the single most important action to focus on next."""

    def recommend(
        self,
        *,
        roadmap: list[ActionRoadmapItemRead],
        recommended_focus: str,
    ) -> NextBestActionRead:
        if roadmap:
            first = roadmap[0]
            return NextBestActionRead(
                title=first.title,
                reasoning=(
                    f"{first.description} {recommended_focus}".strip()
                ),
                priority=first.priority,
                timing_category=first.timing_category,
            )

        return NextBestActionRead(
            title="Maintain case readiness",
            reasoning=recommended_focus,
            priority=ActionPriority.LATER,
            timing_category=TimingCategory.LATER,
        )
