"""Phase 4 demo: generate synthetic telemetry and run the AI Election Guardian.

This script is a thin, honest wrapper around two components:

* :mod:`app.services.ai.synthetic` — deterministic TEST/DEMO telemetry generator
  (6 scenarios), and
* :class:`app.services.ai.guardian.AIGuardian` — the full analysis pipeline.

It **never fabricates** results: every number printed (voting velocity, z-score,
ML detection, risk score, threat level, reasons, recommendation) is computed live
by the guardian from the synthetic rows and then persisted to PostgreSQL. The
generated election is explicitly tagged ``TEST/DEMO DATA`` and is written to a
dedicated demo election id so real election records are never touched.

Usage (from ``votex/backend``, with the venv active and PostgreSQL reachable)::

    python scripts/generate_ai_demo_data.py --scenario normal
    python scripts/generate_ai_demo_data.py --scenario burst
    python scripts/generate_ai_demo_data.py --all
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

# Allow running this file directly (``python scripts/generate_ai_demo_data.py``)
# by putting the backend root on sys.path so the ``app`` package is importable.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.database import SessionLocal, check_database_connection
from app.services.ai import synthetic
from app.services.ai.guardian import AIGuardian

# Signal explanations use mathematical symbols (e.g. σ for standard deviation).
# Force UTF-8 output so the demo renders correctly on Windows consoles whose
# default code page (cp1252) cannot encode them.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

_SEPARATOR = "=" * 72
# A deliberately high id so the demo never collides with real deployment ids.
_DEMO_ELECTION_ID = 900001


def _print_header(title: str) -> None:
    print(_SEPARATOR)
    print(title)
    print(_SEPARATOR)


def _print_status(label: str, value: object) -> None:
    print(f"  {label:<30}: {value}")


def _fmt(value: Any, digits: int = 3) -> str:
    """Render a float to a fixed precision, passing through anything else."""
    if isinstance(value, float):
        return f"{value:.{digits}f}"
    return str(value)


def _print_analysis(result: dict) -> None:
    """Print the ACTUAL guardian output for one scenario."""
    features = result["features"]
    explanation = result["explanation"]

    _print_header(f"GUARDIAN ANALYSIS — election {result['election_id']}")
    _print_status("Model version", result["model_version"])
    _print_status("Observations", result["observations"])
    _print_status("Cold start", result["cold_start"])
    _print_status("Guardian status", result["guardian_status"])

    print("\n  -- Windowed features (live) --")
    _print_status("Window start (unix)", features["window_start"])
    _print_status("Window end (unix)", features["window_end"])
    _print_status("Vote count", features["vote_count"])
    _print_status("Voting velocity (/min)", _fmt(features["voting_velocity"]))
    _print_status("Mean inter-arrival (s)", _fmt(features["mean_interarrival"]))
    _print_status("Median inter-arrival (s)", _fmt(features["median_interarrival"]))
    _print_status("Velocity z-score", _fmt(features["velocity_zscore"]))
    _print_status("Candidate entropy", _fmt(features["candidate_entropy"]))
    _print_status("Unique voters", features["unique_voters"])
    _print_status("Burst concentration", _fmt(features["burst_concentration"]))

    print("\n  -- Signal severities (0..1) --")
    for signal in result["signals"]:
        flag = "ANOMALY" if signal["anomalous"] else "ok"
        print(
            f"    {signal['signal']:<22}: sev={_fmt(signal['severity'])} "
            f"[{flag}] {signal['detail']}"
        )

    print("\n  -- Risk --")
    _print_status("Risk score (0..100)", result["risk_score"])
    _print_status("Threat level", result["threat_level"])
    _print_status("Alerts created/updated", result["alerts_created"])

    print("\n  -- Top contributing signals --")
    for contribution in result["contributions"][:5]:
        print(
            f"    {contribution['signal']:<22}: "
            f"sev={_fmt(contribution['severity'])} "
            f"weight={_fmt(contribution['weight'])} "
            f"points={_fmt(contribution['points'])}"
        )

    print("\n  -- Explanation (value-grounded) --")
    print(f"    Summary: {explanation['summary']}")
    for reason in explanation["reasons"]:
        print(f"    - {reason}")
    print(f"    Recommendation: {explanation['recommendation']}")
    print(f"    Disclaimer: {explanation['disclaimer']}")


def _run_scenario(scenario: str, *, seed: int) -> int:
    """Generate one scenario, analyse it, and return a process exit code."""
    _print_header(f"SCENARIO: {scenario}  ({synthetic.DEMO_MARKER})")
    session = SessionLocal()
    try:
        election = synthetic.ensure_demo_election(
            session,
            blockchain_election_id=_DEMO_ELECTION_ID,
            scenario=scenario,
            seed=seed,
        )
        _print_status("Seeded election id", election.blockchain_election_id)
        _print_status("Seeded title", election.title)
        _print_status("Seeded votes", election.total_votes)
        _print_status("Seeded unique voters", election.total_registered_voters)

        guardian = AIGuardian()
        result = guardian.analyze_election(session, election, persist=True)
        _print_analysis(result)
        return 0
    except Exception as exc:  # noqa: BLE001 - surface the real failure verbatim
        print(f"\n[ERROR] scenario {scenario!r} failed: {exc}")
        return 1
    finally:
        session.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Generate synthetic telemetry and run the AI Election Guardian."
    )
    parser.add_argument(
        "--scenario",
        choices=synthetic.SCENARIOS,
        default="normal",
        help="Synthetic scenario to generate and analyse.",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Run every scenario in sequence.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=1337,
        help="Deterministic RNG seed for the generator.",
    )
    args = parser.parse_args(argv)

    _print_header("VOTEX PHASE 4 DEMO — ENVIRONMENT")
    _print_status("Database reachable", check_database_connection())
    _print_status("Demo marker", synthetic.DEMO_MARKER)
    _print_status("Demo election id", _DEMO_ELECTION_ID)
    if not check_database_connection():
        print("\n[ERROR] No database reachable. Apply migrations and retry.")
        return 1

    scenarios = list(synthetic.SCENARIOS) if args.all else [args.scenario]
    exit_code = 0
    for scenario in scenarios:
        print()
        code = _run_scenario(scenario, seed=args.seed)
        if code != 0:
            exit_code = code

    print()
    _print_header("DEMO COMPLETE")
    print(
        "All figures above are computed live by the AI Guardian and persisted as "
        "TEST/DEMO DATA.\nThe AI Guardian detects anomalous behaviour; it does not "
        "prove electoral fraud and never controls election state or vote totals."
    )
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
