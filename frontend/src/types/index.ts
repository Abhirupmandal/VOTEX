/**
 * Shared frontend domain + API types.
 *
 * API shapes mirror the FastAPI Pydantic schemas exactly; on-chain shapes mirror
 * the Solidity structs in VotexElectionTypes.sol. Keeping them here (rather than
 * inline) lets hooks, components, and tests share one source of truth.
 */

// --- Phase 1 status board -------------------------------------------------

export type SystemStatus = "ONLINE" | "READY" | "STANDBY" | "OFFLINE";

export interface StatusRow {
  label: string;
  status: SystemStatus;
}

// --- Lifecycle ------------------------------------------------------------

/** Solidity `ElectionState` names, indexed by enum ordinal. */
export const ELECTION_STATES = [
  "DRAFT",
  "REGISTRATION",
  "ACTIVE",
  "PAUSED",
  "ENDED",
  "RESULTS_FINALIZED",
] as const;

export type ElectionStateName = (typeof ELECTION_STATES)[number];

// --- API: elections -------------------------------------------------------

export interface ElectionSummary {
  id: number;
  blockchain_election_id: number;
  title: string;
  description: string;
  registration_start: number | null;
  registration_end: number | null;
  voting_start: number | null;
  voting_end: number | null;
  state: string;
  state_index: number;
  total_votes: number;
  total_registered_voters: number;
  created_block: number | null;
  created_tx_hash: string | null;
}

export interface ElectionDetail extends ElectionSummary {
  contract_address: string | null;
  creator: string | null;
  created_at: string;
  updated_at: string;
}

// --- API: candidates ------------------------------------------------------

export interface CandidateOut {
  id: number;
  blockchain_candidate_id: number;
  blockchain_election_id: number;
  name: string;
  description: string;
  vote_count: number;
  active: boolean;
  created_block: number | null;
  created_tx_hash: string | null;
}

// --- API: voters ----------------------------------------------------------

export interface VoterOut {
  wallet_address: string;
  credential_commitment: string | null;
  active: boolean;
  registered_at: number | null;
  registered_block: number | null;
  registered_tx_hash: string | null;
}

// --- API: votes -----------------------------------------------------------

export interface VoteOut {
  id: number;
  blockchain_election_id: number;
  blockchain_candidate_id: number;
  voter_address: string;
  block_number: number;
  transaction_hash: string;
  transaction_index: number;
  log_index: number;
  timestamp: number | null;
  gas_used: number | null;
}

// --- API: audit -----------------------------------------------------------

export interface AuditEventOut {
  id: number;
  event_type: string;
  contract_address: string;
  transaction_hash: string;
  block_number: number;
  block_hash: string | null;
  transaction_index: number;
  log_index: number;
  timestamp: number | null;
  payload: Record<string, unknown>;
  created_at: string;
}

// --- API: results ---------------------------------------------------------

export interface CandidateResult {
  candidate_id: number;
  name: string | null;
  vote_count: number;
  active: boolean | null;
}

export interface ResultSet {
  source: string;
  total_votes: number;
  candidates: CandidateResult[];
  winner_id: number | null;
  tie: boolean | null;
}

export interface ResultVerification {
  matches: boolean;
  differences: string[];
}

export interface ElectionResultsOut {
  election_id: number;
  indexed_result: ResultSet;
  blockchain_result: ResultSet | null;
  verification: ResultVerification;
}

// --- API: analytics + chain status ---------------------------------------

export interface AnalyticsOut {
  election_id: number;
  source: string;
  total_votes: number;
  registered_voters: number;
  turnout: number;
  votes_by_candidate: CandidateResult[];
  activity_over_time: Array<Record<string, unknown>>;
  state: string;
}

export interface BlockchainStatusOut {
  connected: boolean;
  chain_id: number | null;
  expected_chain_id: number;
  latest_block: number | null;
  rpc: string;
  factory_address: string | null;
  error: string | null;
}

