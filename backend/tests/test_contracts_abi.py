"""Tests for contract ABI loading from the real Phase 2 Hardhat artifacts.

These tests guarantee the backend never hand-writes ABIs and that the expected
event signatures are present in the compiled output.
"""

from __future__ import annotations

import pytest

from app.core.config import Settings
from app.services.blockchain import types as t
from app.services.blockchain.contracts import (
    AbiNotFoundError,
    ContractNotConfiguredError,
    ContractRegistry,
    load_abi,
    load_artifact_full,
)


def _event_names(abi: list[dict]) -> set[str]:
    return {item["name"] for item in abi if item.get("type") == "event"}


def test_load_all_core_abis() -> None:
    for name in (
        "ElectionFactory",
        "ElectionInstance",
        "VoterRegistry",
        "EmergencyController",
        "VotexAccessManager",
    ):
        abi = load_abi(name)
        assert isinstance(abi, list)
        assert abi, f"{name} ABI should not be empty"


def test_factory_abi_declares_expected_events() -> None:
    names = _event_names(load_abi("ElectionFactory"))
    assert t.ELECTION_CREATED in names
    assert t.EMERGENCY_CONTROLLER_UPDATED in names


def test_election_instance_abi_declares_expected_events() -> None:
    names = _event_names(load_abi("ElectionInstance"))
    for expected in (
        t.CANDIDATE_ADDED,
        t.CANDIDATE_DEACTIVATED,
        t.VOTE_CAST,
        t.ELECTION_STATE_CHANGED,
    ):
        assert expected in names


def test_voter_registry_abi_declares_expected_events() -> None:
    names = _event_names(load_abi("VoterRegistry"))
    for expected in (
        t.VOTER_REGISTERED,
        t.VOTER_DEACTIVATED,
        t.VOTER_REACTIVATED,
    ):
        assert expected in names


def test_unknown_artifact_raises() -> None:
    with pytest.raises(AbiNotFoundError):
        load_abi("DoesNotExist")


def test_load_artifact_full_includes_bytecode() -> None:
    artifact = load_artifact_full("ElectionFactory")
    assert "abi" in artifact
    assert "bytecode" in artifact


def test_missing_artifacts_dir_raises(tmp_path) -> None:
    settings = Settings(contracts_artifacts_dir=str(tmp_path / "nope"))
    with pytest.raises(AbiNotFoundError):
        load_abi("ElectionFactory", settings=settings)


def test_registry_rejects_missing_address() -> None:
    settings = Settings(votex_factory_address="")
    registry = ContractRegistry(settings=settings, provider=object())  # type: ignore[arg-type]
    with pytest.raises(ContractNotConfiguredError):
        registry.factory_address()


def test_registry_rejects_invalid_address() -> None:
    settings = Settings(votex_factory_address="0xnothex")
    registry = ContractRegistry(settings=settings, provider=object())  # type: ignore[arg-type]
    with pytest.raises(ContractNotConfiguredError):
        registry.factory_address()


def test_registry_normalises_valid_address() -> None:
    settings = Settings(votex_factory_address="0x" + "ab" * 20)
    registry = ContractRegistry(settings=settings, provider=object())  # type: ignore[arg-type]
    # Checksummed form differs from the all-lowercase input.
    assert registry.factory_address().startswith("0x")
    assert registry.factory_address().lower() == "0x" + "ab" * 20
