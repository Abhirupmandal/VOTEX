"use client";

/**
 * Election administration writes (Phase 6 §5, §7, §8, §10).
 *
 * Every function here performs a REAL transaction against the deployed
 * ElectionFactory / ElectionInstance contracts and, on confirmation, invalidates
 * the relevant wagmi + React Query caches so the UI refetches from the chain
 * (§20). A capability reports CONFIRMED only after an on-chain receipt.
 */

import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Address } from "viem";

import { electionFactoryAbi, electionInstanceAbi } from "@/lib/contracts/abis";
import { contractAddresses } from "@/lib/contracts/addresses";
import { useAdminTx, type UseAdminTxResult } from "@/hooks/useAdminTx";

export interface ElectionDraftArgs {
  title: string;
  description: string;
  registrationStart: number;
  registrationEnd: number;
  votingStart: number;
  votingEnd: number;
}

export interface UseCreateElectionResult extends Omit<UseAdminTxResult, "run"> {
  /** Create a real election; resolves true only on an on-chain confirmation. */
  createElection: (draft: ElectionDraftArgs) => Promise<boolean>;
}

/** Factory-level election creation. */
export function useCreateElection(): UseCreateElectionResult {
  const tx = useAdminTx();
  const queryClient = useQueryClient();

  const createElection = useCallback(
    async (draft: ElectionDraftArgs) => {
      if (!contractAddresses.electionFactory) return false;
      return tx.run({
        address: contractAddresses.electionFactory,
        abi: electionFactoryAbi,
        functionName: "createElection",
        args: [
          draft.title,
          draft.description,
          BigInt(draft.registrationStart),
          BigInt(draft.registrationEnd),
          BigInt(draft.votingStart),
          BigInt(draft.votingEnd),
        ],
        onConfirmed: () => {
          void queryClient.invalidateQueries({ queryKey: ["readContract"] });
          void queryClient.invalidateQueries({ queryKey: ["readContracts"] });
          void queryClient.invalidateQueries({ queryKey: ["elections"] });
        },
      });
    },
    [tx, queryClient],
  );

  return useMemo(() => ({ ...tx, createElection }), [tx, createElection]);
}

export type LifecycleAction =
  | "openRegistration"
  | "startElection"
  | "pauseElection"
  | "resumeElection"
  | "endElection"
  | "finalizeResults";

export interface UseElectionLifecycleResult extends Omit<UseAdminTxResult, "run"> {
  /** The lifecycle action currently being run (or null). */
  activeAction: LifecycleAction | null;
  /** Run a lifecycle transition against a real election instance. */
  runAction: (
    action: LifecycleAction,
    electionAddress: Address,
    electionId: number,
  ) => Promise<boolean>;
}

/** Election lifecycle transitions on a deployed ElectionInstance. */
export function useElectionLifecycle(): UseElectionLifecycleResult {
  const tx = useAdminTx();
  const queryClient = useQueryClient();
  const [activeAction, setActiveAction] = useState<LifecycleAction | null>(null);

  const runAction = useCallback(
    async (action: LifecycleAction, electionAddress: Address, electionId: number) => {
      setActiveAction(action);
      const confirmed = await tx.run({
        address: electionAddress,
        abi: electionInstanceAbi,
        functionName: action,
        args: [],
        onConfirmed: () => {
          void queryClient.invalidateQueries({ queryKey: ["readContract"] });
          void queryClient.invalidateQueries({ queryKey: ["readContracts"] });
          void queryClient.invalidateQueries({ queryKey: ["election", electionId] });
          void queryClient.invalidateQueries({ queryKey: ["elections"] });
        },
      });
      setActiveAction(null);
      return confirmed;
    },
    [tx, queryClient],
  );

  return useMemo(
    () => ({ ...tx, activeAction, runAction }),
    [tx, activeAction, runAction],
  );
}

export interface UseCandidateAdminResult extends Omit<UseAdminTxResult, "run"> {
  addCandidate: (
    electionAddress: Address,
    electionId: number,
    name: string,
    description: string,
  ) => Promise<boolean>;
  deactivateCandidate: (
    electionAddress: Address,
    electionId: number,
    candidateId: number,
  ) => Promise<boolean>;
}

/** Candidate add / deactivate against a deployed ElectionInstance. */
export function useCandidateAdmin(): UseCandidateAdminResult {
  const tx = useAdminTx();
  const queryClient = useQueryClient();

  const invalidate = useCallback(
    (electionId: number) => {
      void queryClient.invalidateQueries({ queryKey: ["readContract"] });
      void queryClient.invalidateQueries({ queryKey: ["readContracts"] });
      void queryClient.invalidateQueries({ queryKey: ["election", electionId] });
    },
    [queryClient],
  );

  const addCandidate = useCallback(
    (electionAddress: Address, electionId: number, name: string, description: string) =>
      tx.run({
        address: electionAddress,
        abi: electionInstanceAbi,
        functionName: "addCandidate",
        args: [name, description],
        onConfirmed: () => invalidate(electionId),
      }),
    [tx, invalidate],
  );

  const deactivateCandidate = useCallback(
    (electionAddress: Address, electionId: number, candidateId: number) =>
      tx.run({
        address: electionAddress,
        abi: electionInstanceAbi,
        functionName: "deactivateCandidate",
        args: [BigInt(candidateId)],
        onConfirmed: () => invalidate(electionId),
      }),
    [tx, invalidate],
  );

  return useMemo(
    () => ({ ...tx, addCandidate, deactivateCandidate }),
    [tx, addCandidate, deactivateCandidate],
  );
}
