"use client";

/**
 * Voter registry administration (Phase 6 §11, §12).
 *
 * Registration writes a credential COMMITMENT (bytes32) — never the raw
 * credential — so the contract holds no usable personal data. Deactivation is
 * non-destructive: the on-chain record persists and can be reactivated. All
 * three operations are REAL transactions against VoterRegistry.
 */

import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Address, Hex } from "viem";

import { voterRegistryAbi } from "@/lib/contracts/abis";
import { contractAddresses } from "@/lib/contracts/addresses";
import { useAdminTx, type UseAdminTxResult } from "@/hooks/useAdminTx";

const ZERO_COMMITMENT: Hex = `0x${"0".repeat(64)}` as Hex;

export interface UseVoterAdminResult extends Omit<UseAdminTxResult, "run"> {
  registerVoter: (
    voter: Address,
    credentialCommitment?: string,
  ) => Promise<boolean>;
  deactivateVoter: (voter: Address) => Promise<boolean>;
  reactivateVoter: (voter: Address) => Promise<boolean>;
}

export function useVoterAdmin(): UseVoterAdminResult {
  const tx = useAdminTx();
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["readContract"] });
    void queryClient.invalidateQueries({ queryKey: ["readContracts"] });
    void queryClient.invalidateQueries({ queryKey: ["voter"] });
    void queryClient.invalidateQueries({ queryKey: ["audit"] });
  }, [queryClient]);

  const registerVoter = useCallback(
    (voter: Address, credentialCommitment?: string) => {
      if (!contractAddresses.voterRegistry) return Promise.resolve(false);
      const commitment = (credentialCommitment?.trim() || ZERO_COMMITMENT) as Hex;
      return tx.run({
        address: contractAddresses.voterRegistry,
        abi: voterRegistryAbi,
        functionName: "registerVoter",
        args: [voter, commitment],
        onConfirmed: invalidate,
      });
    },
    [tx, invalidate],
  );

  const deactivateVoter = useCallback(
    (voter: Address) => {
      if (!contractAddresses.voterRegistry) return Promise.resolve(false);
      return tx.run({
        address: contractAddresses.voterRegistry,
        abi: voterRegistryAbi,
        functionName: "deactivateVoter",
        args: [voter],
        onConfirmed: invalidate,
      });
    },
    [tx, invalidate],
  );

  const reactivateVoter = useCallback(
    (voter: Address) => {
      if (!contractAddresses.voterRegistry) return Promise.resolve(false);
      return tx.run({
        address: contractAddresses.voterRegistry,
        abi: voterRegistryAbi,
        functionName: "reactivateVoter",
        args: [voter],
        onConfirmed: invalidate,
      });
    },
    [tx, invalidate],
  );

  return useMemo(
    () => ({ ...tx, registerVoter, deactivateVoter, reactivateVoter }),
    [tx, registerVoter, deactivateVoter, reactivateVoter],
  );
}
