"use client";

/**
 * On-chain election enumeration for the admin console (Phase 6 §4, §7, §18).
 *
 * Elections are enumerated DIRECTLY from the factory (`totalElections` +
 * `getElectionAt`) and each instance's `getElection()` struct is read from the
 * chain. The backend-indexed listing is fetched in parallel only for the
 * consistency check (§19) and never replaces on-chain truth.
 */

import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import type { Address } from "viem";

import { electionFactoryAbi, electionInstanceAbi } from "@/lib/contracts/abis";
import {
  electionFactoryAddress,
  isFactoryConfigured,
} from "@/lib/contracts/addresses";
import { TARGET_CHAIN_ID } from "@/lib/wagmi";
import { ELECTION_STATES, type OnChainElection } from "@/types";

export interface AdminElectionRow {
  electionId: number;
  address: Address;
  title: string;
  description: string;
  stateIndex: number;
  stateName: string;
  registrationStart: number;
  registrationEnd: number;
  votingStart: number;
  votingEnd: number;
  totalRegisteredVoters: number;
  totalVotes: number;
  candidateCount: number;
  createdAt: number;
  endedAt: number;
}

export interface UseAdminElectionsResult {
  elections: AdminElectionRow[];
  counts: {
    total: number;
    active: number;
    paused: number;
    ended: number;
    finalized: number;
    registration: number;
    draft: number;
  };
  totalVotes: number;
  totalRegisteredVoters: number;
  totalCandidates: number;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}


function stateNameOf(index: number): string {
  return ELECTION_STATES[index] ?? "UNKNOWN";
}

export function useAdminElections(): UseAdminElectionsResult {
  const factoryEnabled = isFactoryConfigured();

  const { data: total, isLoading: isLoadingTotal, error: totalError, refetch: refetchTotal } =
    useReadContract({
      address: electionFactoryAddress,
      abi: electionFactoryAbi,
      functionName: "totalElections",
      chainId: TARGET_CHAIN_ID,
      query: { enabled: factoryEnabled },
    });

  const totalCount = total !== undefined ? Number(total) : 0;

  // 1) Resolve each election's deployed address from the factory.
  const addressReads = useMemo(
    () =>
      Array.from({ length: totalCount }, (_, index) => ({
        address: electionFactoryAddress as Address,
        abi: electionFactoryAbi,
        functionName: "getElectionAt" as const,
        args: [BigInt(index)] as const,
        chainId: TARGET_CHAIN_ID,
      })),
    [totalCount],
  );

  const {
    data: addressData,
    isLoading: isLoadingAddresses,
    refetch: refetchAddresses,
  } = useReadContracts({
    contracts: addressReads,
    query: { enabled: factoryEnabled && totalCount > 0 },
  });

  const resolved = useMemo(() => {
    if (!addressData) return [] as Array<{ electionId: number; address: Address }>;
    const out: Array<{ electionId: number; address: Address }> = [];
    for (const entry of addressData) {
      if (entry?.status !== "success" || !entry.result) continue;
      const [id, addr] = entry.result as readonly [bigint, Address];
      out.push({ electionId: Number(id), address: addr });
    }
    return out;
  }, [addressData]);

  // 2) Read each instance's authoritative struct.
  const electionReads = useMemo(
    () =>
      resolved.map(({ address }) => ({
        address,
        abi: electionInstanceAbi,
        functionName: "getElection" as const,
        chainId: TARGET_CHAIN_ID,
      })),
    [resolved],
  );

  const candidateReads = useMemo(
    () =>
      resolved.map(({ address }) => ({
        address,
        abi: electionInstanceAbi,
        functionName: "candidateCount" as const,
        chainId: TARGET_CHAIN_ID,
      })),
    [resolved],
  );

  const {
    data: electionData,
    isLoading: isLoadingStructs,
    error: structError,
    refetch: refetchStructs,
  } = useReadContracts({
    contracts: electionReads,
    query: { enabled: resolved.length > 0 },
  });

  const {
    data: candidateData,
    refetch: refetchCandidateCounts,
  } = useReadContracts({
    contracts: candidateReads,
    query: { enabled: resolved.length > 0 },
  });

  const elections = useMemo<AdminElectionRow[]>(() => {
    if (!electionData) return [];
    const rows: AdminElectionRow[] = [];
    electionData.forEach((entry, index) => {
      if (entry?.status !== "success" || !entry.result) return;
      const raw = entry.result as unknown as OnChainElection;
      const meta = resolved[index];
      if (!meta) return;

      const candEntry = candidateData?.[index];
      const count =
        candEntry && candEntry.status === "success" && typeof candEntry.result === "bigint"
          ? Number(candEntry.result)
          : 0;

      rows.push({
        electionId: meta.electionId,
        address: meta.address,
        title: raw.title,
        description: raw.description,
        stateIndex: Number(raw.state),
        stateName: stateNameOf(Number(raw.state)),
        registrationStart: Number(raw.registrationStart),
        registrationEnd: Number(raw.registrationEnd),
        votingStart: Number(raw.votingStart),
        votingEnd: Number(raw.votingEnd),
        totalRegisteredVoters: Number(raw.totalRegisteredVoters),
        totalVotes: Number(raw.totalVotes),
        candidateCount: count,
        createdAt: Number(raw.createdAt),
        endedAt: Number(raw.endedAt),
      });
    });
    return rows.sort((a, b) => b.electionId - a.electionId);
  }, [electionData, candidateData, resolved]);


  const counts = useMemo(() => {
    const base = {
      total: elections.length,
      active: 0,
      paused: 0,
      ended: 0,
      finalized: 0,
      registration: 0,
      draft: 0,
    };
    for (const row of elections) {
      switch (row.stateName) {
        case "ACTIVE":
          base.active += 1;
          break;
        case "PAUSED":
          base.paused += 1;
          break;
        case "ENDED":
          base.ended += 1;
          break;
        case "RESULTS_FINALIZED":
          base.finalized += 1;
          break;
        case "REGISTRATION":
          base.registration += 1;
          break;
        case "DRAFT":
          base.draft += 1;
          break;
        default:
          break;
      }
    }
    return base;
  }, [elections]);

  const totalVotes = useMemo(
    () => elections.reduce((sum, row) => sum + row.totalVotes, 0),
    [elections],
  );
  const totalRegisteredVoters = useMemo(
    () => elections.reduce((sum, row) => sum + row.totalRegisteredVoters, 0),
    [elections],
  );
  const totalCandidates = useMemo(
    () => elections.reduce((sum, row) => sum + row.candidateCount, 0),
    [elections],
  );


  return {
    elections,
    counts,
    totalVotes,
    totalRegisteredVoters,
    totalCandidates,
    isLoading: isLoadingTotal || isLoadingAddresses || isLoadingStructs,
    error: ((totalError as Error | null) ?? (structError as Error | null)) ?? null,
    refetch: () => {
      void refetchTotal();
      void refetchAddresses();
      void refetchStructs();
      void refetchCandidateCounts();
    },
  };
}

