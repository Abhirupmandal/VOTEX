/**
 * Maps raw wallet/viem/contract errors to human-readable, actionable messages.
 *
 * The raw technical detail is preserved on `rawMessage` so the UI can expose it
 * inside an expandable "technical details" section — never as the primary text.
 */

export interface FriendlyError {
  /** Short, human-readable headline. */
  title: string;
  /** One-sentence explanation of what the user can do. */
  message: string;
  /** Verbatim underlying error text (shown only when expanded). */
  rawMessage: string;
  /** Categorisation for iconography / colour. */
  kind:
    | "user-rejected"
    | "wrong-network"
    | "insufficient-funds"
    | "already-voted"
    | "not-registered"
    | "inactive"
    | "not-active"
    | "candidate"
    | "reverted"
    | "rpc"
    | "unknown";
}

/** Contract custom-error name -> friendly presentation. */
const CONTRACT_ERRORS: Record<string, Omit<FriendlyError, "rawMessage">> = {
  AlreadyVoted: {
    title: "Vote already cast",
    message:
      "This wallet has already voted in this election. The smart contract allows exactly one vote per wallet.",
    kind: "already-voted",
  },
  VoterNotRegistered: {
    title: "Not a registered voter",
    message:
      "This wallet is not on the election's voter registry. Ask an election administrator to register it.",
    kind: "not-registered",
  },
  VoterInactive: {
    title: "Voter inactive",
    message:
      "This wallet's voter record is currently deactivated, so it cannot cast a vote.",
    kind: "inactive",
  },
  ElectionNotActive: {
    title: "Election not active",
    message:
      "Voting is only possible while the election is ACTIVE. It may be paused, ended, or not yet started.",
    kind: "not-active",
  },
  VotingNotStarted: {
    title: "Voting has not started",
    message: "The voting window has not opened yet. Check the schedule and try again later.",
    kind: "not-active",
  },
  VotingEnded: {
    title: "Voting has ended",
    message: "The voting window has closed. No further votes can be cast.",
    kind: "not-active",
  },
  InvalidElectionState: {
    title: "Invalid election state",
    message: "The election is not in a state that accepts votes right now.",
    kind: "not-active",
  },
  CandidateNotFound: {
    title: "Unknown candidate",
    message: "The selected candidate does not exist in this election.",
    kind: "candidate",
  },
  CandidateInactive: {
    title: "Candidate inactive",
    message: "The selected candidate has been deactivated and cannot receive votes.",
    kind: "candidate",
  },
  NoCandidates: {
    title: "No candidates",
    message: "This election has no candidates to vote for.",
    kind: "candidate",
  },
};

const USER_REJECTION_PATTERNS = [
  "user rejected",
  "user denied",
  "rejected the request",
  "action_rejected",
  "4001",
];

const INSUFFICIENT_FUNDS_PATTERNS = [
  "insufficient funds",
  "insufficientfunds",
  "exceeds balance",
  "insufficient funds for gas",
];

const RPC_PATTERNS = [
  "failed to fetch",
  "network error",
  "could not detect network",
  "connection refused",
  "econnrefused",
  "timeout",
  "http request failed",
];

function findContractError(raw: string): Omit<FriendlyError, "rawMessage"> | undefined {
  for (const [name, friendly] of Object.entries(CONTRACT_ERRORS)) {
    if (raw.includes(name)) return friendly;
  }
  return undefined;
}

/** Convert an arbitrary thrown value into a {@link FriendlyError}. */
export function toFriendlyError(error: unknown): FriendlyError {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : JSON.stringify(error ?? {});

  const lower = raw.toLowerCase();

  if (USER_REJECTION_PATTERNS.some((p) => lower.includes(p))) {
    return {
      title: "Transaction rejected",
      message: "You rejected the transaction in your wallet. Nothing was sent on-chain.",
      kind: "user-rejected",
      rawMessage: raw,
    };
  }

  const contractError = findContractError(raw);
  if (contractError) {
    return { ...contractError, rawMessage: raw };
  }

  if (INSUFFICIENT_FUNDS_PATTERNS.some((p) => lower.includes(p))) {
    return {
      title: "Insufficient funds",
      message:
        "This wallet does not have enough balance to cover the transaction and gas. Fund the account and retry.",
      kind: "insufficient-funds",
      rawMessage: raw,
    };
  }

  if (RPC_PATTERNS.some((p) => lower.includes(p))) {
    return {
      title: "Network unavailable",
      message:
        "The blockchain RPC endpoint could not be reached. Confirm the local node is running and the RPC URL is correct.",
      kind: "rpc",
      rawMessage: raw,
    };
  }

  if (lower.includes("revert")) {
    return {
      title: "Transaction reverted",
      message:
        "The smart contract rejected this transaction. Read the technical details for the exact reason.",
      kind: "reverted",
      rawMessage: raw,
    };
  }

  return {
    title: "Something went wrong",
    message: "An unexpected error occurred while processing the transaction.",
    kind: "unknown",
    rawMessage: raw,
  };
}
