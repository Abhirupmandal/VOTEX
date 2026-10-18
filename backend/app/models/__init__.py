"""ORM models package.

Re-exports ``Base`` plus every domain model so Alembic autogeneration and the
application can import a single metadata surface.
"""

from app.core.database import Base
from app.models.ai_alert import AIAlert
from app.models.ai_feature_snapshot import AIFeatureSnapshot
from app.models.ai_risk_assessment import AIRiskAssessment
from app.models.blockchain_event import BlockchainEvent
from app.models.candidate import Candidate
from app.models.election import Election
from app.models.indexer_state import IndexerState
from app.models.vote import Vote
from app.models.voter import Voter

__all__ = [
    "Base",
    "Election",
    "Candidate",
    "Voter",
    "Vote",
    "BlockchainEvent",
    "IndexerState",
    "AIFeatureSnapshot",
    "AIAlert",
    "AIRiskAssessment",
]
