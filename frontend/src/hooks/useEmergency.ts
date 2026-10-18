"use client";

/**
 * Emergency controls (Phase 6 §14).
 *
 * Pause/resume go through the EmergencyController, which resolves the election
 * address via the factory and calls the instance's `emergencyPause`/`emergencyResume`.
 * Only a wallet holding SECURITY_OFFICER_ROLE can succeed. The AI Guardian may
 * RECOMMEND a pause but this module never triggers one automatically (§15).
 */

import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { emergencyControllerAbi } from "@/lib/contracts/abis";
import { contractAddresses } from "@/lib/contracts/addresses";
import { useAdminTx, type UseAdminTxResult } from "@/hooks/useAdminTx";

export interface UseEmergencyResult extends Omit<UseAdminTxResult, "run"> {
  pauseElection: (electionId: number) => Promise<boolean>;
  resumeElection: (electionId: number) => Promise<boolean>;
}

export function useEmergency(): UseEmergencyResult {
  const tx = useAdminTx();
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["readContract"] });
    void queryClient.invalidateQueries({ queryKey: ["readContracts"] });
    void queryClient.invalidateQueries({ queryKey: ["elections"] });
    void queryClient.invalidateQueries({ queryKey: ["audit"] });
  }, [queryClient]);

  const pauseElection = useCallback(
    (electionId: number) => {
      if (!contractAddresses.emergencyController) return Promise.resolve(false);
      return tx.run({
        address: contractAddresses.emergencyController,
        abi: emergencyControllerAbi,
        functionName: "pauseElection",
        args: [BigInt(electionId)],
        onConfirmed: invalidate,
      });
    },
    [tx, invalidate],
  );

  const resumeElection = useCallback(
    (electionId: number) => {
      if (!contractAddresses.emergencyController) return Promise.resolve(false);
      return tx.run({
        address: contractAddresses.emergencyController,
        abi: emergencyControllerAbi,
        functionName: "resumeElection",
        args: [BigInt(electionId)],
        onConfirmed: invalidate,
      });
    },
    [tx, invalidate],
  );

  return useMemo(
    () => ({ ...tx, pauseElection, resumeElection }),
    [tx, pauseElection, resumeElection],
  );
}
