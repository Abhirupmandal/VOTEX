"""VOTEX FastAPI application entrypoint (Phase 3).

Exposes health, blockchain, election, candidate, vote, voter, analytics, and
audit endpoints. The database is an indexed read model; the blockchain remains
authoritative for votes, eligibility, state, and results.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger
from app.services.blockchain.contracts import AbiNotFoundError, ContractNotConfiguredError
from app.services.blockchain.provider import BlockchainUnavailableError

settings = get_settings()
configure_logging(service="votex-backend", level=settings.log_level)
logger = get_logger("votex.app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start/stop the optional continuous indexer and AI guardian worker."""
    indexer = None
    if settings.indexer_enabled and settings.is_indexer_configured:
        from app.services.blockchain.sync_manager import ContinuousIndexer

        indexer = ContinuousIndexer()
        indexer.start()
        logger.info("indexer_enabled", extra={"event": "indexer_autostart"})

    # Optional AI Guardian periodic analysis worker. Disabled by default; when
    # enabled it runs one bounded pass per interval and never blocks requests.
    analyzer = None
    if settings.ai_analysis_enabled:
        from app.services.ai.guardian import PeriodicAnalyzer

        analyzer = PeriodicAnalyzer()
        analyzer.start()
        logger.info("ai_analysis_enabled", extra={"event": "ai_analysis_autostart"})

    try:
        yield
    finally:
        if analyzer is not None:
            analyzer.stop()
        if indexer is not None:
            indexer.stop()


app = FastAPI(
    title="VOTEX Backend",
    description=(
        "AI-Powered Secure and Transparent Decentralized E-Voting Platform — "
        "Phase 3 blockchain indexer & REST API. The database is an OFF-CHAIN "
        "INDEXED VIEW; the blockchain is authoritative."
    ),
    version="0.3.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


# -- Structured error handling -------------------------------------------


@app.exception_handler(BlockchainUnavailableError)
async def blockchain_unavailable_handler(
    request: Request, exc: BlockchainUnavailableError
) -> JSONResponse:
    logger.error(
        "blockchain_unavailable",
        extra={"event": "blockchain_unavailable", "error": str(exc)},
    )
    return JSONResponse(
        status_code=503,
        content={"detail": "Blockchain RPC is unavailable.", "code": "blockchain_unavailable"},
    )


@app.exception_handler(ContractNotConfiguredError)
async def contract_not_configured_handler(
    request: Request, exc: ContractNotConfiguredError
) -> JSONResponse:
    logger.error(
        "contract_not_configured",
        extra={"event": "contract_not_configured", "error": str(exc)},
    )
    return JSONResponse(
        status_code=503,
        content={"detail": str(exc), "code": "contract_not_configured"},
    )


@app.exception_handler(AbiNotFoundError)
async def abi_not_found_handler(
    request: Request, exc: AbiNotFoundError
) -> JSONResponse:
    logger.error("abi_not_found", extra={"event": "abi_not_found", "error": str(exc)})
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "code": "abi_not_found"},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all: log the detail server-side, return a generic message."""
    logger.error(
        "unhandled_error",
        extra={"event": "unhandled_error", "error": str(exc), "path": str(request.url)},
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error.", "code": "internal_error"},
    )


@app.get("/health", tags=["health"], summary="Root liveness probe")
def root_health() -> dict[str, str]:
    """Root-level liveness probe."""
    return {"status": "ok", "service": settings.app_name}