export interface SyncStatusOut {
  network: string;
  contract_address: string;
  status: string;
  last_processed_block: number;
  last_processed_block_hash: string | null;
  latest_block: number | null;
  behind_by: number | null;
  events_indexed: number;
  updated_at: string | null;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
  pages: number;
  source: string;
}

export interface HealthOut {
  status: string;
  [key: string]: unknown;
}

// --- API: AI Election Guardian (supervisory only) -------------------------

export type ThreatLevel = "NORMAL" | "ELEVATED" | "HIGH" | "CRITICAL";

export interface AISignalOut {
  name: string;
  label?: string;
  value: number;
  weight?: number;
  contribution?: number;
  detail?: string | null;
  [key: string]: unknown;
}

export interface AIExplanationOut {
  summary?: string;
  drivers?: string[];
  [key: string]: unknown;
}

export interface GuardianStatusOut {
  status: string;
  risk_score: number;
  threat_level: string;
  last_analysis: string | null;
  active_alerts: number;
  elections_monitored: number;
  model_version: string;
  supervisory_only: boolean;
  disclaimer: string;
}

export interface AIRiskOut {
  election_id: number;
  risk_score: number;
  threat_level: string;
  guardian_status: string;
  signals: AISignalOut[];
  explanation: AIExplanationOut | null;
  window_start: number | null;
  window_end: number | null;
  analyzed_at: string | null;
  active_alerts: number;
  model_version: string;
  recommendation: string | null;
  actionable: boolean;
  supervisory_only: boolean;
  disclaimer: string;
}

export interface AIAlertOut {
  id: number;
  election_id: number;
  risk_score: number;
  threat_level: string;
  alert_type: string;
  title: string;
  description: string;
  detected_at: string | null;
  status: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  dedup_key: string;
  occurrence_count: number;
  first_seen: string | null;
  last_seen: string | null;
  window_start: number | null;
  window_end: number | null;
  model_version: string | null;
  metadata: Record<string, unknown>;
}

export interface PaginatedAlerts {
  items: AIAlertOut[];
  page: number;
  page_size: number;
  total: number;
  pages: number;
  source: string;
}

export interface AIFeatureSnapshotOut {
  id: number;
  election_id: number;
  window_start: number;
  window_end: number;
  timestamp: number;
  vote_count: number;
  voting_velocity: number;
  mean_interarrival: number | null;
  median_interarrival: number | null;
  velocity_zscore: number | null;
  candidate_entropy: number | null;
  unique_voters: number;
  gas_mean: number | null;
  gas_stddev: number | null;
  created_at: string | null;
}

export interface AIFeaturesOut {
  election_id: number;
  count: number;
  observations: number;
  calibrating: boolean;
  model_version: string;
  items: AIFeatureSnapshotOut[];
}

export interface AIAnalysisOut {
  election_id: number;
  risk_score: number;
  threat_level: string;
  guardian_status: string;
  signals: AISignalOut[];
  explanation: AIExplanationOut | null;
  recommendation: string | null;
  alerts_raised: number;
  supervisory_only: boolean;
  disclaimer: string;
}


// --- On-chain shapes (mirror VotexElectionTypes.sol) ----------------------

export interface OnChainElection {
  electionId: bigint;
  title: string;
  description: string;
  registrationStart: bigint;
  registrationEnd: bigint;
  votingStart: bigint;
  votingEnd: bigint;
  state: number;
  totalRegisteredVoters: bigint;
  totalVotes: bigint;
  createdAt: bigint;
  endedAt: bigint;
  exists: boolean;
}

export interface OnChainCandidate {
  candidateId: bigint;
  name: string;
  description: string;
  voteCount: bigint;
  active: boolean;
}

// --- Voting UX state machine ---------------------------------------------

export type VoteTxStatus =
  | "IDLE"
  | "SIMULATING"
  | "AWAITING_WALLET"
  | "SUBMITTED"
  | "CONFIRMING"
  | "CONFIRMED"
  | "REJECTED"
  | "FAILED";

export type EligibilityStatus =
  | "UNKNOWN"
  | "VERIFIED"
  | "NOT_REGISTERED"
  | "INACTIVE";
