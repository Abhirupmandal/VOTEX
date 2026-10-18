# VOTEX Backend Architecture (Phase 3)

> **Phase 3 deliverable.** This document describes the VOTEX backend: the
> Web3 connectivity layer, the event indexer that projects on-chain activity
> into PostgreSQL, the read-model schema, the REST API surface, dual-source
> results verification, and the operational characteristics of the sync engine.
> It is written to match the code that ships in `votex/backend` exactly.

---

## 1. Guiding Principle: The Database Is Not Authoritative

VOTEX separates **on-chain truth** from **off-chain convenience**:

> The blockchain is the single source of truth for vote totals, voter
> eligibility, election state, and results. The PostgreSQL database is an
> **indexed read model** — a fast, queryable *projection* of on-chain events.
> It is never permitted to fabricate or silently "correct" blockchain state.

Every API response that returns indexed data is explicitly labelled
`"source": "OFF-CHAIN INDEXED VIEW"`. The election **results** endpoint does not
merely trust the index; it re-reads `getElectionResults()` directly from the
contract and returns both sides plus a `verification.matches` flag. A mismatch is
surfaced, never hidden.

See [`blockchain.md`](blockchain.md) for the authoritative contract semantics
this layer projects.

---

## 2. Scope and Non-Goals

### In scope (implemented and tested)

| Capability | Location |
| --- | --- |
| Web3 provider + chain-id verification | `app/services/blockchain/provider.py` |
| ABI loading from Phase 2 artifacts | `app/services/blockchain/contracts.py` |
| Event discovery + decoding (10 events) | `app/services/blockchain/event_listener.py` |
| Event projection into the read model | `app/services/blockchain/event_processor.py` |
| Resumable sync engine + reorg detection | `app/services/blockchain/sync_manager.py` |
| Read-model query helpers | `app/services/elections/queries.py` |
| Dual-source results verification | `app/services/elections/verification.py` |
| Indexed analytics | `app/services/elections/analytics.py` |
| Audit explorer queries | `app/services/audit/queries.py` |
| REST API (8 routers) | `app/api/v1/` |
| SQLAlchemy models + Alembic migration | `app/models/`, `alembic/` |

### Explicitly out of scope for Phase 3

- AI Election Guardian / anomaly detection.
- The complete end-user frontend integration.
- Authentication / SIWE. (Read endpoints are currently open.)
- Production deployment, HA, and key management.

The backend does **not** modify contract logic. Contracts are treated as a fixed,
already-tested dependency.

---

## 3. Pipeline

```text
                                   ┌─────────────────────────────┐
   VOTEX contracts (authoritative) │  ElectionFactory            │
                                   │  ElectionInstance           │
                                   │  VoterRegistry              │
                                   │  EmergencyController        │
                                   └──────────────┬──────────────┘
                                                  │ logs (eth_getLogs)
                                   ┌──────────────▼──────────────┐
                                   │  Web3Provider (HTTP)        │
                                   │  + chain-id verification    │
                                   └──────────────┬──────────────┘
                                                  │
                                   ┌──────────────▼──────────────┐
                                   │  EventListener              │
                                   │  discovers addresses,       │
                                   │  decodes logs → DecodedLog  │
                                   └──────────────┬──────────────┘
                                                  │
                                   ┌──────────────▼──────────────┐
                                   │  SyncManager                │
                                   │  checkpoints, batching,     │
                                   │  reorg detection            │
                                   └──────────────┬──────────────┘
                                                  │
                                   ┌──────────────▼──────────────┐
                                   │  EventProcessor             │
                                   │  idempotent projection      │
                                   └──────────────┬──────────────┘
                                                  │
                                   ┌──────────────▼──────────────┐
                                   │  PostgreSQL read model      │
                                   └───────┬──────────────┬──────┘
                                           │              │
                        ┌──────────────────▼───┐   ┌──────▼─────────────────┐
                        │  FastAPI REST API    │   │  Direct Verification   │
                        │  (labelled INDEXED)  │   │  (reads the chain)     │
                        └──────────────────────┘   └────────────────────────┘
```

