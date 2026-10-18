/** Barrel export for the VOTEX frontend hooks layer. */

export { useWallet } from "./useWallet";
export type { UseWalletResult, WalletStatus } from "./useWallet";

export { useBlockchain } from "./useBlockchain";
export type { UseBlockchainResult } from "./useBlockchain";

export { useElection, useElectionAddress, useVoterEligibility } from "./useElection";
export type { UseElectionResult, UseVoterEligibilityResult } from "./useElection";

export { useElections } from "./useElections";
export type { UseElectionsParams, UseElectionsResult } from "./useElections";

export { useVoting } from "./useVoting";
export type { UseVotingResult, VoteReceiptInfo } from "./useVoting";

export { useAuditEvents, useTransactionEvents } from "./useAudit";
export type { UseAuditEventsParams, UseAuditEventsResult } from "./useAudit";

export { useAnalytics } from "./useResults";
export type { UseAnalyticsResult } from "./useResults";

// --- Phase 6: Admin Control Center ---------------------------------------

export { useAdminTx } from "./useAdminTx";
export type { UseAdminTxResult, RunAdminWriteParams } from "./useAdminTx";

export { useAdminRoles, useRoleMembership } from "./useAdminRoles";
export type { UseAdminRolesResult } from "./useAdminRoles";

export { useAdminElections } from "./useAdminElections";
export type { UseAdminElectionsResult, AdminElectionRow } from "./useAdminElections";

export {
  useCreateElection,
  useElectionLifecycle,
  useCandidateAdmin,
} from "./useElectionAdmin";
export type {
  UseCreateElectionResult,
  UseElectionLifecycleResult,
  UseCandidateAdminResult,
  LifecycleAction,
  ElectionDraftArgs,
} from "./useElectionAdmin";

export { useVoterAdmin } from "./useVoterAdmin";
export type { UseVoterAdminResult } from "./useVoterAdmin";

export { useVoterLookup } from "./useVoterLookup";
export type { VoterLookupResult } from "./useVoterLookup";

export { useVoterList } from "./useVoterList";
export type { UseVoterListParams, UseVoterListResult } from "./useVoterList";

export { useRoleAdmin } from "./useRoleAdmin";
export type { UseRoleAdminResult } from "./useRoleAdmin";

export { useEmergency } from "./useEmergency";
export type { UseEmergencyResult } from "./useEmergency";

export {
  useGuardianStatus,
  useElectionRisk,
  useElectionAlerts,
  useElectionFeatures,
  useTriggerAnalysis,
} from "./useGuardian";
export type {
  UseGuardianStatusResult,
  UseElectionRiskResult,
  UseElectionAlertsParams,
  UseElectionAlertsResult,
  UseElectionFeaturesResult,
  UseTriggerAnalysisResult,
} from "./useGuardian";

