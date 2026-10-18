"use client";

import {
  AlertTriangle,
  BadgeCheck,
  ShieldQuestion,
  UserX,
  Vote,
} from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import type { EligibilityStatus } from "@/types";

export interface EligibilityBannerProps {
  status: EligibilityStatus;
  hasVoted: boolean;
  isConnected: boolean;
  isLoading: boolean;
}

/**
 * Eligibility / double-vote status banner (Phase 5 §12, §13).
 *
 * The status is derived from on-chain reads (VoterRegistry + election
 * `hasVoted`). The frontend only *reports* what the contract says; the contract
 * remains the sole enforcement point.
 */
export function EligibilityBanner({
  status,
  hasVoted,
  isConnected,
  isLoading,
}: EligibilityBannerProps) {
  if (!isConnected) {
    return (
      <Alert variant="info" title="Connect your wallet to check eligibility">
        <p className="flex items-center gap-2">
          <ShieldQuestion className="h-3.5 w-3.5" aria-hidden />
          Eligibility is read from the VoterRegistry for your connected address.
        </p>
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <Alert variant="info" title="Checking your eligibility…" data-testid="eligibility-loading">
        <span className="flex items-center gap-2">
          <Spinner className="h-3.5 w-3.5" label="Checking eligibility" />
          Reading the VoterRegistry and election contract…
        </span>
      </Alert>
    );
  }

  if (hasVoted) {
    return (
      <Alert
        variant="success"
        title="✓ VOTE ALREADY CAST"
        data-testid="eligibility-voted"
      >
        <p className="flex items-center gap-2">
          <Vote className="h-3.5 w-3.5" aria-hidden />
          This wallet has already voted in this election. The election contract
          enforces one vote per wallet.
        </p>
      </Alert>
    );
  }

  switch (status) {
    case "VERIFIED":
      return (
        <Alert
          variant="success"
          title="✓ VERIFIED VOTER"
          data-testid="eligibility-verified"
        >
          <p className="flex items-center gap-2">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
            Your wallet is registered and active. You may cast one vote.
          </p>
        </Alert>
      );
    case "NOT_REGISTERED":
      return (
        <Alert
          variant="danger"
          title="✕ NOT REGISTERED"
          data-testid="eligibility-not-registered"
        >
          <p className="flex items-center gap-2">
            <UserX className="h-3.5 w-3.5" aria-hidden />
            This wallet is not in the VoterRegistry for this election. Contact the
            election administrator.
          </p>
        </Alert>
      );
    case "INACTIVE":
      return (
        <Alert
          variant="warning"
          title="⚠ VOTER INACTIVE"
          data-testid="eligibility-inactive"
        >
          <p className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            This wallet is registered but currently inactive. Voting is blocked
            until it is reactivated.
          </p>
        </Alert>
      );
    default:
      return (
        <Alert
          variant="info"
          title="Eligibility unknown"
          data-testid="eligibility-unknown"
        >
          <p>Unable to determine eligibility from the VoterRegistry right now.</p>
        </Alert>
      );
  }
}
