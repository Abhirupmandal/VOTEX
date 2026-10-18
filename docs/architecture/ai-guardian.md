# AI Election Guardian (Phase 4)

The AI Election Guardian is a **supervisory** anomaly-detection service that
observes a Votex election's *indexed* telemetry and raises explainable risk
signals for human review.

> **Safety boundary.** The guardian is read-only with respect to election
> authority. It never writes to the blockchain, never mutates election state,
> vote totals, candidate tallies, voter registration, or results, and has no
> capability to pause, finalise, or declare an election. On a critical verdict it
> raises a SECURITY ALERT and recommends **human investigation only**. This is
> enforced by construction and pinned by tests (`test_ai_guardian.py`,
> `test_ai_alerts.py`).

---

## 1. Position in the system

```
Hardhat chain ──events──▶ Event processor ──writes──▶ PostgreSQL (indexed read model)
                                                              │
                                                              ▼
                                        ┌───────────────────────────────────┐
                                        │            AIGuardian             │
                                        │  features → baseline → detect →   │
                                        │  score → explain → alerts → store │
                                        └───────────────────────────────────┘
                                                              │
                                                              ▼
                                             REST API (supervisory outputs)
```

The guardian reads only the **indexed read model** (the same tables the audit
and analytics services use). It is a *downstream consumer*: nothing it produces
flows back into the chain or the indexer.

---

## 2. Module map

| Module | Responsibility |
| --- | --- |
| [`schemas.py`](../../backend/app/services/ai/schemas.py) | Constants, weights, threat bands, `WindowFeatures`, `SignalResult`, `RiskResult` |
| [`baseline.py`](../../backend/app/services/ai/baseline.py) | Deterministic rolling / EWMA / IQR statistics |
| [`feature_engineering.py`](../../backend/app/services/ai/feature_engineering.py) | Turns vote rows into windowed behavioural features |
| [`anomaly_detector.py`](../../backend/app/services/ai/anomaly_detector.py) | Six statistical signals + Isolation Forest (`ml` signal) |
| [`risk_engine.py`](../../backend/app/services/ai/risk_engine.py) | Weighted, bounded 0–100 aggregation → threat level |
| [`explainability.py`](../../backend/app/services/ai/explainability.py) | Value-grounded summary, reasons, recommendation |
| [`alert_engine.py`](../../backend/app/services/ai/alert_engine.py) | Alert generation, dedup, and status transitions |
| [`guardian.py`](../../backend/app/services/ai/guardian.py) | Orchestration, cold start, versioning, persistence, worker |
| [`synthetic.py`](../../backend/app/services/ai/synthetic.py) | Deterministic `TEST/DEMO DATA` telemetry (6 scenarios) |

---

## 3. Pipeline

1. **Collect** — read indexed votes for the election over the analysis window.
2. **Feature engineering** — build a [`WindowFeatures`](../../backend/app/services/ai/schemas.py:136)
   vector: vote count, voting velocity, inter-arrival mean/median, velocity
   z-score, candidate entropy, unique voters, gas mean/std, plus detector-only
   features (burst concentration, wallet concentration, night fraction).
3. **Baseline** — compute rolling statistics (mean, median, stddev, IQR bounds,
   EWMA) over the preceding `ai_baseline_window` snapshots.
4. **Detect** — the [`AnomalyDetector`](../../backend/app/services/ai/anomaly_detector.py) emits `SignalResult`s:
   * `velocity` — z-score vs rolling baseline
   * `interarrival` — relative compression of inter-arrival time
   * `temporal` — share of votes in the busiest 60s bucket
   * `wallet` — single-wallet concentration
   * `candidate_distribution` — entropy collapse vs the field maximum
   * `gas` — gas dispersion ratio
   * `ml` — Isolation Forest prediction (inert until it has enough history)
5. **Score** — [`RiskEngine`](../../backend/app/services/ai/risk_engine.py) aggregates
   severities with documented weights into a bounded 0–100 score.
6. **Explain** — [`explainability`](../../backend/app/services/ai/explainability.py)
   produces a summary, value-grounded reasons, and a recommendation.
7. **Alert** — [`alert_engine`](../../backend/app/services/ai/alert_engine.py) raises and
   de-duplicates alerts (suppressed during cold start).
8. **Persist** — snapshot + assessment + alerts are written to the AI tables.

---

## 4. Scoring model

Severity is normalised to `[0, 1]` per signal; the score is

```
score = round( Σ  clamp(severity_s) · weight_s · 100 )   clamped to [0, 100]
```

Documented weights (sum = 1.0):

| Signal | Weight |
| --- | ---: |
| velocity | 0.25 |
| interarrival | 0.20 |
| temporal | 0.15 |
| wallet | 0.15 |
| candidate_distribution | 0.10 |
| ml | 0.10 |
| gas | 0.05 |

Because a single signal contributes at most its weight × 100, **no single
saturated signal can reach the CRITICAL band** (defence in depth).

Threat bands:

| Score | Threat level | Guardian status |
| ---: | --- | --- |
| 0–29 | `NORMAL` | `MONITORING` |
| 30–59 | `ELEVATED` | `ELEVATED` |
| 60–84 | `HIGH` | `HIGH_RISK` |
| 85–100 | `CRITICAL` | `CRITICAL` |

---

## 5. Cold start

