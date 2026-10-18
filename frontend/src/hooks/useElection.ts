"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useAccount,
  useReadContract,
  useReadContracts,
} from "wagmi";

import { getElection as getIndexedElection } from "@/lib/api";
import { electionFactoryAbi, electionInstanceAbi, voterRegistryAbi } from "@/lib/contracts/abis";
import {
  electionFactoryAddress,
  isFactoryConfigured,
  isRegistryConfigured,
  voterRegistryAddress,
} from "@/lib/contracts/addresses";
import { TARGET_CHAIN_ID } from "@/lib/wagmi";
import { ELECTION_STATES, type EligibilityStatus, type OnChainCandidate } from "@/types";

/** Resolve the authoritative election contract address from the factory. */
export function useElectionAddress(electionId: number | undefined) {
  const enabled = isFactoryConfigured() && electionId !== undefined;
  return useReadContract({
    address: electionFactoryAddress,
    abi: electionFactoryAbi,
    functionName: "getElectionAddress",
    args: enabled ? [BigInt(electionId)] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled },
  });
}

export interface UseElectionResult {
  electionId: number | undefined;
  address: `0x${string}` | undefined;
  /** Authoritative on-chain election struct. */
  election: {
    title: string;
    description: string;
    registrationStart: bigint;
    registrationEnd: bigint;
    votingStart: bigint;
    votingEnd: bigint;
    stateIndex: number;
    stateName: string;
    totalRegisteredVoters: bigint;
    totalVotes: bigint;
    createdAt: bigint;
    endedAt: bigint;
    exists: boolean;
  } | null;
  /** Authoritative on-chain candidates. */
  candidates: OnChainCandidate[];
  /** On-chain winner resolution. */
  winner: { winnerId: bigint; tie: boolean; maxVotes: bigint } | null;
  /** Off-chain indexed enrichment (optional; may be absent). */
  indexed: {
    contractAddress: string | null;
    createdTxHash: string | null;
    createdAt: string | null;
  } | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Reads an election's authoritative state, candidates, and winner directly from
 * the chain (Phase 5 §7, §8). The backend is queried only for supplementary
 * metadata and never overrides on-chain truth.
 */
export function useElection(electionId: number | undefined): UseElectionResult {
  const {
    data: address,
    isLoading: isLoadingAddress,
    refetch: refetchAddress,
  } = useElectionAddress(electionId);

  const contractAddress = address as `0x${string}` | undefined;
  const enabled = Boolean(contractAddress);

  const { data, isLoading, error, refetch } = useReadContracts({
    contracts: enabled
      ? [
          {
            address: contractAddress,
            abi: electionInstanceAbi,
            functionName: "getElection",
            chainId: TARGET_CHAIN_ID,
          },
          {
            address: contractAddress,
            abi: electionInstanceAbi,
            functionName: "getCandidates",
            chainId: TARGET_CHAIN_ID,
          },
          {
            address: contractAddress,
            abi: electionInstanceAbi,
            functionName: "getWinner",
            chainId: TARGET_CHAIN_ID,
          },
        ]
      : [],
    query: { enabled },
  });

  const indexedQuery = useQuery({
    queryKey: ["election-indexed", electionId],
    queryFn: ({ signal }) => getIndexedElection(electionId as number, { signal }),
    enabled: electionId !== undefined,
    retry: 1,
  });

  const electionRaw = data?.[0]?.result as
    | {
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
    | undefined;

  const candidatesRaw = data?.[1]?.result as
    | readonly OnChainCandidate[]
    | undefined;

  const winnerRaw = data?.[2]?.result as
    | readonly [bigint, boolean, bigint]
    | undefined;

  const election = useMemo(() => {
    if (!electionRaw) return null;
    const stateIndex = Number(electionRaw.state);
    return {
      title: electionRaw.title,
      description: electionRaw.description,
      registrationStart: electionRaw.registrationStart,
      registrationEnd: electionRaw.registrationEnd,
      votingStart: electionRaw.votingStart,
      votingEnd: electionRaw.votingEnd,
      stateIndex,
      stateName: ELECTION_STATES[stateIndex] ?? "UNKNOWN",
      totalRegisteredVoters: electionRaw.totalRegisteredVoters,
      totalVotes: electionRaw.totalVotes,
      createdAt: electionRaw.createdAt,
      endedAt: electionRaw.endedAt,
      exists: electionRaw.exists,
    };
  }, [electionRaw]);

  const candidates: OnChainCandidate[] = useMemo(
    () =>
      (candidatesRaw ?? []).map((c) => ({
        candidateId: c.candidateId,
        name: c.name,
        description: c.description,
        voteCount: c.voteCount,
        active: c.active,
      })),
    [candidatesRaw],
  );

  const winner = winnerRaw
    ? { winnerId: winnerRaw[0], tie: winnerRaw[1], maxVotes: winnerRaw[2] }
    : null;

  const indexed = indexedQuery.data
    ? {
        contractAddress: indexedQuery.data.contract_address,
        createdTxHash: indexedQuery.data.created_tx_hash,
        createdAt: indexedQuery.data.created_at,
      }
    : null;

  return {
    electionId,
    address: contractAddress,
    election,
    candidates,
    winner,
    indexed,
    isLoading: isLoadingAddress || isLoading,
    error: (error as Error | null) ?? null,
    refetch: () => {
      void refetchAddress();
      void refetch();
      void indexedQuery.refetch();
    },
  };
}

export interface UseVoterEligibilityResult {
  status: EligibilityStatus;
  /** True once the connected wallet has voted in this election. */
  hasVoted: boolean;
  /** True while any eligibility read is in flight. */
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Wallet eligibility for a specific election, read from the authoritative
 * VoterRegistry + election contract (Phase 5 §12, §13). The frontend is NOT the
 * security mechanism — the contract enforces every rule; this only informs UX.
 */
export function useVoterEligibility(
  electionId: number | undefined,
): UseVoterEligibilityResult {
  const { address, isConnected } = useAccount();
  const { data: electionAddress } = useElectionAddress(electionId);

  const registryEnabled = isRegistryConfigured() && isConnected && Boolean(address);
  const electionEnabled = Boolean(electionAddress) && isConnected && Boolean(address);

  const { data, isLoading, error, refetch } = useReadContracts({
    contracts: [
      {
        address: voterRegistryAddress,
        abi: voterRegistryAbi,
        functionName: "isRegistered",
        args: address ? [address] : undefined,
        chainId: TARGET_CHAIN_ID,
      },
      {
        address: voterRegistryAddress,
        abi: voterRegistryAbi,
        functionName: "isActive",
        args: address ? [address] : undefined,
        chainId: TARGET_CHAIN_ID,
      },
      {
        address: electionAddress as `0x${string}` | undefined,
        abi: electionInstanceAbi,
        functionName: "hasVoted",
        args: address ? [address] : undefined,
        chainId: TARGET_CHAIN_ID,
      },
    ],
    query: { enabled: registryEnabled || electionEnabled },
  });

  const isRegistered = data?.[0]?.result as boolean | undefined;
  const isActive = data?.[1]?.result as boolean | undefined;
  const hasVoted = (data?.[2]?.result as boolean | undefined) ?? false;

  let status: EligibilityStatus = "UNKNOWN";
  if (!isConnected) {
    status = "UNKNOWN";
  } else if (isRegistered === false) {
    status = "NOT_REGISTERED";
  } else if (isActive === false) {
    status = "INACTIVE";
  } else if (isRegistered === true && isActive === true) {
    status = "VERIFIED";
  }

  return {
    status,
    hasVoted,
    isLoading,
    error: (error as Error | null) ?? null,
    refetch: () => void refetch(),
  };
}
