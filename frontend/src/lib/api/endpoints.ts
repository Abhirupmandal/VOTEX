/**
 * Typed backend endpoint functions.
 *
 * These wrap the FastAPI read/observability surface. They are deliberately
 * narrow: discovery, audit trail, and analytics. Anything that determines the
 * OUTCOME of a vote (eligibility, state, submission, verification) goes through
 * chain reads/writes in the hooks layer, never through here.
 */

import type {
  AIAlertOut,
  AIAnalysisOut,
  AIFeaturesOut,
  AIRiskOut,
  AnalyticsOut,
  AuditEventOut,
  BlockchainStatusOut,
  CandidateOut,
  ElectionDetail,
  ElectionResultsOut,
  ElectionSummary,
  GuardianStatusOut,
  HealthOut,
  Paginated,
  PaginatedAlerts,
  SyncStatusOut,
  VoteOut,
  VoterOut,
} from "@/types";

import { apiGet, apiPost } from "./client";


/** Optional abort signal, threaded from React Query. */
export interface ApiOptions {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

// --- Health ----------------------------------------------------------------

export function getHealth(opts: ApiOptions = {}): Promise<HealthOut> {
  return apiGet<HealthOut>("/health", opts);
}

export interface DatabaseHealthOut {
  status: string;
  database: string;
}

export function getDatabaseHealth(
  opts: ApiOptions = {},
): Promise<DatabaseHealthOut> {
  return apiGet<DatabaseHealthOut>("/health/db", opts);
}

// --- Blockchain status -----------------------------------------------------

export function getBlockchainStatus(
  opts: ApiOptions = {},
): Promise<BlockchainStatusOut> {
  return apiGet<BlockchainStatusOut>("/blockchain/status", opts);
}

export function getSyncStatus(opts: ApiOptions = {}): Promise<SyncStatusOut> {
  return apiGet<SyncStatusOut>("/blockchain/sync", opts);
}

// --- Elections -------------------------------------------------------------

export interface ListElectionsParams {
  state?: string;
  page?: number;
  pageSize?: number;
}

export function listElections(
  params: ListElectionsParams = {},
  opts: ApiOptions = {},
): Promise<Paginated<ElectionSummary>> {
  return apiGet<Paginated<ElectionSummary>>("/elections", {
    ...opts,
    query: {
      state: params.state,
      page: params.page,
      page_size: params.pageSize,
    },
  });
}

export function getElection(
  electionId: number,
  opts: ApiOptions = {},
): Promise<ElectionDetail> {
  return apiGet<ElectionDetail>(`/elections/${electionId}`, opts);
}

export function getElectionResults(
  electionId: number,
  opts: ApiOptions = {},
): Promise<ElectionResultsOut> {
  return apiGet<ElectionResultsOut>(`/elections/${electionId}/results`, opts);
}

export function getElectionAnalytics(
  electionId: number,
  opts: ApiOptions = {},
): Promise<AnalyticsOut> {
  return apiGet<AnalyticsOut>(`/elections/${electionId}/analytics`, opts);
}

// --- Candidates ------------------------------------------------------------

export function listCandidates(
  electionId: number,
  opts: ApiOptions = {},
): Promise<CandidateOut[]> {
  return apiGet<CandidateOut[]>(`/elections/${electionId}/candidates`, opts);
}

export function getCandidate(
  electionId: number,
  candidateId: number,
  opts: ApiOptions = {},
): Promise<CandidateOut> {
  return apiGet<CandidateOut>(
    `/elections/${electionId}/candidates/${candidateId}`,
    opts,
  );
}

// --- Votes -----------------------------------------------------------------

export interface PageParams {
  page?: number;
  pageSize?: number;
}

export function listVotes(
  electionId: number,
  params: PageParams = {},
  opts: ApiOptions = {},
): Promise<Paginated<VoteOut>> {
  return apiGet<Paginated<VoteOut>>(`/elections/${electionId}/votes`, {
    ...opts,
    query: { page: params.page, page_size: params.pageSize },
  });
}

// --- Voters ----------------------------------------------------------------

export interface ListVotersParams extends PageParams {
  active?: boolean;
}

export function listVoters(
  params: ListVotersParams = {},
  opts: ApiOptions = {},
): Promise<Paginated<VoterOut>> {
  return apiGet<Paginated<VoterOut>>("/voters", {
    ...opts,
    query: {
      active: params.active,
      page: params.page,
      page_size: params.pageSize,
    },
  });
}

export function getVoter(
  walletAddress: string,
  opts: ApiOptions = {},
): Promise<VoterOut> {
  return apiGet<VoterOut>(`/voters/${walletAddress}`, opts);
}


// --- Audit -----------------------------------------------------------------

export interface ListAuditEventsParams extends PageParams {
  eventType?: string;
  contractAddress?: string;
  electionId?: number;
}

export function listAuditEvents(
  params: ListAuditEventsParams = {},
  opts: ApiOptions = {},
): Promise<Paginated<AuditEventOut>> {
  return apiGet<Paginated<AuditEventOut>>("/audit/events", {
    ...opts,
    query: {
      event_type: params.eventType,
      contract_address: params.contractAddress,
      election_id: params.electionId,
      page: params.page,
      page_size: params.pageSize,
    },
  });
}

export function getTransactionEvents(
  transactionHash: string,
  opts: ApiOptions = {},
): Promise<AuditEventOut[]> {
  return apiGet<AuditEventOut[]>(`/audit/transactions/${transactionHash}`, opts);
}

// --- AI Election Guardian (supervisory, read-only) ------------------------

export function getGuardianStatus(opts: ApiOptions = {}): Promise<GuardianStatusOut> {
  return apiGet<GuardianStatusOut>("/guardian/status", opts);
}

export function getElectionRisk(
  electionId: number,
  opts: ApiOptions = {},
): Promise<AIRiskOut> {
  return apiGet<AIRiskOut>(`/elections/${electionId}/risk`, opts);
}

export interface ListAlertsParams extends PageParams {
  status?: string;
  threatLevel?: string;
}

export function listElectionAlerts(
  electionId: number,
  params: ListAlertsParams = {},
  opts: ApiOptions = {},
): Promise<PaginatedAlerts> {
  return apiGet<PaginatedAlerts>(`/elections/${electionId}/alerts`, {
    ...opts,
    query: {
      status: params.status,
      threat_level: params.threatLevel,
      page: params.page,
      page_size: params.pageSize,
    },
  });
}

export function getAlert(
  alertId: number,
  opts: ApiOptions = {},
): Promise<AIAlertOut> {
  return apiGet<AIAlertOut>(`/alerts/${alertId}`, opts);
}

export function acknowledgeAlert(
  alertId: number,
  opts: ApiOptions = {},
): Promise<AIAlertOut> {
  return apiPost<AIAlertOut>(`/alerts/${alertId}/acknowledge`, undefined, opts);
}

export function resolveAlert(
  alertId: number,
  opts: ApiOptions = {},
): Promise<AIAlertOut> {
  return apiPost<AIAlertOut>(`/alerts/${alertId}/resolve`, undefined, opts);
}

export function getElectionFeatures(
  electionId: number,
  limit: number = 20,
  opts: ApiOptions = {},
): Promise<AIFeaturesOut> {
  return apiGet<AIFeaturesOut>(`/elections/${electionId}/ai/features`, {
    ...opts,
    query: { limit },
  });
}

export function triggerAIAnalysis(
  electionId: number,
  opts: ApiOptions = {},
): Promise<AIAnalysisOut> {
  return apiPost<AIAnalysisOut>(`/elections/${electionId}/ai/analyze`, undefined, opts);
}