A parallel **Blockchain → Direct Verification** path is preserved: the results
endpoint and the demo script read the contract directly, independent of the
index, so the index can always be independently checked against the chain.

---

## 4. Configuration

Settings are loaded from environment variables via `pydantic-settings`
(`app/core/config.py`). See `.env.example` for the full template.

| Variable | Purpose | Default |
| --- | --- | --- |
| `BLOCKCHAIN_RPC_URL` (alias `RPC_URL`) | JSON-RPC endpoint | `http://127.0.0.1:8545` |
| `BLOCKCHAIN_CHAIN_ID` (alias `CHAIN_ID`) | Expected chain id | `31337` |
| `VOTEX_FACTORY_ADDRESS` | Trusted factory address | – |
| `VOTER_REGISTRY_ADDRESS` | Trusted registry address | – |
| `EMERGENCY_CONTROLLER_ADDRESS` | Trusted controller address | – |
| `VOTEX_ACCESS_MANAGER_ADDRESS` | Trusted access manager address | – |
| `CONTRACTS_ARTIFACTS_DIR` | Phase 2 artifact root | `<repo>/votex/contracts/artifacts` |
| `DATABASE_URL` | SQLAlchemy DSN | `postgresql+psycopg2://votex:votex@localhost:5432/votex` |
| `INDEXER_ENABLED` | Auto-start continuous indexer in-process | `false` |
| `INDEXER_START_BLOCK` | First block to index | `0` |
| `INDEXER_BATCH_SIZE` | Max blocks per `getLogs` call | `2000` |
| `INDEXER_POLL_INTERVAL` | Continuous poll cadence (seconds) | `2.0` |
| `INDEXER_CONFIRMATIONS` | Lag behind head treated as "safe" | `0` |
| `INDEXER_REORG_REWIND` | Blocks to rewind on reorg | `10` |
| `INDEXER_NETWORK` | Logical stream label | `local` |
| `MAX_PAGE_SIZE` | Server pagination clamp | `100` |
| `DEFAULT_PAGE_SIZE` | Default page size | `20` |
| `LOG_LEVEL` | Structured log level | `INFO` |

Contract addresses are **only** ever read from this trusted configuration and
are checksum-normalised on load. They are never taken from request input.

---

## 5. Web3 Provider and ABI Integration

`Web3Provider` (`app/services/blockchain/provider.py`) wraps a single
`Web3(HTTPProvider(...))`:

- `is_connected()` — performs a trivial RPC call.
- `get_chain_id()` — reads `eth_chainId`.
- `verify_chain_id()` — raises `BlockchainUnavailableError` when the reported
  chain id does not match configuration. A mismatch is a hard failure, not a
  warning.
- `get_latest_block()` / `get_block()` — head and block-hash lookups.
- `status()` — a **sanitised** snapshot (`connected`, `chain_id`,
  `expected_chain_id`, `latest_block`) with no secrets, used by the status
  endpoint.

`ContractRegistry` (`app/services/blockchain/contracts.py`) loads ABIs from the
Phase 2 compilation artifacts — ABIs are **never hand-written**:

| Logical name | Artifact path |
| --- | --- |
| `ElectionFactory` | `contracts/core/ElectionFactory.sol/ElectionFactory.json` |
| `ElectionInstance` | `contracts/core/ElectionInstance.sol/ElectionInstance.json` |
| `VoterRegistry` | `contracts/core/VoterRegistry.sol/VoterRegistry.json` |
| `EmergencyController` | `contracts/emergency/EmergencyController.sol/EmergencyController.json` |
| `VotexAccessManager` | `contracts/access/VotexAccessManager.sol/VotexAccessManager.json` |

Failures are explicit and typed:

- `AbiNotFoundError` → HTTP **500** (a build/artifact problem).
- `ContractNotConfiguredError` → HTTP **503** (address not configured).
- `BlockchainUnavailableError` → HTTP **503** (RPC unreachable / wrong chain).

---

## 6. Indexed Events

