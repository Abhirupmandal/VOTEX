"use client";

import { useCallback, useMemo, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import type { Address } from "viem";

import { electionInstanceAbi } from "@/lib/contracts/abis";
import { toFriendlyError, type FriendlyError } from "@/lib/errors";
import type { VoteTxStatus } from "@/types";

export interface VoteReceiptInfo {
  transactionHash: `0x${string}`;
  blockNumber: bigint;
  gasUsed: bigint;
  status: "success" | "reverted";
}

export interface UseVotingResult {
  /** Current step of the vote transaction state machine. */
  status: VoteTxStatus;
  /** Broadcast transaction hash (available from SUBMITTED onward). */
  txHash: `0x${string}` | undefined;
  /** Confirmed receipt metadata (available when CONFIRMED). */
  receipt: VoteReceiptInfo | undefined;
  /** Human-readable error (only in REJECTED / FAILED). */
  error: FriendlyError | null;
  /** True while a transaction is mid-flight (never leaves a stuck spinner). */
  isBusy: boolean;
  /** True when the vote was recorded on-chain. */
  isConfirmed: boolean;
  /** Execute the full cast → broadcast → confirm workflow. */
  castVote: (
    electionId: number,
    candidateId: number,
    contractAddress: Address,
  ) => Promise<void>;
  /** Return the machine to IDLE (e.g. dismissing a dialog). */
  reset: () => void;
}

const BUSY_STATES: VoteTxStatus[] = [
  "SIMULATING",
  "AWAITING_WALLET",
  "SUBMITTED",
  "CONFIRMING",
];

/**
 * Transaction state machine for casting a vote (Phase 5 §9, §10).
 *
 * Steps, in order:
 *   IDLE → SIMULATING → AWAITING_WALLET → SUBMITTED → CONFIRMING → CONFIRMED
 * with REJECTED (user declined) and FAILED (revert / RPC error) as terminal
 * error states. Every branch resolves — there is no infinite loading state.
 *
 * The vote is a REAL transaction against the Phase 2 ElectionInstance contract;
 * nothing here simulates success.
 */
export function useVoting(): UseVotingResult {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [status, setStatus] = useState<VoteTxStatus>("IDLE");
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [receipt, setReceipt] = useState<VoteReceiptInfo | undefined>(undefined);
  const [error, setError] = useState<FriendlyError | null>(null);

  const reset = useCallback(() => {
    setStatus("IDLE");
    setTxHash(undefined);
    setReceipt(undefined);
    setError(null);
  }, []);

  const castVote = useCallback(
    async (electionId: number, candidateId: number, contractAddress: Address) => {
      setError(null);
      setReceipt(undefined);
      setTxHash(undefined);

      if (!publicClient || !walletClient || !address) {
        setError(toFriendlyError(new Error("Wallet is not connected.")));
        setStatus("FAILED");
        return;
      }

      try {
        // 1) Pre-flight simulation — surfaces contract reverts before spending gas.
        setStatus("SIMULATING");
        const { request } = await publicClient.simulateContract({
          account: address,
          address: contractAddress,
          abi: electionInstanceAbi,
          functionName: "castVote",
          args: [BigInt(electionId), BigInt(candidateId)],
        });

        // 2) Wallet prompt — user approves or rejects in their wallet.
        setStatus("AWAITING_WALLET");
        const hash = await walletClient.writeContract(request);

        // 3) Broadcast — we now have a transaction hash to display.
        setTxHash(hash);
        setStatus("SUBMITTED");

        // 4) Mine — wait for exactly one confirmation.
        setStatus("CONFIRMING");
        const mined = await publicClient.waitForTransactionReceipt({
          hash,
          confirmations: 1,
        });

        const info: VoteReceiptInfo = {
          transactionHash: hash,
          blockNumber: mined.blockNumber,
          gasUsed: mined.gasUsed,
          status: mined.status === "success" ? "success" : "reverted",
        };
        setReceipt(info);

        if (mined.status === "success") {
          setStatus("CONFIRMED");
        } else {
          setStatus("FAILED");
          setError(
            toFriendlyError(
              new Error("Transaction reverted on-chain. No vote was recorded."),
            ),
          );
        }
      } catch (caught) {
        const friendly = toFriendlyError(caught);
        setError(friendly);
        setStatus(friendly.kind === "user-rejected" ? "REJECTED" : "FAILED");
      }
    },
    [address, publicClient, walletClient],
  );

  const isBusy = useMemo(() => BUSY_STATES.includes(status), [status]);

  return {
    status,
    txHash,
    receipt,
    error,
    isBusy,
    isConfirmed: status === "CONFIRMED",
    castVote,
    reset,
  };
}
