from fastapi import APIRouter

from app.api.routes.ai import router as ai_router
from app.api.routes.admin_kb import router as admin_kb_router
from app.api.routes.auth import router as auth_router
from app.api.routes.cases import router as cases_router
from app.api.routes.database import router as database_router
from app.api.routes.health import router as health_router
from app.api.routes.kb import router as kb_router
from app.api.routes.profile import router as profile_router
from app.api.routes.users import router as users_router
from app.api.routes.version import router as version_router

api_router = APIRouter()
api_router.include_router(admin_kb_router)
api_router.include_router(ai_router)
api_router.include_router(auth_router)
api_router.include_router(cases_router)
api_router.include_router(database_router)
api_router.include_router(health_router)
api_router.include_router(kb_router)
api_router.include_router(profile_router)
api_router.include_router(users_router)
api_router.include_router(version_router)