`EventListener` discovers every `ElectionInstance` address from the factory and
builds a `{contract_address → {topic0 → (event_name, contract_event)}}` map from
the loaded ABIs. It decodes raw logs into `DecodedLog` objects. The ten supported
events are:

| Event | Emitter | Projection effect |
| --- | --- | --- |
| `ElectionCreated` | `ElectionFactory` | Insert/upsert election + contract address |
| `VoterRegistered` | `VoterRegistry` | Insert voter row (with commitment) |
| `VoterDeactivated` | `VoterRegistry` | Mark voter inactive |
| `VoterReactivated` | `VoterRegistry` | Mark voter active |
| `CandidateAdded` | `ElectionInstance` | Insert candidate |
| `CandidateDeactivated` | `ElectionInstance` | Mark candidate inactive |
| `VoteCast` | `ElectionInstance` | Insert vote **and** increment tallies once |
| `ElectionStateChanged` | `ElectionInstance` | Update election state + `state_index` |
| `EmergencyAction` | `EmergencyController` | Audit-only (no read-model mutation) |
| `EmergencyControllerUpdated` | `ElectionFactory` | Audit-only |

`DecodedLog.payload()` normalises decoded args for the JSON `payload` column via
`json_safe()` — recursively coercing `bytes` (e.g. `credentialCommitment`) to
`0x`-hex so SQLAlchemy can persist them. Without this, event persistence fails
with *"Object of type bytes is not JSON serializable"*.

---

## 7. Idempotency and Reorg Safety

### Idempotency

The `blockchain_events` table has a database-level uniqueness constraint:

```sql
UNIQUE (transaction_hash, log_index)
```

`EventProcessor.process()` takes this as its gate: it first attempts to persist
the `BlockchainEvent`; if the row already exists the log is skipped and nothing
is projected. Because the event row and the projection happen in the **same
transaction**, either both land or neither does. Vote tallies therefore cannot be
double-counted even if the same block range is replayed. The `votes` table
carries the same `UNIQUE (transaction_hash, log_index)` guarantee.

This is verified by tests (`test_duplicate_vote_is_not_double_counted`) and
demonstrated by the demo script's second-pass check.

### Reorg safety

`SyncManager` stores, per stream, the `last_processed_block` **and**
`last_processed_block_hash` in `indexer_state`. On each sync it:

1. Re-reads the stored block's hash from the chain.
2. If the hash differs (or the block is no longer present), a reorg is detected.
3. Rewinds to `last_processed_block - INDEXER_REORG_REWIND`, deletes indexed
   events above that point, resets the affected read-model rows, and marks the
   status `REORG_DETECTED`.
4. Re-syncs forward from the rewound checkpoint.

> **Documented local limitation.** On a local development chain (Hardhat) reorgs
> do not occur naturally, and `INDEXER_CONFIRMATIONS` defaults to `0`. The reorg
> logic is therefore *implemented and unit-tested by simulating a changed block
> hash*, but it is **not** exercised against a real reorged public network in
> this phase. Deep-reorg handling on a live chain (finality-aware
> confirmation depth, larger rewind windows) is a hardening concern for a later
> phase.

---

## 8. Sync Engine

`SyncManager` provides the public operations:

| Method | Behaviour |
| --- | --- |
| `get_or_create_state(session)` | Loads/creates the checkpoint keyed by `"{network}:{factory_lower}"` |
| `sync_range(session, from, to)` | Fetches, decodes, and projects a block range in bounded batches |
| `sync_from_block(from_block)` | Backfill from an explicit block up to the safe head |
| `sync_latest()` | Reorg check, then resume from `checkpoint + 1` to the safe head |
| `get_sync_status()` | Returns a `SyncStatus` snapshot |
| `reset_index()` | Dev/test utility: clears indexed data + checkpoint |

- **INITIAL_SYNC** runs from `INDEXER_START_BLOCK`; **CONTINUOUS_SYNC** resumes
  from the checkpoint. Both share `sync_range` and the same idempotency gate.
