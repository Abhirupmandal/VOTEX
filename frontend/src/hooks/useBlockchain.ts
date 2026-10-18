"use client";

import { useQuery } from "@tanstack/react-query";
import { useAccount, useBlockNumber, useChainId, useReadContract } from "wagmi";

import { getBlockchainStatus, getSyncStatus } from "@/lib/api";
import { electionFactoryAbi } from "@/lib/contracts/abis";
import {
  electionFactoryAddress,
  isFactoryConfigured,
} from "@/lib/contracts/addresses";
import { TARGET_CHAIN_ID, targetChain, networkName } from "@/lib/wagmi";

export interface UseBlockchainResult {
  /** Connected chain id (from the wallet), if any. */
  chainId: number | undefined;
  /** Human-readable network name for `chainId`. */
  networkName: string;
  /** True when the wallet is on the VOTEX network. */
  isSupportedNetwork: boolean;
  /** Latest block number observed by the RPC transport. */
  blockNumber: bigint | undefined;
  /** Number of elections known to the factory (authoritative on-chain count). */
  totalElections: bigint | undefined;
  /** True while the factory count read is in flight. */
  isLoadingElections: boolean;
  /** Error encountered reading the factory, if any. */
  factoryError: Error | null;
  /** Backend indexer / RPC diagnostics (non-authoritative). */
  status: {
    backendReachable: boolean;
    connected: boolean;
    latestBlock: number | null;
    syncStatus: string | null;
    eventsIndexed: number | null;
    loading: boolean;
    error: string | null;
  };
  /** Manually refresh chain + backend readings. */
  refetch: () => void;
}

/**
 * Snapshot of blockchain connectivity for status displays.
 *
 * The authoritative election count is read directly from the factory contract;
 * the backend status is shown only as supplementary indexer diagnostics (§17).
 */
export function useBlockchain(): UseBlockchainResult {
  const chainId = useChainId();
  const { isConnected } = useAccount();
  const { data: blockNumber, refetch: refetchBlock } = useBlockNumber({
    watch: true,
  });

  const factoryEnabled = isFactoryConfigured();

  const {
    data: totalElections,
    isLoading: isLoadingElections,
    error: factoryError,
    refetch: refetchFactory,
  } = useReadContract({
    address: electionFactoryAddress,
    abi: electionFactoryAbi,
    functionName: "totalElections",
    chainId: TARGET_CHAIN_ID,
    query: { enabled: factoryEnabled },
  });

  const statusQuery = useQuery({
    queryKey: ["blockchain-status"],
    queryFn: ({ signal }) => getBlockchainStatus({ signal }),
    refetchInterval: 10_000,
    retry: 1,
  });

  const syncQuery = useQuery({
    queryKey: ["blockchain-sync"],
    queryFn: ({ signal }) => getSyncStatus({ signal }),
    refetchInterval: 15_000,
    retry: 1,
  });

  const isSupportedNetwork = isConnected
    ? chainId === TARGET_CHAIN_ID
    : true;

  const statusError =
    statusQuery.error instanceof Error
      ? statusQuery.error.message
      : statusQuery.error
        ? String(statusQuery.error)
        : null;

  return {
    chainId,
    networkName: networkName(chainId),
    isSupportedNetwork,
    blockNumber,
    totalElections,
    isLoadingElections,
    factoryError: (factoryError as Error | null) ?? null,
    status: {
      backendReachable: statusQuery.isSuccess,
      connected: statusQuery.data?.connected ?? false,
      latestBlock: statusQuery.data?.latest_block ?? null,
      syncStatus: syncQuery.data?.status ?? null,
      eventsIndexed: syncQuery.data?.events_indexed ?? null,
      loading: statusQuery.isLoading || syncQuery.isLoading,
      error: statusError,
    },
    refetch: () => {
      void refetchBlock();
      void refetchFactory();
      void statusQuery.refetch();
      void syncQuery.refetch();
    },
  };
}
