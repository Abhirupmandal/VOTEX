"use client";

/**
 * Voter lookup for the admin voter console (Phase 6 §11, §12, §19).
 *
 * The wallet's registry record is read DIRECTLY from VoterRegistry on-chain
 * (`getVoter`, `isRegistered`). The backend indexed record supplies the
 * registration transaction hash and block for display and for the consistency
 * check. On-chain status is authoritative.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useReadContracts } from "wagmi";
import { isAddress, type Address } from "viem";

import { getVoter as getIndexedVoter } from "@/lib/api";
import { voterRegistryAbi } from "@/lib/contracts/abis";
import {
  isRegistryConfigured,
  voterRegistryAddress,
} from "@/lib/contracts/addresses";
import { TARGET_CHAIN_ID } from "@/lib/wagmi";
import type { VoterOut } from "@/types";

export interface VoterLookupResult {
  address: Address | undefined;
  /** On-chain registration flag. */
  registered: boolean;
  /** On-chain active flag. */
  active: boolean;
  /** On-chain credential commitment (bytes32 hex). */
  credentialCommitment: string | undefined;
  /** On-chain registration timestamp (seconds). */
  registeredAt: number | undefined;
  /** Backend-indexed record (tx hash / block enrichment). */
  indexed: VoterOut | undefined;
  /** True when the on-chain and indexed active flags disagree. */
  hasMismatch: boolean;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useVoterLookup(wallet: string | undefined): VoterLookupResult {
  const parsed = wallet && isAddress(wallet) ? (wallet as Address) : undefined;
  const enabled = Boolean(parsed && isRegistryConfigured());

  const { data, isLoading, error, refetch } = useReadContracts({
    contracts: parsed
      ? [
          {
            address: voterRegistryAddress as Address,
            abi: voterRegistryAbi,
            functionName: "isRegistered" as const,
            args: [parsed] as const,
            chainId: TARGET_CHAIN_ID,
          },
          {
            address: voterRegistryAddress as Address,
            abi: voterRegistryAbi,
            functionName: "isActive" as const,
            args: [parsed] as const,
            chainId: TARGET_CHAIN_ID,
          },
          {
            address: voterRegistryAddress as Address,
            abi: voterRegistryAbi,
            functionName: "getVoter" as const,
            args: [parsed] as const,
            chainId: TARGET_CHAIN_ID,
          },
        ]
      : [],
    query: { enabled },
  });

  const registered = Boolean(data?.[0]?.status === "success" && data[0].result);
  const active = Boolean(data?.[1]?.status === "success" && data[1].result);

  const voterStruct = useMemo(() => {
    const entry = data?.[2];
    if (!entry || entry.status !== "success" || !entry.result) return undefined;
    return entry.result as unknown as {
      registered: boolean;
      active: boolean;
      credentialCommitment: string;
      registeredAt: bigint;
    };
  }, [data]);

  const indexedQuery = useQuery({
    queryKey: ["voter-indexed", parsed],
    queryFn: ({ signal }) => getIndexedVoter(parsed as string, { signal }),
    enabled: Boolean(parsed),
    retry: 1,
  });

  const hasMismatch = useMemo(() => {
    const indexed = indexedQuery.data;
    if (!indexed || !voterStruct) return false;
    return indexed.active !== active;
  }, [indexedQuery.data, voterStruct, active]);

  return {
    address: parsed,
    registered,
    active,
    credentialCommitment: voterStruct?.credentialCommitment,
    registeredAt: voterStruct ? Number(voterStruct.registeredAt) : undefined,
    indexed: indexedQuery.data,
    hasMismatch,
    isLoading: isLoading || indexedQuery.isLoading,
    error: (error as Error | null) ?? (indexedQuery.error as Error | null) ?? null,
    refetch: () => {
      void refetch();
      void indexedQuery.refetch();
    },
  };
}
