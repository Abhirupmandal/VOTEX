"""Aggregates all v1 routers under a single prefix."""

from fastapi import APIRouter

from app.api.v1 import (
    ai,
    alerts,
    analytics,
    audit,
    blockchain,
    candidates,
    elections,
    guardian,
    health,
    votes,
    voters,
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router)
api_router.include_router(blockchain.router)
# AI Guardian routers are registered BEFORE the generic election router so the
# more specific "/elections/{id}/risk" style paths resolve deterministically.
api_router.include_router(guardian.router)
api_router.include_router(alerts.router)
api_router.include_router(ai.router)
api_router.include_router(elections.router)
api_router.include_router(candidates.router)
api_router.include_router(votes.router)
api_router.include_router(voters.router)
api_router.include_router(analytics.router)
api_router.include_router(audit.router)
