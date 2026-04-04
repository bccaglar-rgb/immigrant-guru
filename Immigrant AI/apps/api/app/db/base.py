from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)

import app.models.ai_feedback  # noqa: F401,E402
import app.models.audit_log  # noqa: F401,E402
import app.models.case_timeline_snapshot  # noqa: F401,E402
import app.models.case_outcome  # noqa: F401,E402
import app.models.copilot_message  # noqa: F401,E402
import app.models.copilot_thread  # noqa: F401,E402
import app.models.document  # noqa: F401,E402
import app.models.immigration_case  # noqa: F401,E402
import app.models.knowledge_chunk  # noqa: F401,E402
import app.models.knowledge_source  # noqa: F401,E402
import app.models.user  # noqa: F401,E402
import app.models.user_profile  # noqa: F401,E402
