try:
    from enum import StrEnum
except ImportError:  # pragma: no cover - Python < 3.11 fallback for local tooling
    from enum import Enum

    class StrEnum(str, Enum):
        pass


class UserStatus(StrEnum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"


class AuditEventType(StrEnum):
    USER_REGISTERED = "user_registered"
    USER_LOGGED_IN = "user_logged_in"
    CASE_CREATED = "case_created"
    CASE_UPDATED = "case_updated"
    CASE_OUTCOME_RECORDED = "case_outcome_recorded"
    CASE_OUTCOME_UPDATED = "case_outcome_updated"
    AI_STRATEGY_GENERATED = "ai_strategy_generated"
    AI_FEEDBACK_SUBMITTED = "ai_feedback_submitted"
    DOCUMENT_UPLOADED = "document_uploaded"


class AuditTargetEntityType(StrEnum):
    USER = "user"
    IMMIGRATION_CASE = "immigration_case"
    CASE_OUTCOME = "case_outcome"
    DOCUMENT = "document"
    AI_FEEDBACK = "ai_feedback"


class ImmigrationCaseStatus(StrEnum):
    DRAFT = "draft"
    IN_REVIEW = "in_review"
    ACTIVE = "active"
    CLOSED = "closed"


class PathwayProbabilityConfidenceLevel(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class DocumentUploadStatus(StrEnum):
    PENDING = "pending"
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    FAILED = "failed"


class CopilotMessageRole(StrEnum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class CaseOutcomeStatus(StrEnum):
    APPROVED = "approved"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"
    PENDING = "pending"


class AIFeature(StrEnum):
    STRATEGY = "strategy"
    COPILOT = "copilot"
    DOCUMENT_ANALYSIS = "document_analysis"
    COMPARISON = "comparison"


class AIFeedbackRating(StrEnum):
    POSITIVE = "positive"
    NEGATIVE = "negative"


class KnowledgeSourceType(StrEnum):
    GOVERNMENT_WEBSITE = "government_website"
    POLICY_MANUAL = "policy_manual"
    FORM_INSTRUCTIONS = "form_instructions"
    LEGAL_GUIDANCE = "legal_guidance"
    EXPERT_CONTENT = "expert_content"
    NEWS_ARTICLE = "news_article"
    INTERNAL_REFERENCE = "internal_reference"


class KnowledgeAuthorityLevel(StrEnum):
    PRIMARY = "primary"
    SECONDARY = "secondary"
    TERTIARY = "tertiary"


class MaritalStatus(StrEnum):
    SINGLE = "single"
    MARRIED = "married"
    DIVORCED = "divorced"
    SEPARATED = "separated"
    WIDOWED = "widowed"
    PARTNERED = "partnered"


class EducationLevel(StrEnum):
    HIGH_SCHOOL = "high_school"
    VOCATIONAL = "vocational"
    ASSOCIATE = "associate"
    BACHELOR = "bachelor"
    MASTER = "master"
    DOCTORATE = "doctorate"
    OTHER = "other"


class EnglishLevel(StrEnum):
    NONE = "none"
    BASIC = "basic"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"
    FLUENT = "fluent"
    NATIVE = "native"


class RelocationTimeline(StrEnum):
    IMMEDIATELY = "immediately"
    WITHIN_3_MONTHS = "within_3_months"
    WITHIN_6_MONTHS = "within_6_months"
    WITHIN_12_MONTHS = "within_12_months"
    EXPLORING = "exploring"
