/**
 * Client-side validation for admin forms (Phase 6 §6, §10, §11).
 *
 * These checks exist to give fast, friendly feedback BEFORE a wallet prompt.
 * They mirror — but never replace — the authoritative validation performed by
 * the Solidity contracts (EmptyTitle, InvalidTimeRange, EmptyCandidateName,
 * ZeroAddress, InvalidElectionState …). A payload that passes here can still be
 * rejected on-chain, and that rejection is surfaced verbatim by the tx layer.
 */

import { isAddress, parseEther } from "viem";

export interface ValidationResult {
  valid: boolean;
  /** Field name -> human-readable message. */
  errors: Record<string, string>;
}

const MAX_TITLE = 120;
const MAX_DESCRIPTION = 2000;
const MAX_CANDIDATE_NAME = 120;
const MAX_CANDIDATE_DESCRIPTION = 1000;

function empty(): ValidationResult {
  return { valid: true, errors: {} };
}

function finalize(errors: Record<string, string>): ValidationResult {
  return { valid: Object.keys(errors).length === 0, errors };
}

export interface ElectionDraft {
  title: string;
  description: string;
  /** Unix seconds. */
  registrationStart: number | null;
  registrationEnd: number | null;
  votingStart: number | null;
  votingEnd: number | null;
}

/**
 * Validate an election draft against both the contract's rules and sensible
 * range limits. `nowSeconds` is injected so the function stays pure/testable.
 */
export function validateElectionDraft(
  draft: ElectionDraft,
  nowSeconds: number,
): ValidationResult {
  const errors: Record<string, string> = {};
  const {
    title,
    description,
    registrationStart,
    registrationEnd,
    votingStart,
    votingEnd,
  } = draft;

  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    errors.title = "Title is required.";
  } else if (trimmedTitle.length > MAX_TITLE) {
    errors.title = `Title must be ${MAX_TITLE} characters or fewer.`;
  }

  if (description.trim().length > MAX_DESCRIPTION) {
    errors.description = `Description must be ${MAX_DESCRIPTION} characters or fewer.`;
  }

  if (registrationStart === null) errors.registrationStart = "Registration start is required.";
  if (registrationEnd === null) errors.registrationEnd = "Registration end is required.";
  if (votingStart === null) errors.votingStart = "Voting start is required.";
  if (votingEnd === null) errors.votingEnd = "Voting end is required.";

  if (Object.keys(errors).length > 0) return finalize(errors);

  const rs = registrationStart as number;
  const re = registrationEnd as number;
  const vs = votingStart as number;
  const ve = votingEnd as number;

  // Contract rules: registrationStart < registrationEnd, registrationStart >=
  // block.timestamp, votingStart < votingEnd, votingStart >= registrationEnd.
  if (rs >= re) {
    errors.registrationEnd = "Registration end must be after the registration start.";
  }
  if (vs >= ve) {
    errors.votingEnd = "Voting end must be after the voting start.";
  }
  if (vs < re) {
    errors.votingStart = "Voting must start after registration closes.";
  }
  if (rs < nowSeconds - 60) {
    errors.registrationStart = "Registration start cannot be in the past.";
  }
  if (re <= rs && !errors.registrationEnd) {
    errors.registrationEnd = "Registration window is invalid.";
  }
  if (ve - vs < 60) {
    errors.votingEnd = "The voting window must be at least one minute long.";
  }

  return finalize(errors);
}

export function validateCandidateInput(name: string, description: string): ValidationResult {
  const errors: Record<string, string> = {};
  const trimmed = name.trim();
  if (!trimmed) {
    errors.name = "Candidate name is required.";
  } else if (trimmed.length > MAX_CANDIDATE_NAME) {
    errors.name = `Name must be ${MAX_CANDIDATE_NAME} characters or fewer.`;
  }
  if (description.trim().length > MAX_CANDIDATE_DESCRIPTION) {
    errors.description = `Description must be ${MAX_CANDIDATE_DESCRIPTION} characters or fewer.`;
  }
  return finalize(errors);
}

export interface VoterDraft {
  wallet: string;
  credentialCommitment: string;
}

/**
 * Validate a voter-registration payload. The wallet must be a valid EVM
 * address; the credential commitment must be a 32-byte hex value (bytes32).
 */
export function validateVoterInput(draft: VoterDraft): ValidationResult {
  const errors: Record<string, string> = {};
  const wallet = draft.wallet.trim();

  if (!wallet) {
    errors.wallet = "Wallet address is required.";
  } else if (!isAddress(wallet)) {
    errors.wallet = "Enter a valid EVM wallet address (0x…).";
  }

  const commitment = draft.credentialCommitment.trim();
  if (commitment) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(commitment)) {
      errors.credentialCommitment =
        "Credential commitment must be a 32-byte hex value (0x + 64 hex characters).";
    }
  }

  return finalize(errors);
}

/** Validate a bare wallet address (used by role grant/revoke). */
export function validateAddress(value: string, field = "address"): ValidationResult {
  const errors: Record<string, string> = {};
  const trimmed = value.trim();
  if (!trimmed) {
    errors[field] = "Wallet address is required.";
  } else if (!isAddress(trimmed)) {
    errors[field] = "Enter a valid EVM wallet address (0x…).";
  }
  return finalize(errors);
}

/** Convert a `datetime-local` value (seconds precision) to Unix seconds. */
export function dateTimeLocalToUnix(value: string): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 1000);
}

/** Convert Unix seconds to the `datetime-local` input format (local time). */
export function unixToDateTimeLocal(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "";
  const date = new Date(seconds * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** Parse a decimal ETH string into wei, returning null on invalid input. */
export function safeParseEther(value: string): bigint | null {
  try {
    return parseEther(value);
  } catch {
    return null;
  }
}

export { empty as emptyValidation };
