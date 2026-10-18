"""Tests for the database readiness probe.

These tests assert the *contract* of the endpoint (status code and payload
shape) rather than a specific connectivity outcome, so the suite remains valid
whether or not a PostgreSQL instance is reachable in the current environment.
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_db_health_returns_payload() -> None:
    response = client.get("/api/v1/health/db")
    assert response.status_code == 200

    body = response.json()
    assert body["status"] in {"ok", "degraded"}
    assert body["database"] in {"connected", "unavailable"}


def test_db_health_status_matches_connection_flag() -> None:
    body = client.get("/api/v1/health/db").json()
    if body["database"] == "connected":
        assert body["status"] == "ok"
    else:
        assert body["status"] == "degraded"