Observations = number of analysis windows available for the election. Below
`ai_cold_start_min_observations` (default **10**) the guardian:

* reports status `CALIBRATING`,
* marks the assessment `cold_start = true`,
* **suppresses all alerts**, and
* refuses to emit an unfounded verdict.

At or above the threshold it reports `MONITORING` (or higher per the risk band).
This is verified by `test_ai_guardian.py::test_cold_start_*`.

---

## 6. Alerts

| Alert type | Triggered by |
| --- | --- |
| `VELOCITY_SPIKE` | velocity anomaly |
| `TEMPORAL_ANOMALY` | temporal or inter-arrival anomaly |
| `WALLET_PATTERN` | wallet-concentration anomaly |
| `DISTRIBUTION_ANOMALY` | candidate-distribution anomaly |
| `ML_ANOMALY` | Isolation Forest anomaly |
| `COMPOSITE_RISK` | overall HIGH/CRITICAL score |

Alerts are de-duplicated by `dedup_key` (`<election>:<type>`): repeated
observations increment `occurrence_count` and bump `last_seen` rather than
inserting new rows. Lifecycle: `OPEN → ACKNOWLEDGED → RESOLVED`.

---

## 7. Configuration

| Setting | Default | Meaning |
| --- | ---: | --- |
| `ai_window_seconds` | `300` | Analysis window length |
| `ai_baseline_window` | `10` | Rolling baseline size (snapshots) |
| `ai_cold_start_min_observations` | `10` | Observations before real verdicts |
| `ai_iforest_n_estimators` | `100` | Isolation Forest trees |
| `ai_iforest_contamination` | `0.03` | Expected anomaly fraction |
| `ai_iforest_random_state` | `42` | Determinism seed |
| `ai_analysis_enabled` | `False` | Enable the periodic background worker |
| `ai_analysis_interval` | `30.0` | Worker interval (seconds) |

All analysis is **deterministic**: identical telemetry yields identical scores,
threat levels, and alerts.

---

## 8. Data model

| Table | Purpose |
| --- | --- |
| `ai_feature_snapshots` | One engineered feature vector per analysis window |
| `ai_risk_assessments` | Risk score, threat level, signals, explanation, model version |
| `ai_alerts` | Persisted supervisory alerts with dedup + lifecycle |

Created by migration
[`0002_phase4_ai_guardian.py`](../../backend/alembic/versions/0002_phase4_ai_guardian.py).

---

## 9. API surface (all under `/api/v1`)

| Method & path | Description |
| --- | --- |
| `GET /elections/{id}/risk` | Latest supervision risk (neutral `CALIBRATING` before first analysis) |
| `GET /elections/{id}/ai/features` | Persisted feature windows |
| `POST /elections/{id}/ai/analyze` | Run the full pipeline on demand |
| `GET /elections/{id}/alerts` | Paginated alerts (filter by `status`) |
| `GET /alerts/{alert_id}` | Single alert |
| `POST /alerts/{alert_id}/acknowledge` | `OPEN → ACKNOWLEDGED` |
| `POST /alerts/{alert_id}/resolve` | `ACKNOWLEDGED → RESOLVED` |
| `GET /guardian/status` | Aggregate SOC/dashboard status |

Every response carries `supervisory_only: true` and a disclaimer stating the
guardian does not prove fraud and does not control election state.

---

## 10. Demo

`scripts/generate_ai_demo_data.py` seeds deterministic `TEST/DEMO DATA` for six
scenarios (`normal`, `gradual_surge`, `burst`, `compressed_interarrival`,
`candidate_concentration`, `mixed_anomaly`) and prints the guardian's **live**
output — every number is computed by the pipeline, never fabricated.

```
python scripts/generate_ai_demo_data.py --all
```

Representative behaviour (verified):

| Scenario | Risk | Threat | Recommendation |
| --- | ---: | --- | --- |
| `normal` | ~4 | `NORMAL` | Continue monitoring |
| `gradual_surge` | ~23 | `NORMAL`/`ELEVATED` | Continue monitoring (no false positive) |
| `burst` | ~70 | `HIGH` | Human investigation required |
| `mixed_anomaly` | ~80 | `HIGH` | Human investigation required |

The `gradual_surge` case is an explicit **false-positive guard**: a legitimate
ramp may read `ELEVATED` but must never escalate to `HIGH`/`CRITICAL` or
recommend human escalation.

---

## 11. Testing

| File | Focus |
| --- | --- |
| `test_ai_baseline.py` | Rolling / EWMA / IQR maths |
| `test_ai_features.py` | Windowing and feature construction |
| `test_ai_anomaly_detector.py` | Six signals + Isolation Forest |
| `test_ai_risk.py` | Weighted aggregation, bands, boundedness |
| `test_ai_alerts.py` | Generation, dedup, lifecycle, no-mutation |
| `test_ai_guardian.py` | Cold start, pipeline, versioning, supervisory boundary |
| `test_ai_api.py` | Endpoint contracts and error handling |
| `test_ai_validation.py` | Critical validation + false-positive guard |

Key acceptance tests: normal data scores **low** (`< 30`); a 500-votes/30s burst
raises the score significantly into `HIGH`/`CRITICAL` with a velocity-grounded
explanation; a legitimate gradual surge is **not** a false positive; and analysis
never mutates election state or tallies.
