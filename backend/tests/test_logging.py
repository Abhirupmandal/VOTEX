"""Tests for structured JSON logging."""

from __future__ import annotations

import json
import logging

from app.core.logging import JsonFormatter, configure_logging, get_logger


def _record(**extra) -> logging.LogRecord:
    record = logging.LogRecord(
        name="votex.test",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="hello %s",
        args=("world",),
        exc_info=None,
    )
    for key, value in extra.items():
        setattr(record, key, value)
    return record


def test_formatter_emits_single_json_object() -> None:
    payload = json.loads(JsonFormatter("votex-backend").format(_record()))
    assert payload["level"] == "INFO"
    assert payload["service"] == "votex-backend"
    assert payload["message"] == "hello world"
    assert "timestamp" in payload


def test_formatter_merges_structured_extras() -> None:
    record = _record(event="event_indexed", transaction_hash="0xabc", block_number=7)
    payload = json.loads(JsonFormatter("votex-backend").format(record))
    assert payload["event"] == "event_indexed"
    assert payload["transaction_hash"] == "0xabc"
    assert payload["block_number"] == 7


def test_formatter_excludes_reserved_keys() -> None:
    payload = json.loads(JsonFormatter("votex-backend").format(_record()))
    # ``name``/``levelname`` are reserved and must not leak as bare fields.
    assert "levelname" not in payload
    assert "msg" not in payload


def test_configure_logging_is_idempotent() -> None:
    configure_logging(service="votex-backend", level="INFO")
    configure_logging(service="votex-backend", level="INFO")
    root = logging.getLogger()
    assert len(root.handlers) == 1
    assert get_logger("votex.test") is logging.getLogger("votex.test")
