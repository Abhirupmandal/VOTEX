"""Structured JSON logging for the VOTEX backend.

Emits one JSON object per line so logs are trivially ingestible by an external
log processor. Secrets (RPC credentials, database passwords) are never logged;
callers are expected to pass only public identifiers.
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any

_RESERVED = {
    "name",
    "msg",
    "args",
    "levelname",
    "levelno",
    "pathname",
    "filename",
    "module",
    "exc_info",
    "exc_text",
    "stack_info",
    "lineno",
    "funcName",
    "created",
    "msecs",
    "relativeCreated",
    "thread",
    "threadName",
    "processName",
    "process",
    "taskName",
    "message",
}


class JsonFormatter(logging.Formatter):
    """Render log records as single-line JSON objects."""

    def __init__(self, service: str) -> None:
        super().__init__()
        self._service = service

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "service": self._service,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Merge any structured extras (e.g. event=..., election_id=...).
        for key, value in record.__dict__.items():
            if key not in _RESERVED and not key.startswith("_"):
                payload[key] = value

        if record.exc_info:
            payload["error"] = self.formatException(record.exc_info)

        return json.dumps(payload, default=str)


def configure_logging(service: str = "votex-backend", level: str = "INFO") -> None:
    """Configure the root logger with a JSON handler (idempotent)."""
    root = logging.getLogger()
    root.setLevel(level.upper())

    # Replace any pre-existing handlers so repeated calls stay idempotent.
    for handler in list(root.handlers):
        root.removeHandler(handler)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter(service))
    root.addHandler(handler)

    # Quieten noisy third-party loggers unless explicitly debugging.
    if level.upper() != "DEBUG":
        for noisy in ("web3", "urllib3", "httpx", "httpcore"):
            logging.getLogger(noisy).setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Return a namespaced logger."""
    return logging.getLogger(name)
