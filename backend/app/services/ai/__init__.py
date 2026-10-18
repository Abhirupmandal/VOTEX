"""VOTEX AI Election Guardian.

A SUPERVISORY anomaly-detection system. It observes indexed voting telemetry and
produces advisory risk assessments and security alerts. It never modifies votes,
candidate totals, election state, voter registration, or results, and it never
executes emergency actions — any such action requires explicit authorised human
intervention.

This package initializer is intentionally lightweight (it does not import the
orchestrator) so submodules can import one another without a cycle. Import the
orchestrator explicitly::

    from app.services.ai.guardian import AIGuardian, AI_GUARDIAN_VERSION
"""

from app.services.ai.schemas import AI_GUARDIAN_VERSION

__all__ = ["AI_GUARDIAN_VERSION"]
