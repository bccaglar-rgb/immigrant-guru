from sqlalchemy.sql.schema import CheckConstraint, UniqueConstraint

from app.models.ai_feedback import AIFeedback
from app.models.audit_log import AuditLog
from app.models.case_timeline_snapshot import CaseTimelineSnapshot
from app.models.case_outcome import CaseOutcome
from app.models.copilot_message import CopilotMessage
from app.models.copilot_thread import CopilotThread
from app.models.document import Document
from app.models.immigration_case import ImmigrationCase
from app.models.knowledge_chunk import KnowledgeChunk
from app.models.knowledge_source import KnowledgeSource
from app.models.user import User


def _constraint_names(model: type) -> set[str]:
    return {
        constraint.name
        for constraint in model.__table__.constraints
        if isinstance(constraint, (CheckConstraint, UniqueConstraint)) and constraint.name
    }


def test_user_table_enforces_normalized_email_and_password_integrity() -> None:
    constraint_names = _constraint_names(User)

    assert "ck_users_email_lowercase" in constraint_names
    assert "ck_users_email_not_blank" in constraint_names
    assert "ck_users_password_hash_not_blank" in constraint_names


def test_document_table_has_non_negative_and_non_blank_constraints() -> None:
    constraint_names = _constraint_names(Document)

    assert "ck_documents_filename_not_blank" in constraint_names
    assert "ck_documents_original_filename_not_blank" in constraint_names
    assert "ck_documents_storage_path_not_blank" in constraint_names
    assert "ck_documents_size_non_negative" in constraint_names
    assert "ck_documents_processing_attempts_non_negative" in constraint_names


def test_case_outcome_and_ai_feedback_tables_have_integrity_constraints() -> None:
    outcome_constraint_names = _constraint_names(CaseOutcome)
    feedback_constraint_names = _constraint_names(AIFeedback)

    assert "ck_case_outcomes_duration_months_non_negative" in outcome_constraint_names
    assert "ck_case_outcomes_final_pathway_not_blank" in outcome_constraint_names
    assert "uq_case_outcomes_case_id" in outcome_constraint_names
    assert "ck_ai_feedback_comment_not_blank" in feedback_constraint_names


def test_immigration_case_table_has_probability_constraints_and_defaults() -> None:
    constraint_names = _constraint_names(ImmigrationCase)

    assert "ck_immigration_cases_probability_score_range" in constraint_names
    assert (
        str(ImmigrationCase.__table__.c.probability_explanation_json.server_default.arg)
        == "'{}'::jsonb"
    )


def test_knowledge_tables_have_server_default_metadata_and_chunk_constraints() -> None:
    assert str(KnowledgeSource.__table__.c.metadata.server_default.arg) == "'{}'::jsonb"
    assert str(KnowledgeChunk.__table__.c.metadata.server_default.arg) == "'{}'::jsonb"
    assert str(AuditLog.__table__.c.metadata.server_default.arg) == "'{}'::jsonb"
    assert str(CaseTimelineSnapshot.__table__.c.simulation_json.server_default.arg) == "'{}'::jsonb"
    assert str(CopilotMessage.__table__.c.metadata_json.server_default.arg) == "'{}'::jsonb"

    constraint_names = _constraint_names(KnowledgeChunk)
    assert "uq_knowledge_chunks_source_chunk_index" in constraint_names
    assert "ck_knowledge_chunks_chunk_index_non_negative" in constraint_names
    assert "ck_knowledge_chunks_chunk_text_not_blank" in constraint_names


def test_parent_owned_relationships_use_passive_deletes() -> None:
    assert User.profile.property.passive_deletes is True
    assert User.immigration_cases.property.passive_deletes is True
    assert User.copilot_threads.property.passive_deletes is True
    assert User.copilot_messages.property.passive_deletes is True
    assert User.ai_feedback_entries.property.passive_deletes is True
    assert ImmigrationCase.copilot_threads.property.passive_deletes is True
    assert ImmigrationCase.copilot_messages.property.passive_deletes is True
    assert ImmigrationCase.ai_feedback_entries.property.passive_deletes is True
    assert ImmigrationCase.outcome.property.passive_deletes is True
    assert ImmigrationCase.timeline_snapshots.property.passive_deletes is True
    assert CopilotThread.messages.property.passive_deletes is True
    assert KnowledgeSource.chunks.property.passive_deletes is True
