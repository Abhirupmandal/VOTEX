"""Application configuration loaded from environment variables.

Phase 3 extends the Phase 1 settings with blockchain connectivity, contract
addresses, indexer tuning, and API limits. Values are sourced from environment
variables (and an optional ``.env`` file). No secrets are hard-coded; the
defaults below are safe local development placeholders only.
"""

from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Repository-relative default for the compiled Hardhat ABI artifacts.
# ``config.py`` lives at ``<repo>/votex/backend/app/core/config.py`` so the
# artifacts directory resolves to ``<repo>/votex/contracts/artifacts``.
_DEFAULT_ARTIFACTS_DIR = (
    Path(__file__).resolve().parents[3] / "contracts" / "artifacts"
)


class Settings(BaseSettings):
    """Runtime settings for the VOTEX backend."""

    model_config = SettingsConfigDict(
        env_file=".env", extra="ignore", populate_by_name=True
    )

    # -- Service ----------------------------------------------------------
    app_name: str = "votex-backend"
    environment: str = "development"
    log_level: str = "INFO"

    backend_host: str = "0.0.0.0"
    backend_port: int = 8000

    # SQLAlchemy connection string. Override via DATABASE_URL in production.
    database_url: str = "postgresql+psycopg2://votex:votex@localhost:5432/votex"

    # -- Blockchain -------------------------------------------------------
    # Both the namespaced (BLOCKCHAIN_*) and legacy (RPC_URL/CHAIN_ID) variable
    # names are accepted so Phase 1 deployments keep working.
    blockchain_rpc_url: str = Field(
        default="http://127.0.0.1:8545",
        validation_alias=AliasChoices("BLOCKCHAIN_RPC_URL", "RPC_URL", "SEPOLIA_RPC_URL"),
    )
    blockchain_chain_id: int = Field(
        default=31337,
        validation_alias=AliasChoices("BLOCKCHAIN_CHAIN_ID", "CHAIN_ID"),
    )
    blockchain_request_timeout: float = 10.0

    # Trusted contract addresses. These are read from configuration ONLY and
    # are never accepted from a public API request.
    votex_factory_address: str = Field(
        default="",
        validation_alias=AliasChoices("VOTEX_FACTORY_ADDRESS", "FACTORY_ADDRESS"),
    )
    voter_registry_address: str = Field(
        default="",
        validation_alias=AliasChoices("VOTER_REGISTRY_ADDRESS", "VOTERREGISTRY_ADDRESS"),
    )
    emergency_controller_address: str = Field(
        default="",
        validation_alias=AliasChoices(
            "EMERGENCY_CONTROLLER_ADDRESS", "EMERGENCYCONTROLLER_ADDRESS"
        ),
    )
    votex_access_manager_address: str = Field(
        default="",
        validation_alias=AliasChoices(
            "VOTEX_ACCESS_MANAGER_ADDRESS", "ACCESS_MANAGER_ADDRESS"
        ),
    )

    # Directory holding compiled Hardhat artifacts (ABI JSON).
    contracts_artifacts_dir: str = str(_DEFAULT_ARTIFACTS_DIR)

    # -- Indexer ----------------------------------------------------------
    indexer_enabled: bool = False
    indexer_start_block: int = 0
    indexer_batch_size: int = 2000
    indexer_poll_interval: float = 2.0
    # Number of blocks kept behind the head to reduce reorg exposure.
    indexer_confirmations: int = 0
    # How far to rewind when a block-hash discontinuity is detected.
    indexer_reorg_rewind: int = 10
    # Network identifier ("local" or "sepolia").
    indexer_network: str = "local"
    # Safety guard: Refuse unsafe 0 start block on public testnet unless explicitly overridden.
    indexer_allow_unsafe_zero_start_block: bool = False

    # -- API --------------------------------------------------------------
    max_page_size: int = 100
    default_page_size: int = 20

    # -- AI Election Guardian --------------------------------------------
    # The window (seconds) each telemetry snapshot covers. Chosen small enough
    # that a burst is visible quickly yet wide enough to smooth noise.
    ai_window_seconds: int = 300
    # Rolling baseline window size (number of preceding snapshots).
    ai_baseline_window: int = 10
    # Cold-start: below this many snapshots the guardian reports CALIBRATING
    # and suppresses final risk verdicts.
    ai_cold_start_min_observations: int = 10
    # Isolation Forest configuration (documented in ai-guardian.md).
    ai_iforest_n_estimators: int = 100
    ai_iforest_contamination: float = 0.03
    ai_iforest_random_state: int = 42
    # Periodic analysis worker (disabled by default; opt-in for local demo).
    ai_analysis_enabled: bool = False
    ai_analysis_interval: float = 30.0

    def artifacts_path(self) -> Path:
        """Return the artifacts directory as an absolute :class:`Path`."""
        return Path(self.contracts_artifacts_dir).resolve()

    @property
    def is_indexer_configured(self) -> bool:
        """True when a factory address is present so indexing can begin."""
        return bool(self.votex_factory_address.strip())

    @property
    def is_sepolia(self) -> bool:
        """True when targeting the Ethereum Sepolia testnet."""
        return (
            self.blockchain_chain_id == 11155111
            or self.indexer_network.lower() == "sepolia"
        )


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance."""
    return Settings()
