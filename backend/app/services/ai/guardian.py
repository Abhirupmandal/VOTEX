"""AI Election Guardian orchestrator.

Ties the pipeline together: indexed telemetry -> feature engineering -> baseline
-> anomaly detection -> risk scoring -> explainability -> alerts -> persistence.

Design boundaries (enforced by construction and asserted by tests):

* The guardian reads ONLY from the indexed read model. It has no code path that
  writes to the blockchain or mutates election state, votes, candidate totals,
  voter registration, or results.
* On CRITICAL it raises a SECURITY ALERT and recommends human investigation. It
  never pauses, finalises, or otherwise changes an election.

Cold start
----------
Observations are counted as the number of analysis windows available for an
election. With fewer than ``ai_cold_start_min_observations`` (default 10) the
guardian reports ``CALIBRATING``, suppresses alerts, and labels the assessment
``cold_start`` rather than emitting an unfounded verdict. At or above the
threshold it reports ``MONITORING`` (or higher per the risk band).
"""

from __future__ import annotations

import threading
import time
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.database import SessionLocal
from app.core.logging import get_logger
from app.models.ai_feature_snapshot import AIFeatureSnapshot
from app.models.ai_risk_assessment import AIRiskAssessment
from app.models.election import Election
from app.services.ai import alert_engine, baseline, explainability, feature_engineering
from app.services.ai.anomaly_detector import AnomalyDetector
from app.services.ai.risk_engine import RiskEngine
from app.services.ai.schemas import (
    AI_GUARDIAN_VERSION,
    SIGNAL_NAMES,
    STATUS_CALIBRATING,
    STATUS_CRITICAL,
    STATUS_ELEVATED,
    STATUS_HIGH_RISK,
    STATUS_MONITORING,
    STATUS_OFFLINE,
    SignalResult,
    WindowFeatures,
    threat_level_for,
)
from app.services.elections import queries

logger = get_logger("votex.ai.guardian")

