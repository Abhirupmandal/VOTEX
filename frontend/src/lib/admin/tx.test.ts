import { describe, expect, it, vi } from "vitest";
import type { Hex, PublicClient, WalletClient } from "viem";

import { executeAdminWrite, type ExecuteAdminWriteParams } from "@/lib/admin/tx";

const ACCOUNT = "0x0000000000000000000000000000000000000001";
const CONTRACT = "0x0000000000000000000000000000000000000002";
const ABI = [] as const;
const TX_HASH = `0x${"a".repeat(64)}` as Hex;

function makeClients(options: {
  simulate?: () => Promise<unknown>;
  write?: () => Promise<Hex>;
  wait?: () => Promise<unknown>;
}) {
  const simulateContract = vi.fn(
    options.simulate ?? (async () => ({ request: { to: CONTRACT } })),
  );
  const waitForTransactionReceipt = vi.fn(
    options.wait ??
      (async () => ({
        blockNumber: 42n,
        gasUsed: 21_000n,
        status: "success",
      })),
  );
  const writeContract = vi.fn(options.write ?? (async () => TX_HASH));

  return {
    publicClient: { simulateContract, waitForTransactionReceipt } as unknown as PublicClient,
    walletClient: { writeContract } as unknown as WalletClient,
  };
}

function params(
  clients: ReturnType<typeof makeClients>,
  extra: Partial<ExecuteAdminWriteParams> = {},
): ExecuteAdminWriteParams {
  return {
    publicClient: clients.publicClient,
    walletClient: clients.walletClient,
    account: ACCOUNT,
    address: CONTRACT,
    abi: ABI,
    functionName: "doThing",
    ...extra,
  };
}

describe("executeAdminWrite", () => {
  it("resolves CONFIRMED with a receipt on a successful write", async () => {
    const clients = makeClients({});
    const outcome = await executeAdminWrite(params(clients));
    expect(outcome.status).toBe("CONFIRMED");
    expect(outcome.hash).toBe(TX_HASH);
    expect(outcome.receipt?.blockNumber).toBe(42n);
    expect(outcome.receipt?.status).toBe("success");
  });

  it("emits the full lifecycle in order", async () => {
    const clients = makeClients({});
    const seen: string[] = [];
    await executeAdminWrite(params(clients, { onStatus: (s) => seen.push(s) }));
    expect(seen).toEqual([
      "SIMULATING",
      "AWAITING_WALLET",
      "SUBMITTED",
      "CONFIRMING",
      "CONFIRMED",
    ]);
  });

  it("hands the transaction hash to onHash", async () => {
    const clients = makeClients({});
    const onHash = vi.fn();
    await executeAdminWrite(params(clients, { onHash }));
    expect(onHash).toHaveBeenCalledWith(TX_HASH);
  });

  it("passes the account and args to the simulation", async () => {
    const clients = makeClients({});
    await executeAdminWrite(params(clients, { args: ["a", 1n] }));
    expect(clients.publicClient.simulateContract).toHaveBeenCalledWith(
      expect.objectContaining({ account: ACCOUNT, functionName: "doThing", args: ["a", 1n] }),
    );
  });

  it("surfaces an on-chain revert as FAILED with a friendly error", async () => {
    const clients = makeClients({
      wait: async () => ({ blockNumber: 1n, gasUsed: 0n, status: "reverted" }),
    });
    const outcome = await executeAdminWrite(params(clients));
    expect(outcome.status).toBe("FAILED");
    expect(outcome.receipt?.status).toBe("reverted");
    expect(outcome.error?.kind).toBe("reverted");
  });

  it("treats a user rejection as REJECTED (not a generic failure)", async () => {
    const clients = makeClients({
      write: async () => {
        throw new Error("User rejected the request.");
      },
    });
    const outcome = await executeAdminWrite(params(clients));
    expect(outcome.status).toBe("REJECTED");
    expect(outcome.error?.kind).toBe("user-rejected");
  });

  it("treats a simulation revert as FAILED before any wallet prompt", async () => {
    const clients = makeClients({
      simulate: async () => {
        throw new Error("execution reverted: EmptyTitle()");
      },
    });
    const outcome = await executeAdminWrite(params(clients));
    expect(outcome.status).toBe("FAILED");
    expect(clients.walletClient.writeContract).not.toHaveBeenCalled();
  });

  it("classifies an RPC outage as FAILED with the rpc kind", async () => {
    const clients = makeClients({
      wait: async () => {
        throw new Error("connection refused");
      },
    });
    const outcome = await executeAdminWrite(params(clients));
    expect(outcome.status).toBe("FAILED");
    expect(outcome.error?.kind).toBe("rpc");
  });

  it("defaults args to an empty array", async () => {
    const clients = makeClients({});
    await executeAdminWrite(params(clients));
    expect(clients.publicClient.simulateContract).toHaveBeenCalledWith(
      expect.objectContaining({ args: [] }),
    );
  });
});
