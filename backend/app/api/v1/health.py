"""Health check endpoints for the VOTEX backend."""

from fastapi import APIRouter

from app.core.config import get_settings
from app.core.database import check_database_connection
from app.services.blockchain.provider import get_provider

router = APIRouter(tags=["health"])
settings = get_settings()


@router.get(
    "/health",
    summary="API liveness + component readiness",
    description=(
        "Reports API liveness plus readiness of the database and blockchain "
        "components. Never exposes secrets."
    ),
)
def health() -> dict:
    db_ok = check_database_connection()
    chain = get_provider().status()

    components = {
        "api": "ok",
        "database": "connected" if db_ok else "unavailable",
        "blockchain": "connected" if chain.connected else "unavailable",
    }
    overall = "ok" if db_ok else "degraded"
    return {
        "status": overall,
        "service": settings.app_name,
        "components": components,
        "chain_id": chain.chain_id,
    }


@router.get(
    "/health/db",
    summary="Database readiness probe",
    description="Reports PostgreSQL connectivity only.",
)
def database_health() -> dict[str, str]:
    connected = check_database_connection()
    return {
        "status": "ok" if connected else "degraded",
        "database": "connected" if connected else "unavailable",
    }