- The "safe head" is `latest_block - INDEXER_CONFIRMATIONS`.
- All exceptions are wrapped in `SyncError` so the API layer can return a clean
  message.
- `ContinuousIndexer` runs the loop on a daemon thread with a `threading.Event`
  stop signal; `stop(timeout=5.0)` joins with a bound, so **shutdown is never
  blocked** by an in-flight poll. `run_iterations(n)` supports deterministic
  testing without threads.

---

## 9. Database Schema (Read Model)

Six tables, created by a single Alembic revision
(`0001_phase3_initial`). Full DDL in
[`alembic/versions/0001_phase3_initial_schema.py`](../../backend/alembic/versions/0001_phase3_initial_schema.py).

| Table | Role | Key constraints |
| --- | --- | --- |
| `elections` | One row per on-chain election | `UNIQUE(blockchain_election_id)` |
| `candidates` | Candidates per election | `UNIQUE(election_id, blockchain_candidate_id)`, FK `election_id` CASCADE |
| `voters` | Wallet eligibility projection | `UNIQUE(wallet_address)` |
| `votes` | One row per indexed `VoteCast` | `UNIQUE(transaction_hash, log_index)`, FK `election_id` CASCADE |
| `blockchain_events` | Raw decoded log audit trail | `UNIQUE(transaction_hash, log_index)` |
| `indexer_state` | Sync checkpoint per stream | `UNIQUE(indexer_key)` |

### Performance indexes

- `votes`: `transaction_hash`, `block_number`, `election_id`, `candidate_id`,
  `voter_address`, and a composite `(election_id, block_number)`.
- `blockchain_events`: `event_type`, `contract_address`, `transaction_hash`,
  `block_number`, `timestamp`, and composites `(block_number, log_index)` and
  `(contract_address, block_number)`.
- `elections`: `blockchain_election_id` (unique), `contract_address`, `state`,
  `created_block`, `created_tx_hash`.

### Migrations

```bash
cd votex/backend
.venv\Scripts\alembic upgrade head
.venv\Scripts\alembic current
.venv\Scripts\alembic check   # asserts no pending model/migration drift
```

---

## 10. REST API Surface

All endpoints are mounted under the `/api/v1` prefix (plus the root `/health`).
OpenAPI is available at `/docs`.

| Method | Path | Purpose | Source label |
| --- | --- | --- | --- |
| GET | `/health` | Root liveness probe | – |
| GET | `/api/v1/health` | API + database + blockchain component readiness | – |
| GET | `/api/v1/health/db` | Database readiness probe | – |
| GET | `/api/v1/blockchain/status` | RPC reachability + chain-id match (no secrets) | – |
| GET | `/api/v1/blockchain/sync` | Indexer sync status snapshot | – |
| GET | `/api/v1/elections` | Paginated election list (`?state=`) | `OFF-CHAIN INDEXED VIEW` |
| GET | `/api/v1/elections/{election_id}` | Election detail | `OFF-CHAIN INDEXED VIEW` |
| GET | `/api/v1/elections/{election_id}/results` | Indexed **vs** on-chain results + verification | dual |
| GET | `/api/v1/elections/{election_id}/candidates` | Candidates for an election | indexed |
| GET | `/api/v1/elections/{election_id}/candidates/{candidate_id}` | Single candidate | indexed |
| GET | `/api/v1/elections/{election_id}/votes` | Paginated indexed votes | `OFF-CHAIN INDEXED VIEW` |
| GET | `/api/v1/elections/{election_id}/analytics` | Turnout, distribution, activity over time | `OFF-CHAIN INDEXED VIEW` |
| GET | `/api/v1/voters/{wallet_address}` | Voter lookup (address validated) | indexed |
| GET | `/api/v1/audit/events` | Paginated event audit trail (`?event_type=&contract_address=&election_id=`) | indexed |
| GET | `/api/v1/audit/transactions/{tx_hash}` | All indexed events for a transaction | indexed |

### Pagination

