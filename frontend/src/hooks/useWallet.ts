"use client";

import { useCallback, useEffect, useState } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from "wagmi";

import {
  TARGET_CHAIN_ID,
  targetChain,
  networkName,
  type SupportedChainId,
} from "@/lib/wagmi";
import { shortenAddress } from "@/lib/formatting";

/** Coarse wallet lifecycle states surfaced to the UI (Phase 5 §4). */
export type WalletStatus =
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "WRONG_NETWORK"
  | "ERROR";

export interface UseWalletResult {
  /** Coarse status for badges/labels. */
  status: WalletStatus;
  /** Checksummed address, or undefined when disconnected. */
  address: `0x${string}` | undefined;
  /** Shortened address for compact display. */
  shortAddress: string;
  /** EIP-155 chain id, or undefined when disconnected. */
  chainId: number | undefined;
  /** Target expected chain id. */
  targetChainId: number;
  /** Human-readable network name. */
  networkName: string;
  /** Human-readable target network name. */
  targetNetworkName: string;
  /** True once a wallet is connected. */
  isConnected: boolean;
  /** True when connected to an unsupported chain. */
  isWrongNetwork: boolean;
  /** True while the wallet is mid-connection. */
  isConnecting: boolean;
  /** Latest connect/switch error message, if any. */
  error: string | null;
  /** True when the clipboard currently holds the address. */
  copied: boolean;
  /** Prompt the injected wallet to connect. */
  connectWallet: () => void;
  /** Disconnect the current wallet. */
  disconnectWallet: () => void;
  /** Ask the wallet to switch to the configured VOTEX network. */
  switchToVotexNetwork: () => void;
  /** Copy the address to the clipboard (feedback via `copied`). */
  copyAddress: () => Promise<void>;
  /** True when at least one injected connector is available. */
  hasConnector: boolean;
}

const EXPECTED_CHAIN_ID: SupportedChainId = TARGET_CHAIN_ID;

/**
 * Single source of truth for wallet state.
 *
 * Components never touch wagmi directly; they consume this hook so the
 * DISCONNECTED / CONNECTING / CONNECTED / WRONG_NETWORK / ERROR semantics are
 * consistent everywhere (Phase 5 §3, §4).
 */
export function useWallet(): UseWalletResult {
  const { address, isConnected, chainId, isConnecting } = useAccount();
  const { connect, connectors, isPending, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const {
    switchChain,
    isPending: isSwitching,
    error: switchError,
  } = useSwitchChain();

  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const isWrongNetwork =
    isConnected && chainId !== undefined && chainId !== EXPECTED_CHAIN_ID;

  let status: WalletStatus;
  if (connectError || switchError) {
    status = "ERROR";
  } else if (isConnecting || isPending || isSwitching) {
    status = "CONNECTING";
  } else if (!isConnected) {
    status = "DISCONNECTED";
  } else if (isWrongNetwork) {
    status = "WRONG_NETWORK";
  } else {
    status = "CONNECTED";
  }

  const connectWallet = useCallback(() => {
    const connector = connectors[0];
    if (connector) connect({ connector });
  }, [connect, connectors]);

  const disconnectWallet = useCallback(() => {
    disconnect();
  }, [disconnect]);

  const switchToVotexNetwork = useCallback(() => {
    switchChain({ chainId: EXPECTED_CHAIN_ID });
  }, [switchChain]);

  const copyAddress = useCallback(async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }, [address]);

  const error =
    connectError?.message ?? switchError?.message ?? null;

  return {
    status,
    address,
    shortAddress: shortenAddress(address),
    chainId,
    targetChainId: TARGET_CHAIN_ID,
    networkName: networkName(chainId),
    targetNetworkName: targetChain.name,
    isConnected,
    isWrongNetwork,
    isConnecting: isConnecting || isPending || isSwitching,
    error,
    copied,
    connectWallet,
    disconnectWallet,
    switchToVotexNetwork,
    copyAddress,
    hasConnector: connectors.length > 0,
  };
}
