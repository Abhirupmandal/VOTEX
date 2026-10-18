/**
 * Real admin transaction executor (Phase 6 §3, §9, §17).
 *
 * Every administrative write in the Admin Control Center flows through this one
 * function so the transaction lifecycle is identical everywhere:
 *
 *   SIMULATING → AWAITING_WALLET → SUBMITTED → CONFIRMING → CONFIRMED
 * with REJECTED (user declined) and FAILED (revert / RPC) as terminal states.
 *
 * It performs a REAL `eth_call` simulation, a REAL wallet-signed transaction,
 * and waits for a REAL on-chain receipt. There is no simulation of success and
 * no local-state shortcut: a caller only reaches CONFIRMED when the chain says
 * so. The function is intentionally framework-free so it can be unit tested
 * with a mocked client and reused by any hook.
 */

import type {
  Abi,
  Address,
  Hex,
  PublicClient,
  WalletClient,
} from "viem";

import { toFriendlyError, type FriendlyError } from "@/lib/errors";

export type AdminTxStatus =
  | "IDLE"
  | "SIMULATING"
  | "AWAITING_WALLET"
  | "SUBMITTED"
  | "CONFIRMING"
  | "CONFIRMED"
  | "REJECTED"
  | "FAILED";

export const ADMIN_BUSY_STATES: AdminTxStatus[] = [
  "SIMULATING",
  "AWAITING_WALLET",
  "SUBMITTED",
  "CONFIRMING",
];

export interface AdminTxReceipt {
  transactionHash: Hex;
  blockNumber: bigint;
  gasUsed: bigint;
  status: "success" | "reverted";
}

export interface AdminTxOutcome {
  status: AdminTxStatus;
  hash?: Hex;
  receipt?: AdminTxReceipt;
  error?: FriendlyError;
}

export interface ExecuteAdminWriteParams {
  publicClient: PublicClient;
  walletClient: WalletClient;
  account: Address;
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  onStatus?: (status: AdminTxStatus) => void;
  onHash?: (hash: Hex) => void;
}

/**
 * Run the full write workflow against a real contract call.
 *
 * Resolves — never rejects — with an {@link AdminTxOutcome} so the caller can
 * render a deterministic terminal state (success OR a human-readable error).
 */
export async function executeAdminWrite(
  params: ExecuteAdminWriteParams,
): Promise<AdminTxOutcome> {
  const {
    publicClient,
    walletClient,
    account,
    address,
    abi,
    functionName,
    args = [],
    onStatus,
    onHash,
  } = params;

  const emit = (status: AdminTxStatus) => onStatus?.(status);

  try {
    // 1) Pre-flight simulation — surfaces a contract revert before spending gas.
    emit("SIMULATING");
    const { request } = await publicClient.simulateContract({
      account,
      address,
      abi,
      functionName,
      args,
    } as never);

    // 2) Wallet prompt — the user approves or rejects on their own device.
    emit("AWAITING_WALLET");
    const hash = (await walletClient.writeContract(request as never)) as Hex;

    // 3) Broadcast — a real transaction hash now exists.
    onHash?.(hash);
    emit("SUBMITTED");

    // 4) Mine — wait for exactly one confirmation.
    emit("CONFIRMING");
    const mined = await publicClient.waitForTransactionReceipt({
      hash,
      confirmations: 1,
    });

    const receipt: AdminTxReceipt = {
      transactionHash: hash,
      blockNumber: mined.blockNumber,
      gasUsed: mined.gasUsed,
      status: mined.status === "success" ? "success" : "reverted",
    };

    if (mined.status === "success") {
      emit("CONFIRMED");
      return { status: "CONFIRMED", hash, receipt };
    }

    const reverted = toFriendlyError(
      new Error("Transaction reverted on-chain. No state change was applied."),
    );
    emit("FAILED");
    return { status: "FAILED", hash, receipt, error: reverted };
  } catch (caught) {
    const friendly = toFriendlyError(caught);
    const status: AdminTxStatus =
      friendly.kind === "user-rejected" ? "REJECTED" : "FAILED";
    emit(status);
    return { status, error: friendly };
  }
}