`Pagination` (`app/api/deps.py`) accepts `page` (`>= 1`) and `page_size`, and
**clamps** `page_size` to `[1, MAX_PAGE_SIZE]` server-side. Responses use the
envelope `{items, page, page_size, total, pages, source}`.

### Error handling

| Condition | Status |
| --- | --- |
| Unknown election / candidate / voter | `404` |
| Malformed wallet address or tx hash | `400` |
| RPC unreachable / wrong chain id | `503` |
| Contract address not configured | `503` |
| ABI artifact missing (build problem) | `500` |
| Any other unhandled exception | `500` (generic message) |

Unhandled exceptions are logged **server-side** in full; the client receives only
`{"detail": "Internal server error.", "code": "internal_error"}`. Stack traces
and secrets are never leaked in responses.

---

## 11. Results Verification

`GET /api/v1/elections/{id}/results` returns a three-part payload:

```json
{
  "election_id": 1,
  "indexed_result":  { "source": "INDEXED",   "...": "..." },
  "blockchain_result": { "source": "BLOCKCHAIN", "...": "..." },
  "verification": { "matches": true, "differences": [] }
}
```

- `indexed_result` is computed from the indexed `votes`/`candidates` rows.
- `blockchain_result` is read **live** from the election contract via
  `getElectionResults()`.
- `verification.matches` compares the two; `differences` lists every
  disagreement.

A mismatch is **never** silently reconciled. If the chain is unreachable,
`blockchain_result` is `null` and the response makes the inconclusive state
explicit rather than pretending the index is authoritative.

---

## 12. Logging

`app/core/logging.py` installs a `JsonFormatter` that renders every record as a
single-line JSON object (`timestamp`, `level`, `service`, `logger`, `message`,
plus structured `extra` fields). This keeps logs machine-parseable in
containers. **No secrets** (RPC credentials, DSNs, private keys) are ever logged.

---

## 13. Test Evidence

Command: `.venv\Scripts\pytest` (run from `votex/backend`).

- **Full suite:** 89 passed, 1 skipped (the real-chain integration test when no
  node is reachable).
- **Real-blockchain integration:** `tests/test_integration_chain.py` deploys the
  Phase 2 core to a live local Hardhat node, drives a full workflow
  (create → candidates → register → vote → state transitions), and asserts the
  indexer reproduces it — **without mocking the blockchain**. Result:
  `1 passed`.

The suite covers: config parsing, ABI loading, provider behaviour, event
decoding, projection per event type, duplicate-indexing idempotency, indexer
recovery/resume, every API endpoint, pagination clamping, results verification,
and model constraints/indexes.

---

## 14. Running the Stack

```bash
# 1. PostgreSQL (Docker)
cd votex
docker compose up -d postgres

# 2. Migrate + run the API
cd backend
.venv\Scripts\alembic upgrade head
.venv\Scripts\python -m uvicorn app.main:app --port 8000

# 3. Local chain + deploy (separate terminals, from votex/contracts)
npm run node
npm run deploy:local        # copy the printed addresses into backend/.env

# 4. Demo (prints an honest indexed-vs-on-chain verification summary)
cd votex/backend
.venv\Scripts\python scripts\demo_phase3.py
```

The demo script exits `0` only when the indexed read model **matches** the chain
for every indexed election; it exits non-zero on mismatch, inconclusive state, or
missing dependencies. It never fabricates a result.

---

## 15. Security and Known Limitations

- **Read-only projections.** The backend never writes to chain state. Contract
  addresses and ABIs come only from trusted local configuration/artifacts.
- **Parameterised SQL.** All queries go through the SQLAlchemy ORM/Core;
  user input is never string-interpolated into SQL.
- **Bounded queries.** Pagination is clamped; batch sizes are capped.
- **Local reorg limitation.** See §7 — reorg handling is implemented and
  unit-tested against a simulated hash change, but not against a live deep reorg.
- **No auth (yet).** Read endpoints are currently unauthenticated; SIWE and
  role-gated writes are a future phase.
- **Transparency, not secrecy.** As with the contracts, indexed votes remain
  publicly linkable; see [`blockchain.md`](blockchain.md) §2.
