import { test, expect } from "@playwright/test";

import {
  connectWallet,
  createChainClient,
  fundedVoterAccount,
  loadDemoDeployment,
  loadElectionAbi,
  wireInjectedProvider,
} from "./helpers/chain";

/**
 * Phase 5 §23 — real end-to-end voting against the LOCAL BLOCKCHAIN.
 *
 * Prerequisites (run once before the suite):
 *   1. `cd votex/contracts && npm run node`           (Hardhat node, chainId 31337)
 *   2. `cd votex/contracts && npm run deploy:local`   (deploy the Phase 2 contracts)
 *   3. `cd votex/contracts && npm run demo:setup`     (seed the demo election)
 *   4. `cd votex/backend  && uvicorn ...`             (indexed read API)
 *
 * The vote transaction is NOT mocked: it is signed by viem in Node and mined by
 * the Hardhat node through a real injected EIP-1193 provider.
 */
const demo = loadDemoDeployment();
const abi = loadElectionAbi();
const publicClient = createChainClient();
const voter = fundedVoterAccount();

// The whole file is serial: the first test mutates on-chain state.
test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  expect(
    voter.address.toLowerCase(),
    "The deterministic Hardhat account must match the seeded funded voter in demo.json.",
  ).toBe(demo.fundedVoter.toLowerCase());
});

test.describe("real local-blockchain vote (§9, §10, §12)", () => {
  test("an eligible voter casts exactly one real vote and a duplicate is rejected", async ({
    page,
  }) => {
    const electionAddress = demo.electionAddress;
    const targetCandidateId = 1;
    const targetName = "Rahul Sharma";

    // Precondition: the chain must be freshly seeded (the vote is real & final).
    const alreadyVoted = (await publicClient.readContract({
      address: electionAddress,
      abi,
      functionName: "hasVoted",
      args: [voter.address],
    })) as boolean;
    expect(
      alreadyVoted,
      "Re-seed the chain (npm run demo:setup) before running the E2E suite.",
    ).toBe(false);

    const before = (await publicClient.readContract({
      address: electionAddress,
      abi,
      functionName: "getElectionResults",
    })) as readonly [readonly bigint[], readonly string[], readonly bigint[]];
    const targetIndex = before[1].findIndex((name) => name === targetName);
    expect(targetIndex).toBeGreaterThanOrEqual(0);
    const votesBefore = before[2][targetIndex];

    // 1) Install the real wallet + connect.
    await wireInjectedProvider(page, { account: voter });
    await page.goto(`/elections/${demo.electionId}`);
    await connectWallet(page);

    // 2) On-chain eligibility is surfaced as VERIFIED.
    await expect(page.getByTestId("eligibility-verified")).toBeVisible({
      timeout: 30_000,
    });

    // 3) Select a candidate → ✓ SELECTED and the confirm modal opens (§9:
    //    selecting a candidate transitions directly into the confirm step).
    await page.getByTestId(`select-${targetCandidateId}`).click();
    await expect(page.getByTestId(`selected-${targetCandidateId}`)).toBeVisible();
    await expect(page.getByTestId("confirm-vote")).toBeVisible();

    // 4) CONFIRM VOTE → submit the real transaction to the injected wallet.
    await page.getByTestId("confirm-vote").click();

    // 5) Drive the real transaction to the confirmed terminal state.
    await expect(page.getByTestId("vote-confirmed")).toBeVisible({ timeout: 60_000 });
    const txHash = ((await page.getByTestId("tx-hash").textContent()) ?? "").trim();
    expect(txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    await expect(page.getByTestId("view-transaction")).toBeVisible();
    await expect(page.getByTestId("view-transaction")).toHaveAttribute(
      "href",
      `/audit?tx=${txHash}`,
    );

    // 6) Verify the vote was actually recorded on-chain.
    await expect
      .poll(
        async () =>
          (await publicClient.readContract({
            address: electionAddress,
            abi,
            functionName: "hasVoted",
            args: [voter.address],
          })) as boolean,
        { timeout: 15_000 },
      )
      .toBe(true);

    const after = (await publicClient.readContract({
      address: electionAddress,
      abi,
      functionName: "getElectionResults",
    })) as readonly [readonly bigint[], readonly string[], readonly bigint[]];
    const afterIndex = after[1].findIndex((name) => name === targetName);
    expect(after[2][afterIndex]).toBe(votesBefore + 1n);

    // 7) The UI reports the double-vote guard after a fresh reload.
    await page.reload();
    await expect(page.getByTestId("eligibility-voted")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId(`select-${targetCandidateId}`)).toBeDisabled();

    // 8) The CONTRACT rejects a duplicate — it is the sole authority (§12, §17).
    await expect(
      publicClient.simulateContract({
        account: voter.address,
        address: electionAddress,
        abi,
        functionName: "castVote",
        args: [BigInt(demo.electionId), BigInt(targetCandidateId)],
      }),
    ).rejects.toThrow(/AlreadyVoted/);
  });
});

test.describe("wrong network handling (§3, §4)", () => {
  test("warns on an unsupported chain and recovers after switching", async ({ page }) => {
    // The wallet reports chainId 1 (mainnet) instead of the local chain.
    await wireInjectedProvider(page, { account: voter, chainIdHex: "0x1" });
    await page.goto("/elections");
    await connectWallet(page);

    await expect(page.getByTestId("wrong-network-banner")).toBeVisible({
      timeout: 20_000,
    });
    await page.getByTestId("switch-network").click();
    await expect(page.getByTestId("wrong-network-banner")).toBeHidden({
      timeout: 20_000,
    });
  });
});

test.describe("on-chain results (§14, §15)", () => {
  test("results are blockchain-verified with a winner tile and audit link", async ({
    page,
  }) => {
    await page.goto(`/elections/${demo.electionId}/results`);

    await expect(page.getByTestId("verification-card")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("BLOCKCHAIN VERIFIED")).toBeVisible();
    await expect(page.getByTestId("winner-tile")).toBeVisible();
    await expect(page.getByTestId("view-audit-record")).toHaveAttribute(
      "href",
      `/audit?election=${demo.electionId}`,
    );
  });
});
