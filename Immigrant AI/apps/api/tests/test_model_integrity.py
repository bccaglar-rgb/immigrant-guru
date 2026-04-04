from sqlalchemy.sql.schema import CheckConstraint, UniqueConstraint

from app.models.audit_log import AuditLog
from app.models.document import Document
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


def test_knowledge_tables_have_server_default_metadata_and_chunk_constraints() -> None:
    assert str(KnowledgeSource.__table__.c.metadata.server_default.arg) == "'{}'::jsonb"
    assert str(KnowledgeChunk.__table__.c.metadata.server_default.arg) == "'{}'::jsonb"
    assert str(AuditLog.__table__.c.metadata.server_default.arg) == "'{}'::jsonb"

    constraint_names = _constraint_names(KnowledgeChunk)
    assert "uq_knowledge_chunks_source_chunk_index" in constraint_names
    assert "ck_knowledge_chunks_chunk_index_non_negative" in constraint_names
    assert "ck_knowledge_chunks_chunk_text_not_blank" in constraint_names


def test_parent_owned_relationships_use_passive_deletes() -> None:
    assert User.profile.property.passive_deletes is True
    assert User.immigration_cases.property.passive_deletes is True
    assert KnowledgeSource.chunks.property.passive_deletes is True
