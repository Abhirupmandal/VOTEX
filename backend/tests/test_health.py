"""Smoke tests for the health endpoints."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_root_health_returns_ok() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "votex-backend"}


def test_v1_health_returns_ok() -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    # Phase 3 enriches the readiness probe with per-component status.
    assert body["status"] in {"ok", "degraded"}
    assert body["service"] == "votex-backend"
    assert body["components"]["api"] == "ok"
    assert body["components"]["database"] in {"connected", "unavailable"}


def test_openapi_docs_available() -> None:
    response = client.get("/openapi.json")
    assert response.status_code == 200
    assert response.json()["info"]["title"] == "VOTEX Backend"