# Status mapping for a non-cold-start election by threat band.
_STATUS_BY_THREAT = {
    "NORMAL": STATUS_MONITORING,
    "ELEVATED": STATUS_ELEVATED,
    "HIGH": STATUS_HIGH_RISK,
    "CRITICAL": STATUS_CRITICAL,
}
_STATUS_ORDER = {
    STATUS_OFFLINE: 0,
    STATUS_CALIBRATING: 1,
    STATUS_MONITORING: 2,
    STATUS_ELEVATED: 3,
    STATUS_HIGH_RISK: 4,
    STATUS_CRITICAL: 5,
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


class AIGuardian:
    """Supervisory AI analysis over an election's indexed telemetry."""

    def __init__(
        self,
        settings: Settings | None = None,
        detector: AnomalyDetector | None = None,
        risk_engine: RiskEngine | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.detector = detector or AnomalyDetector(
            n_estimators=self.settings.ai_iforest_n_estimators,
            contamination=self.settings.ai_iforest_contamination,
            random_state=self.settings.ai_iforest_random_state,
        )
        self.risk_engine = risk_engine or RiskEngine()
        self.model_version = AI_GUARDIAN_VERSION

    # -- Persistence helpers ---------------------------------------------

    def _upsert_snapshot(
        self, session: Session, features: WindowFeatures
    ) -> AIFeatureSnapshot:
        row = session.scalar(
            select(AIFeatureSnapshot).where(
                AIFeatureSnapshot.election_id == features.election_id,
                AIFeatureSnapshot.window_start == features.window_start,
                AIFeatureSnapshot.window_end == features.window_end,
            )
        )
        data = features.as_dict()
        if row is None:
            row = AIFeatureSnapshot(**data)
            session.add(row)
            session.flush()
            return row
        for key, value in data.items():
            if key != "election_id":
                setattr(row, key, value)
        session.flush()
        return row

    # -- Core analysis ----------------------------------------------------

    def analyze_election(
        self, session: Session, election: Election, *, persist: bool = True
    ) -> dict:
        """Run the full pipeline for one election and (optionally) persist it."""
        logger.info(
            "analysis_started",
            extra={
                "event": "analysis_started",
                "election_id": election.blockchain_election_id,
                "model_version": self.model_version,
            },
        )
        try:
            result = self._analyze(session, election, persist=persist)
        except Exception as exc:  # noqa: BLE001 - never crash the caller
            logger.error(
                "analysis_failed",
                extra={
                    "event": "analysis_failed",
                    "election_id": election.blockchain_election_id,
                    "model_version": self.model_version,
                    "error": str(exc),
                },
            )
            raise

        logger.info(
            "analysis_completed",
            extra={
                "event": "analysis_completed",
                "election_id": election.blockchain_election_id,
                "risk_score": result["risk_score"],
                "threat_level": result["threat_level"],
                "model_version": self.model_version,
            },
        )
        return result

    def _analyze(self, session: Session, election: Election, *, persist: bool) -> dict:
        candidates = queries.list_candidates(session, election)
        expected_candidates = len(candidates)
        points = feature_engineering.collect_votes(session, election)
        window_seconds = self.settings.ai_window_seconds

        if not points:
            # Nothing indexed yet: a neutral, honest CALIBRATING assessment.
            window_end = int(election.voting_start or 0)
            window_start = window_end - window_seconds
            features = WindowFeatures(
                election_id=election.id,
                window_start=window_start,
                window_end=window_end,
            )
            signals = {
                name: SignalResult(name=name, detail="No indexed votes yet.")
                for name in SIGNAL_NAMES
            }
            risk = self.risk_engine.score(signals)
            cold_start = True
            series = [features]
        else:
            first_ts = min(p.timestamp for p in points)
            last_ts = max(p.timestamp for p in points)
            # Align windows to the first vote so buckets are stable across runs.
            window_start = first_ts
            window_end = last_ts + 1
            series = feature_engineering.build_series(
                election_id=election.id,
                points=points,
                window_start=window_start,
                window_end=window_end,
                window_seconds=window_seconds,
                expected_candidate_count=expected_candidates,
                baseline_window=self.settings.ai_baseline_window,
            )
            current = series[-1]
            history = series[:-1]
            if self.settings.ai_baseline_window > 0:
                history = history[-self.settings.ai_baseline_window :]

            context = self.detector.build_context(history)
            self.detector.train_ml(history)
            signals = self.detector.detect(current, context)
            risk = self.risk_engine.score(signals)

            observations = len(series)
            cold_start = observations < self.settings.ai_cold_start_min_observations
            features = current

        if cold_start:
            guardian_status = STATUS_CALIBRATING
        else:
            guardian_status = _STATUS_BY_THREAT.get(risk.threat_level, STATUS_MONITORING)

        explanation = explainability.build_explanation_payload(
            features, signals, risk, cold_start=cold_start
        )

        # Anomaly logging (one event per anomalous signal).
        for name, signal in signals.items():
            if signal.anomalous:
                logger.info(
                    "anomaly_detected",
                    extra={
                        "event": "anomaly_detected",
                        "election_id": election.blockchain_election_id,
                        "signal": name,
                        "severity": round(signal.severity, 4),
                        "model_version": self.model_version,
                    },
                )
        logger.info(
            "risk_score_generated",
            extra={
                "event": "risk_score_generated",
                "election_id": election.blockchain_election_id,
                "risk_score": risk.score,
                "threat_level": risk.threat_level,
                "model_version": self.model_version,
            },
        )

        alerts = []
        if persist:
            # Persist feature snapshots (history + current) and the assessment.
            snapshot_id = None
            for window in series:
                row = self._upsert_snapshot(session, window)
                snapshot_id = row.id
            if not cold_start:
                alerts = alert_engine.generate_alerts(
                    session,
                    election,
                    features,
                    signals,
                    risk,
                    self.model_version,
                )
            assessment = AIRiskAssessment(
                election_id=election.id,
                risk_score=risk.score,
                threat_level=risk.threat_level,
                guardian_status=guardian_status,
                model_version=self.model_version,
                analysis_window_start=features.window_start,
                analysis_window_end=features.window_end,
                signals=[s.as_dict() for s in signals.values()],
                explanation=explanation,
                feature_snapshot_id=snapshot_id,
            )
            session.add(assessment)
            session.commit()

        return {
            "election_id": election.blockchain_election_id,
            "risk_score": risk.score,
            "threat_level": risk.threat_level,
            "guardian_status": guardian_status,
            "cold_start": cold_start,
            "signals": [s.as_dict() for s in signals.values()],
            "contributions": risk.contributions,
            "explanation": explanation,
            "features": features.as_payload(),
            "window_start": features.window_start,
            "window_end": features.window_end,
            "analyzed_at": _now().isoformat(),
            "model_version": self.model_version,
            "alerts_created": len(alerts),
            "observations": len(series),
        }

    # -- Read helpers -----------------------------------------------------

    def latest_assessment(
        self, session: Session, election: Election
    ) -> AIRiskAssessment | None:
        return session.scalar(
            select(AIRiskAssessment)
            .where(AIRiskAssessment.election_id == election.id)
            .order_by(AIRiskAssessment.created_at.desc(), AIRiskAssessment.id.desc())
        )

    def election_risk(self, session: Session, election: Election) -> dict:
        """Return the latest persisted risk for an election, or a neutral view."""
        assessment = self.latest_assessment(session, election)
        active = alert_engine.count_active(session, election.id)
        if assessment is None:
            return {
                "election_id": election.blockchain_election_id,
                "risk_score": 0,
                "threat_level": "NORMAL",
                "guardian_status": STATUS_CALIBRATING,
                "signals": [],
                "analyzed_at": None,
                "active_alerts": active,
                "model_version": self.model_version,
                "actionable": False,
            }
        return {
            "election_id": election.blockchain_election_id,
            "risk_score": int(assessment.risk_score),
            "threat_level": assessment.threat_level,
            "guardian_status": assessment.guardian_status,
            "signals": assessment.signals,
            "explanation": assessment.explanation,
            "window_start": assessment.analysis_window_start,
            "window_end": assessment.analysis_window_end,
            "analyzed_at": assessment.created_at.isoformat()
            if assessment.created_at
            else None,
            "active_alerts": active,
            "model_version": assessment.model_version,
            "recommendation": (assessment.explanation or {}).get("recommendation"),
            # AI never executes actions; any response is human-gated.
            "actionable": assessment.guardian_status
            in (STATUS_ELEVATED, STATUS_HIGH_RISK, STATUS_CRITICAL),
        }

    def status(self, session: Session) -> dict:
        """Return the aggregate guardian status (SOC-facing summary)."""
        elections = list(session.scalars(select(Election)).all())
        active_alerts = alert_engine.count_active(session)
        if not elections:
            return {
                "status": STATUS_OFFLINE,
                "risk_score": 0,
                "threat_level": "NORMAL",
                "last_analysis": None,
                "active_alerts": active_alerts,
                "elections_monitored": 0,
                "model_version": self.model_version,
            }

        latest: AIRiskAssessment | None = None
        for election in elections:
            assessment = self.latest_assessment(session, election)
            if assessment is None:
                continue
            if latest is None or (
                (assessment.created_at or datetime.min.replace(tzinfo=timezone.utc))
                > (latest.created_at or datetime.min.replace(tzinfo=timezone.utc))
            ):
                latest = assessment

        if latest is None:
            return {
                "status": STATUS_CALIBRATING,
                "risk_score": 0,
                "threat_level": "NORMAL",
                "last_analysis": None,
                "active_alerts": active_alerts,
                "elections_monitored": len(elections),
                "model_version": self.model_version,
            }

        return {
            "status": latest.guardian_status,
            "risk_score": int(latest.risk_score),
            "threat_level": latest.threat_level,
            "last_analysis": latest.created_at.isoformat()
            if latest.created_at
            else None,
            "active_alerts": active_alerts,
            "elections_monitored": len(elections),
            "model_version": latest.model_version,
        }

    def run_analysis(self, session: Session) -> list[dict]:
        """Analyze every indexed election (used by the API and the worker)."""
        results: list[dict] = []
        for election in session.scalars(select(Election)).all():
            try:
                results.append(self.analyze_election(session, election))
            except Exception as exc:  # noqa: BLE001 - one failure must not stop all
                logger.error(
                    "analysis_failed",
                    extra={
                        "event": "analysis_failed",
                        "election_id": election.blockchain_election_id,
                        "model_version": self.model_version,
                        "error": str(exc),
                    },
                )
        return results


class PeriodicAnalyzer:
    """A simple, safe periodic analysis worker.

    * Runs in a daemon thread; :meth:`stop` signals it and joins cleanly.
    * Never overlaps runs (a single loop) and swallows per-iteration failures,
      logging them instead of crashing the FastAPI process.
    """

    def __init__(self, interval: float | None = None, guardian: AIGuardian | None = None):
        self.settings = get_settings()
        self.interval = interval or self.settings.ai_analysis_interval
        self.guardian = guardian or AIGuardian(settings=self.settings)
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run, name="ai-guardian-worker", daemon=True
        )
        self._thread.start()
        logger.info(
            "analysis_worker_started",
            extra={"event": "analysis_worker_started", "interval": self.interval},
        )

    def stop(self, timeout: float = 5.0) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=timeout)
            self._thread = None
        logger.info("analysis_worker_stopped", extra={"event": "analysis_worker_stopped"})

    def run_once(self) -> list[dict]:
        """Run a single analysis pass over all elections."""
        session = SessionLocal()
        try:
            return self.guardian.run_analysis(session)
        finally:
            session.close()

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                self.run_once()
            except Exception as exc:  # noqa: BLE001 - keep the worker alive
                logger.error(
                    "analysis_failed",
                    extra={"event": "analysis_failed", "error": str(exc)},
                )
            # Interruptible wait so shutdown is prompt.
            self._stop.wait(self.interval)


def guardian_summary_from_assessments(assessments: list[dict]) -> dict:
    """Fold per-election analyses into an aggregate status without extra I/O."""
    if not assessments:
        return {
            "status": STATUS_OFFLINE,
            "risk_score": 0,
            "threat_level": "NORMAL",
            "active_alerts": 0,
        }
    top = max(assessments, key=lambda a: a["risk_score"])
    return {
        "status": top["guardian_status"],
        "risk_score": top["risk_score"],
        "threat_level": top["threat_level"],
        "active_alerts": sum(a.get("alerts_created", 0) for a in assessments),
    }
