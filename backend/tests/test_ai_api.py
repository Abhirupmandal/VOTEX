"""API-level tests for the AI Guardian endpoints.

``get_db`` is overridden to share the rolled-back test session, so the
service-layer commits only release a savepoint and no residue is left behind.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.main import app
from app.services.ai import synthetic

API = "/api/v1"
MISSING = 999_999


@pytest.fixture()
def api_client(client: TestClient, db_session: Session):
    def _override():
        yield db_session  # deliberately not closed here

    app.dependency_overrides[get_db] = _override
    try:
        yield client
    finally:
        app.dependency_overrides.pop(get_db, None)


def _normal(db_session: Session, election_id: int = 940001):
    return synthetic.ensure_demo_election(
        db_session, blockchain_election_id=election_id, scenario="normal"
    )


def _burst(db_session: Session, election_id: int = 940002):
    return synthetic.ensure_demo_election(
        db_session, blockchain_election_id=election_id, scenario="burst"
    )


# -- Risk -------------------------------------------------------------------


def test_risk_endpoint_neutral_before_analysis(
    api_client: TestClient, db_session: Session
) -> None:
    _normal(db_session, 940011)
    resp = api_client.get(f"{API}/elections/940011/risk")
    assert resp.status_code == 200
    body = resp.json()
    assert body["risk_score"] == 0
    assert body["guardian_status"] == "CALIBRATING"
    assert body["supervisory_only"] is True
    assert body["disclaimer"]


def test_risk_endpoint_missing_election_returns_404(api_client: TestClient) -> None:
    resp = api_client.get(f"{API}/elections/{MISSING}/risk")
    assert resp.status_code == 404


# -- Analysis ---------------------------------------------------------------


def test_analyze_endpoint_normal_election(
    api_client: TestClient, db_session: Session
) -> None:
    _normal(db_session, 940012)
    resp = api_client.post(f"{API}/elections/940012/ai/analyze")
    assert resp.status_code == 200
    body = resp.json()
    assert body["election_id"] == 940012
    assert body["cold_start"] is False
    assert body["threat_level"] in {"NORMAL", "ELEVATED"}
    assert body["model_version"] == "0.1.0"
    assert body["supervisory_only"] is True
    assert body["explanation"]["disclaimer"]


def test_analyze_endpoint_missing_election_returns_404(api_client: TestClient) -> None:
    resp = api_client.post(f"{API}/elections/{MISSING}/ai/analyze")
    assert resp.status_code == 404


# -- Features ---------------------------------------------------------------


def test_features_endpoint_lists_persisted_windows(
    api_client: TestClient, db_session: Session
) -> None:
    _normal(db_session, 940013)
    api_client.post(f"{API}/elections/940013/ai/analyze")

    resp = api_client.get(f"{API}/elections/940013/ai/features")
    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] >= 1
    assert body["observations"] >= 1
    assert body["calibrating"] is False
    assert body["items"]


def test_features_endpoint_missing_election_returns_404(api_client: TestClient) -> None:
    resp = api_client.get(f"{API}/elections/{MISSING}/ai/features")
    assert resp.status_code == 404


# -- Alerts -----------------------------------------------------------------


def test_alert_lifecycle_over_api(api_client: TestClient, db_session: Session) -> None:
    _burst(db_session, 940014)
    analyzed = api_client.post(f"{API}/elections/940014/ai/analyze").json()
    assert analyzed["threat_level"] in {"HIGH", "CRITICAL"}
    assert analyzed["alerts_created"] >= 1

    listing = api_client.get(f"{API}/elections/940014/alerts").json()
    assert listing["total"] >= 1
    assert listing["source"] == "indexed"
    alert_id = listing["items"][0]["id"]

    single = api_client.get(f"{API}/alerts/{alert_id}")
    assert single.status_code == 200
    assert single.json()["id"] == alert_id

    acked = api_client.post(f"{API}/alerts/{alert_id}/acknowledge")
    assert acked.status_code == 200
    assert acked.json()["status"] == "ACKNOWLEDGED"

    resolved = api_client.post(f"{API}/alerts/{alert_id}/resolve")
    assert resolved.status_code == 200
    assert resolved.json()["status"] == "RESOLVED"


def test_alerts_status_filter(api_client: TestClient, db_session: Session) -> None:
    _burst(db_session, 940015)
    api_client.post(f"{API}/elections/940015/ai/analyze")

    resolved = api_client.get(
        f"{API}/elections/940015/alerts", params={"status": "RESOLVED"}
    ).json()
    assert resolved["total"] == 0

    opened = api_client.get(
        f"{API}/elections/940015/alerts", params={"status": "OPEN"}
    ).json()
    assert opened["total"] >= 1


def test_missing_alert_returns_404(api_client: TestClient) -> None:
    assert api_client.get(f"{API}/alerts/{MISSING}").status_code == 404
    assert api_client.post(f"{API}/alerts/{MISSING}/acknowledge").status_code == 404
    assert api_client.post(f"{API}/alerts/{MISSING}/resolve").status_code == 404


def test_alerts_missing_election_returns_404(api_client: TestClient) -> None:
    assert api_client.get(f"{API}/elections/{MISSING}/alerts").status_code == 404


# -- Guardian status --------------------------------------------------------


def test_guardian_status_endpoint_shape(api_client: TestClient) -> None:
    resp = api_client.get(f"{API}/guardian/status")
    assert resp.status_code == 200
    body = resp.json()
    for key in (
        "status",
        "risk_score",
        "threat_level",
        "active_alerts",
        "elections_monitored",
        "model_version",
    ):
        assert key in body
    assert body["supervisory_only"] is True
