"""Explainability for the AI Election Guardian.

Produces human-readable reasons grounded in the ACTUAL measured feature values
and per-signal contributions. No generic, model-authored prose is generated —
every sentence is templated from numbers computed by the detectors.

Feature-contribution approach
-----------------------------
SHAP is intentionally NOT used here. The detector is a hybrid of transparent
statistical rules and a small Isolation Forest; a SHAP explanation of the forest
alone would not explain the composite score and would add a heavy, brittle
dependency for a signal that carries only a 10% weight. Instead we compute a
**deterministic additive contribution** (``severity * weight``) that is exactly
the quantity used to build the score — it is fully reproducible and auditable.
This limitation is documented in ``docs/architecture/ai-guardian.md``.
"""

from __future__ import annotations

from app.services.ai.schemas import (
    RECOMMENDATION_HUMAN_INVESTIGATION,
    SIGNAL_LABELS,
    RiskResult,
    SignalResult,
    WindowFeatures,
)

# A signal is reported as a "reason" when its contribution points clear this.
REASON_POINTS_THRESHOLD = 4.0


def build_explanation(
    features: WindowFeatures,
    signals: dict[str, SignalResult],
    risk: RiskResult,
) -> list[str]:
    """Return ordered, value-grounded reasons for the risk score."""
    reasons: list[str] = []

    velocity = signals.get("velocity")
    if velocity and velocity.anomalous and features.velocity_zscore is not None:
        reasons.append(
            f"Voting velocity is {features.velocity_zscore:.2f}σ above the "
            f"rolling baseline ({features.voting_velocity:.2f} votes/min)."
        )
    elif velocity and velocity.severity >= 0.4:
        reasons.append(
            f"Voting velocity is elevated ({features.voting_velocity:.2f} "
            f"votes/min, z={features.velocity_zscore or 0:.2f})."
        )

    inter = signals.get("interarrival")
    if inter and inter.anomalous and inter.value is not None:
        reasons.append(
            f"Median inter-arrival time dropped by {inter.value:.1f}% versus "
            "baseline (compressed voting)."
        )

    temporal = signals.get("temporal")
    if temporal and temporal.anomalous:
        reasons.append(
            f"Temporal concentration anomaly: {features.burst_concentration * 100:.0f}% "
            "of votes fall in a single 60s bucket."
        )

    wallet = signals.get("wallet")
    if wallet and wallet.anomalous:
        reasons.append(
            f"Wallet concentration anomaly: one wallet cast "
            f"{features.wallet_concentration * 100:.0f}% of window votes."
        )

    dist = signals.get("distribution")
    if dist and dist.anomalous and features.candidate_entropy is not None:
        reasons.append(
            f"Candidate distribution anomaly: entropy {features.candidate_entropy:.3f} "
            "is well below the expected spread."
        )

    ml = signals.get("ml")
    if ml and ml.anomalous:
        reasons.append(
            "ML detector classified the current window as anomalous "
            "(Isolation Forest)."
        )

    gas = signals.get("gas")
    if gas and gas.anomalous:
        reasons.append("Gas behaviour deviates from the rolling baseline.")

    # Fallback: if nothing crossed the anomaly flags, surface the top
    # contributions so the score is never unexplained.
    if not reasons:
        for contribution in risk.contributions:
            if contribution["points"] >= REASON_POINTS_THRESHOLD:
                label = SIGNAL_LABELS.get(contribution["signal"], contribution["signal"])
                reasons.append(
                    f"{label} contributed {contribution['points']:.1f} points "
                    f"(severity {contribution['severity'] * 100:.0f}%)."
                )
        if not reasons:
            reasons.append("No signal materially exceeded its baseline.")

    return reasons


def build_explanation_payload(
    features: WindowFeatures,
    signals: dict[str, SignalResult],
    risk: RiskResult,
    *,
    cold_start: bool,
) -> dict:
    """Return the persisted explanation payload (reasons + contributions + rec)."""
    reasons = build_explanation(features, signals, risk)
    recommendation = (
        RECOMMENDATION_HUMAN_INVESTIGATION
        if risk.threat_level in ("HIGH", "CRITICAL")
        else "Continue monitoring."
    )
    return {
        "summary": (
            f"AI Guardian assessed risk {risk.score}/100 "
            f"({risk.threat_level}) for the window "
            f"[{features.window_start}, {features.window_end}]."
        ),
        "reasons": reasons,
        "top_signals": [
            {
                "signal": c["signal"],
                "label": c["label"],
                "points": c["points"],
                "severity": c["severity"],
            }
            for c in risk.contributions[:5]
        ],
        "recommendation": recommendation,
        "cold_start": cold_start,
        "disclaimer": (
            "AI Guardian detects anomalous behaviour; it does not prove "
            "electoral fraud and does not control election state or vote totals."
        ),
    }
