from __future__ import annotations

from app.models.immigration_case import ImmigrationCase
from app.models.user_profile import UserProfile
from app.schemas.workspace import (
    ActionPriority,
    ActionRoadmapItemRead,
    ChecklistItemStatus,
    ChecklistRequirementLevel,
    DocumentChecklistItemRead,
    TimingCategory,
)
from app.services.ai.missing_information_service import MissingInformationEvaluation
from app.services.ai.scoring_helpers import is_present


class ActionRoadmapService:
    """Create a structured roadmap from current case and profile readiness."""

    def build(
        self,
        *,
        profile: UserProfile,
        immigration_case: ImmigrationCase,
        checklist: list[DocumentChecklistItemRead],
        missing_information: MissingInformationEvaluation,
    ) -> list[ActionRoadmapItemRead]:
        roadmap: list[ActionRoadmapItemRead] = []

        def add_item(
            *,
            item_id: str,
            title: str,
            description: str,
            priority: ActionPriority,
            timing_category: TimingCategory,
            dependency_notes: str | None = None,
        ) -> None:
            if any(item.id == item_id for item in roadmap):
                return
            roadmap.append(
                ActionRoadmapItemRead(
                    id=item_id,
                    title=title,
                    description=description,
                    priority=priority,
                    timing_category=timing_category,
                    dependency_notes=dependency_notes,
                )
            )

        if missing_information.critical_items:
            add_item(
                item_id="critical_inputs",
                title="Resolve critical profile and case inputs",
                description="Complete the high-impact fields that currently weaken route comparison, eligibility interpretation, and document planning.",
                priority=ActionPriority.IMMEDIATE,
                timing_category=TimingCategory.NOW,
                dependency_notes="Strategy quality and case health remain constrained until these inputs are present.",
            )

        if not is_present(immigration_case.target_program):
            add_item(
                item_id="define_pathway",
                title="Clarify the target pathway",
                description="Choose the most likely immigration program or route so evidence and preparation can be sequenced properly.",
                priority=ActionPriority.IMMEDIATE,
                timing_category=TimingCategory.NOW,
                dependency_notes="Roadmap depth improves once the pathway is explicit.",
            )

        missing_required_items = [
            item
            for item in checklist
            if item.requirement_level == ChecklistRequirementLevel.REQUIRED
            and item.status == ChecklistItemStatus.MISSING
        ]
        if missing_required_items:
            add_item(
                item_id="collect_required_documents",
                title="Collect required case evidence",
                description="Upload the core documents the case is still missing so readiness can move beyond planning.",
                priority=ActionPriority.IMMEDIATE,
                timing_category=TimingCategory.THIS_WEEK,
                dependency_notes=f"Start with {missing_required_items[0].document_name.lower()}.",
            )

        failed_items = [
            item for item in checklist if item.status == ChecklistItemStatus.FAILED
        ]
        if failed_items:
            add_item(
                item_id="repair_failed_uploads",
                title="Repair failed document uploads",
                description="One or more uploaded files did not finish processing, so the evidence set is not yet reliable.",
                priority=ActionPriority.IMMEDIATE,
                timing_category=TimingCategory.NOW,
                dependency_notes="Re-upload or replace the failed files before relying on them in the workspace.",
            )

        processing_items = [
            item for item in checklist if item.status == ChecklistItemStatus.PROCESSING
        ]
        if processing_items:
            add_item(
                item_id="review_processing_results",
                title="Review processing results",
                description="Some uploaded files are still being processed in the background and should be verified before further preparation.",
                priority=ActionPriority.SOON,
                timing_category=TimingCategory.THIS_WEEK,
            )

        if not is_present(immigration_case.current_stage):
            add_item(
                item_id="set_case_stage",
                title="Define the current case stage",
                description="Mark the present execution stage so timing, sequencing, and next-step guidance can become more concrete.",
                priority=ActionPriority.SOON,
                timing_category=TimingCategory.THIS_WEEK,
            )

        if not is_present(immigration_case.notes):
            add_item(
                item_id="capture_case_context",
                title="Capture strategic notes",
                description="Record assumptions, blockers, and route-specific context so future strategy refreshes are less ambiguous.",
                priority=ActionPriority.SOON,
                timing_category=TimingCategory.THIS_MONTH,
            )

        if is_present(profile.profession) and is_present(profile.years_of_experience):
            add_item(
                item_id="strengthen_evidence_package",
                title="Strengthen the professional evidence package",
                description="Assemble stronger supporting records for work history, qualifications, and impact before expert review or filing preparation.",
                priority=ActionPriority.LATER,
                timing_category=TimingCategory.THIS_MONTH,
            )

        if not roadmap:
            add_item(
                item_id="monitor_case",
                title="Maintain current case momentum",
                description="The case workspace is comparatively complete. Keep documents current and refresh strategy when material facts change.",
                priority=ActionPriority.LATER,
                timing_category=TimingCategory.LATER,
            )

        return roadmap[:6]
