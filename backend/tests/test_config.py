"""Tests for application configuration (Phase 3 additions)."""

from __future__ import annotations

from app.core.config import Settings, get_settings


def test_defaults_are_local_safe() -> None:
    settings = Settings(_env_file=None)
    assert settings.blockchain_chain_id == 31337
    assert settings.max_page_size == 100
    assert settings.default_page_size == 20
    assert settings.indexer_network == "local"


def test_is_indexer_configured_true_with_factory() -> None:
    settings = Settings(votex_factory_address="0x" + "11" * 20)
    assert settings.is_indexer_configured is True


def test_is_indexer_configured_false_without_factory() -> None:
    settings = Settings(votex_factory_address="")
    assert settings.is_indexer_configured is False


def test_legacy_env_alias_is_accepted() -> None:
    # Legacy names must keep working alongside the namespaced ones.
    settings = Settings(**{"RPC_URL": "http://legacy:8545", "CHAIN_ID": 4242})
    assert settings.blockchain_rpc_url == "http://legacy:8545"
    assert settings.blockchain_chain_id == 4242


def test_field_name_population_is_allowed() -> None:
    settings = Settings(blockchain_rpc_url="http://by-field:8545")
    assert settings.blockchain_rpc_url == "http://by-field:8545"


def test_artifacts_path_points_at_contracts_dir() -> None:
    path = get_settings().artifacts_path()
    assert path.name == "artifacts"
    assert path.exists()
