import { test, expect, type Page } from "@playwright/test";
import type { Address } from "viem";

import {
  connectWallet,
  createChainClient,
  createNodeWalletClient,
  deployerAccount,
  loadAccessManagerAbi,
  loadDemoDeployment,
  loadElectionAbi,
  loadEmergencyAbi,
  loadFactoryAbi,
  loadLocalDeployment,
  loadRegistryAbi,
  roleHash,
  unprivilegedAccount,
  wireInjectedProvider,
} from "./helpers/chain";

/**
 * Phase 6 §23 / §24 — the REAL administrative workflow, end to end.
 *
 * Nothing here is mocked. The admin UI writes are genuine `eth_sendTransaction`
 * calls signed by viem in Node and mined by the local Hardhat node through a
 * real injected EIP-1193 provider. Every assertion that matters is re-read
 * DIRECTLY from the chain with the artifact ABIs — the UI is only ever proof
 * that the console reflects the same on-chain truth.
 *
 * Prerequisites (run once before the suite):
 *   1. `cd votex/contracts && npm run node`           (Hardhat node, chainId 31337)
 *   2. `cd votex/contracts && npm run deploy:local`   (Phase 2 deployment)
 *   3. `cd votex/contracts && npm run demo:setup`     (seed the demo election)
 *   4. `cd votex/backend  && uvicorn ...`             (indexed read API, optional)
 *
 * The demo seed advances the CHAIN clock ~20 minutes into the future, so the
 * election-window fields are always computed from `getBlock("latest")`, never
 * from wall-clock — otherwise `createElection`'s `registrationStart >=
 * block.timestamp` guard rejects the transaction.
 */
const demo = loadDemoDeployment();
const local = loadLocalDeployment();
const electionAbi = loadElectionAbi();
const factoryAbi = loadFactoryAbi();
const registryAbi = loadRegistryAbi();
const accessAbi = loadAccessManagerAbi();
const emergencyAbi = loadEmergencyAbi();
const publicClient = createChainClient();

const deployer = deployerAccount();
const outsider = unprivilegedAccount();

const ELECTION_MANAGER_ROLE = roleHash("VOTEX_ELECTION_MANAGER_ROLE");
const VOTER_REGISTRAR_ROLE = roleHash("VOTEX_VOTER_REGISTRAR_ROLE");
const SECURITY_OFFICER_ROLE = roleHash("VOTEX_SECURITY_OFFICER_ROLE");
const AUDITOR_ROLE = roleHash("VOTEX_AUDITOR_ROLE");

/** Hardhat account #6 — never seeded, so it is a clean voter to enrol. */
const NEW_VOTER_ADDRESS = "0x976EA74026E726554dB657fA54763abd0C3a0aa9" as Address;

const STATE_NAMES = [
  "DRAFT",
  "REGISTRATION",
  "ACTIVE",
  "PAUSED",
  "ENDED",
  "RESULTS_FINALIZED",
] as const;

interface OnChainElection {
  electionId: bigint;
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

interface OnChainCandidate {
  candidateId: bigint;
  name: string;
  description: string;
  voteCount: bigint;
  active: boolean;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  expect(
    deployer.address.toLowerCase(),
    "The derived admin account must be Hardhat account #0 (the deployer).",
  ).toBe("0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266");
  expect(
    outsider.address.toLowerCase(),
    "The derived unprivileged account must be Hardhat account #9.",
  ).toBe("0xa0ee7a142d267c1f36714e4a8f75612f20a79720");
});

// ---------------------------------------------------------------------------
// On-chain read helpers
// ---------------------------------------------------------------------------

async function getElectionStruct(address: Address): Promise<OnChainElection> {
  const raw = await publicClient.readContract({
    address,
    abi: electionAbi,
    functionName: "getElection",
  });
  return raw as unknown as OnChainElection;
}

/** Assert the on-chain lifecycle state of an election instance by name. */
async function expectState(address: Address, name: (typeof STATE_NAMES)[number]) {
  await expect
    .poll(
      async () => {
        const election = await getElectionStruct(address);
        return election.exists ? STATE_NAMES[Number(election.state)] : "MISSING";
      },
      { timeout: 20_000 },
    )
    .toBe(name);
}

async function getCandidates(address: Address): Promise<OnChainCandidate[]> {
  const raw = await publicClient.readContract({
    address,
    abi: electionAbi,
    functionName: "getCandidates",
  });
  return raw as unknown as OnChainCandidate[];
}

async function totalElections(): Promise<number> {
  const raw = await publicClient.readContract({
    address: local.electionFactory,
    abi: factoryAbi,
    functionName: "totalElections",
  });
  return Number(raw);
}

async function electionAddressOf(id: number): Promise<Address> {
  return (await publicClient.readContract({
    address: local.electionFactory,
    abi: factoryAbi,
    functionName: "getElectionAddress",
    args: [BigInt(id)],
  })) as Address;
}

async function hasRole(role: `0x${string}`, account: Address): Promise<boolean> {
  return (await publicClient.readContract({
    address: local.accessManager,
    abi: accessAbi,
    functionName: "hasRole",
    args: [role, account],
  })) as boolean;
}

async function isVoterRegistered(account: Address): Promise<boolean> {
  return (await publicClient.readContract({
    address: local.voterRegistry,
    abi: registryAbi,
    functionName: "isRegistered",
    args: [account],
  })) as boolean;
}

async function isVoterActive(account: Address): Promise<boolean> {
  return (await publicClient.readContract({
    address: local.voterRegistry,
    abi: registryAbi,
    functionName: "isActive",
    args: [account],
  })) as boolean;
}

/**
 * The node's own clock — the authority for every time-window input.
 *
 * Hardhat stamps each mined block with `max(parent.timestamp + 1, wall clock)`.
 * An idle dev node's latest block therefore lags wall time, so the *next* block
 * (which will mine our admin transaction) jumps forward to wall time. The app
 * mirrors this via `useChainTime`; the spec must estimate identically or a
 * window built from the stale chain timestamp is rejected as "in the past".
 */
async function chainNow(): Promise<number> {
  const block = await publicClient.getBlock({ blockTag: "latest" });
  const chain = Number(block.timestamp);
  return Math.max(chain, Math.floor(Date.now() / 1000));
}

/** Mirror the app's `unixToDateTimeLocal` so the form parses back the same value. */
function toDateTimeLocal(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

// ---------------------------------------------------------------------------
// UI transaction helpers — every action must reach a real on-chain receipt
// ---------------------------------------------------------------------------

function scope(page: Page, sectionTestId: string) {
  return page.getByTestId(sectionTestId);
}

async function readScopeHash(page: Page, sectionTestId: string): Promise<string> {
  const el = scope(page, sectionTestId).getByTestId("tx-hash");
  if ((await el.count()) === 0) return "";
  return ((await el.first().textContent()) ?? "").trim();
}

/**
 * Poll until the section shows a NEW confirmed transaction (a different hash
 * than before), so a stale confirmation from a previous action can never be
 * mistaken for the current one.
 */
async function waitForNewConfirmation(
  page: Page,
  sectionTestId: string,
  previousHash: string,
): Promise<void> {
  const section = scope(page, sectionTestId);
  await expect
    .poll(
      async () => {
        const confirmed = await section.getByTestId("tx-confirmed").count();
        if (!confirmed) return "";
        const current = ((await section.getByTestId("tx-hash").first().textContent()) ?? "").trim();
        return current && current !== previousHash ? current : "";
      },
      { timeout: 60_000 },
    )
    .not.toBe("");
}

/** Click a write button and drive it to a fresh on-chain confirmation. */
async function clickAndConfirm(page: Page, sectionTestId: string, buttonTestId: string) {
  const previous = await readScopeHash(page, sectionTestId);
  await page.getByTestId(buttonTestId).click();
  await waitForNewConfirmation(page, sectionTestId, previous);
}

// ---------------------------------------------------------------------------
// §23 — the real 25-step administrative workflow
// ---------------------------------------------------------------------------

test.describe("real admin workflow (§23)", () => {
  test("drives the full election lifecycle through real on-chain transactions", async ({
    page,
  }) => {
    test.setTimeout(300_000);

    // 1–2) Install the privileged (deployer) wallet and connect; the guard must
    //      grant access because the wallet holds real on-chain roles.
    await wireInjectedProvider(page, { account: deployer });
    await page.goto("/admin");
    await connectWallet(page);
    await expect(page.getByTestId("admin-shell")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("access-denied")).toHaveCount(0);
    await expect(
      page.getByTestId("admin-held-role").filter({ hasText: "Election Manager" }),
    ).toBeVisible();

    // 3) The dashboard renders real, on-chain-derived surfaces.
    await expect(page.getByTestId("stat-tile").first()).toBeVisible();
    await expect(page.getByTestId("system-status-card")).toBeVisible();
    await expect(page.getByTestId("access-card")).toBeVisible();

    // 4) Navigate to election management.
    await page.getByTestId("admin-nav-elections").click();
    await expect(page).toHaveURL(/\/admin\/elections$/);

    // 5) Record the real factory count before creating anything.
    const beforeCount = await totalElections();

    // 6) Fill the creation form with windows derived from CHAIN time.
    const chainT = await chainNow();
    const newTitle = `E2E Governance Election ${Date.now()}`;
    await page.getByTestId("ce-title").fill(newTitle);
    await page
      .getByTestId("ce-description")
      .fill("Created by the Phase 6 real admin E2E — no mocks, no placeholders.");
    await page.getByTestId("ce-rs").fill(toDateTimeLocal(chainT + 600));
    await page.getByTestId("ce-re").fill(toDateTimeLocal(chainT + 1_200));
    await page.getByTestId("ce-vs").fill(toDateTimeLocal(chainT + 1_200));
    await page.getByTestId("ce-ve").fill(toDateTimeLocal(chainT + 1_200 + 7 * 86_400));

    // 7) Submit → a real ElectionFactory.createElection transaction.
    await clickAndConfirm(page, "create-election-form", "create-election-submit");

    // 8) The factory count incremented on-chain.
    await expect.poll(() => totalElections(), { timeout: 20_000 }).toBe(beforeCount + 1);
    const newId = beforeCount + 1;
    const newAddress = await electionAddressOf(newId);

    // 9) The freshly created election is real and in the DRAFT state.
    await expectState(newAddress, "DRAFT");

    // 10) The detail console loads the new election from the chain.
    await page.goto(`/admin/elections/${newId}`);
    await expect(page.getByTestId("election-facts")).toBeVisible({ timeout: 30_000 });

    // 11–12) Add two candidates (real addCandidate transactions).
    await page.getByTestId("cm-name").fill("Alice Johnson");
    await page.getByTestId("cm-desc").fill("Transparency and student services.");
    await clickAndConfirm(page, "candidate-manager", "add-candidate-submit");

    await page.getByTestId("cm-name").fill("Bob Lee");
    await page.getByTestId("cm-desc").fill("Campus safety and club funding.");
    await clickAndConfirm(page, "candidate-manager", "add-candidate-submit");

    await expect
      .poll(async () => (await getCandidates(newAddress)).length, { timeout: 20_000 })
      .toBe(2);

    // 13) Deactivate candidate #2 — the on-chain record is kept, only `active`
    //     flips (never a destructive delete).
    await clickAndConfirm(page, "candidate-manager", "deactivate-candidate-2");
    await expect
      .poll(
        async () => {
          const candidates = await getCandidates(newAddress);
          const target = candidates.find((c) => Number(c.candidateId) === 2);
          return target ? target.active : true;
        },
        { timeout: 20_000 },
      )
      .toBe(false);

    // 14) DRAFT → REGISTRATION.
    await expect(page.getByTestId("lifecycle-openRegistration")).toBeEnabled({ timeout: 20_000 });
    await clickAndConfirm(page, "lifecycle-controls", "lifecycle-openRegistration");
    await expectState(newAddress, "REGISTRATION");

    // 15) REGISTRATION → ACTIVE.
    await expect(page.getByTestId("lifecycle-startElection")).toBeEnabled({ timeout: 20_000 });
    await clickAndConfirm(page, "lifecycle-controls", "lifecycle-startElection");
    await expectState(newAddress, "ACTIVE");

    // 16) Register a fresh voter through the registry (real transaction). The
    //     registration is global, so it is guarded for safe re-runs.
    const alreadyRegistered = await isVoterRegistered(NEW_VOTER_ADDRESS);
    await page.goto("/admin/voters");
    await expect(page.getByTestId("voter-register-form")).toBeVisible({ timeout: 30_000 });
    if (!alreadyRegistered) {
      await page.getByTestId("vr-wallet").fill(NEW_VOTER_ADDRESS);
      await page.getByTestId("vr-commitment").fill(`0x${"11".repeat(32)}`);
      await clickAndConfirm(page, "voter-register-form", "register-voter-submit");
    }
    await expect.poll(() => isVoterRegistered(NEW_VOTER_ADDRESS), { timeout: 20_000 }).toBe(true);

    // 17) Look the voter up — status is read straight from the registry.
    await page.getByTestId("vl-wallet").fill(NEW_VOTER_ADDRESS);
    await page.getByTestId("voter-lookup-submit").click();
    await expect(page.getByTestId("voter-lookup-result")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("voter-lookup-result")).toContainText("Registered");
    await expect(page.getByTestId("voter-lookup-result")).toContainText("Active");

    // 18) Deactivate → isActive flips false on-chain (record persists).
    await clickAndConfirm(page, "voter-lookup", "deactivate-voter");
    await expect.poll(() => isVoterActive(NEW_VOTER_ADDRESS), { timeout: 20_000 }).toBe(false);

    // 19) Reactivate → isActive flips back to true on-chain.
    await expect(page.getByTestId("reactivate-voter")).toBeEnabled({ timeout: 20_000 });
    await clickAndConfirm(page, "voter-lookup", "reactivate-voter");
    await expect.poll(() => isVoterActive(NEW_VOTER_ADDRESS), { timeout: 20_000 }).toBe(true);

    // 20) Security center: pause the ACTIVE election through the
    //     EmergencyController (SECURITY_OFFICER_ROLE).
    await page.goto("/admin/security");
    await expect(page.getByTestId("no-auto-pause")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("emergency-controls")).toBeVisible();
    await page.getByTestId("ec-election").selectOption(String(newId));
    await expect(page.getByTestId("emergency-pause")).toBeEnabled({ timeout: 20_000 });
    await clickAndConfirm(page, "emergency-controls", "emergency-pause");
    await expectState(newAddress, "PAUSED");

    // 21) Resume → back to ACTIVE.
    await expect(page.getByTestId("emergency-resume")).toBeEnabled({ timeout: 20_000 });
    await clickAndConfirm(page, "emergency-controls", "emergency-resume");
    await expectState(newAddress, "ACTIVE");

    // 22) ACTIVE → ENDED.
    await page.goto(`/admin/elections/${newId}`);
    await expect(page.getByTestId("lifecycle-endElection")).toBeEnabled({ timeout: 30_000 });
    await clickAndConfirm(page, "lifecycle-controls", "lifecycle-endElection");
    await expectState(newAddress, "ENDED");

    // 23) ENDED → RESULTS_FINALIZED.
    await expect(page.getByTestId("lifecycle-finalizeResults")).toBeEnabled({ timeout: 20_000 });
    await clickAndConfirm(page, "lifecycle-controls", "lifecycle-finalizeResults");
    await expectState(newAddress, "RESULTS_FINALIZED");

    // 24) Role management: grant then revoke AUDITOR_ROLE for a throwaway
    //     account — a real DEFAULT_ADMIN_ROLE operation.
    await page.goto("/admin/roles");
    await expect(page.getByTestId("role-card-ELECTION_MANAGER_ROLE")).toBeVisible({
      timeout: 30_000,
    });
    await page.getByTestId("ra-role").selectOption("AUDITOR_ROLE");
    await page.getByTestId("ra-account").fill(outsider.address);
    await clickAndConfirm(page, "role-admin-form", "grant-role-submit");
    await expect.poll(() => hasRole(AUDITOR_ROLE, outsider.address), { timeout: 20_000 }).toBe(true);

    await page.getByTestId("ra-account").fill(outsider.address);
    await clickAndConfirm(page, "role-admin-form", "revoke-role-submit");
    await expect
      .poll(() => hasRole(AUDITOR_ROLE, outsider.address), { timeout: 20_000 })
      .toBe(false);

    // 25) Audit trail console renders the real indexed events.
    await page.goto("/admin/audit");
    await expect(page.getByTestId("audit-filters")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("audit-results")).toBeVisible();
    await page.getByTestId("af-election").fill(String(newId));
    await page.getByTestId("audit-apply").click();
    await expect(page.getByTestId("audit-results")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// §24 — an unauthorized wallet is refused
// ---------------------------------------------------------------------------

test.describe("negative access control (§24)", () => {
  test("an unprivileged wallet holds no role on-chain and is refused on every admin route", async ({
    page,
  }) => {
    // The blockchain is the boundary: this wallet genuinely has no role.
    expect(await hasRole(ELECTION_MANAGER_ROLE, outsider.address)).toBe(false);
    expect(await hasRole(VOTER_REGISTRAR_ROLE, outsider.address)).toBe(false);
    expect(await hasRole(SECURITY_OFFICER_ROLE, outsider.address)).toBe(false);
    expect(await hasRole(AUDITOR_ROLE, outsider.address)).toBe(false);

    await wireInjectedProvider(page, { account: outsider });

    const routes = [
      "/admin",
      "/admin/elections",
      "/admin/voters",
      "/admin/roles",
      "/admin/security",
      "/admin/audit",
    ];

    for (const route of routes) {
      await page.goto(route);
      await expect(page.getByTestId("access-denied")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("admin-content")).toHaveCount(0);
      await expect(page.getByTestId("admin-shell")).toHaveCount(0);
    }
  });

  test("the contract itself rejects an unauthorized write (§24, §30)", async () => {
    const before = await totalElections();
    const chainT = await chainNow();

    await expect(
      publicClient.simulateContract({
        account: outsider.address,
        address: local.electionFactory,
        abi: factoryAbi,
        functionName: "createElection",
        args: [
          "Unauthorized attempt",
          "Should revert with Unauthorized.",
          BigInt(chainT + 600),
          BigInt(chainT + 1_200),
          BigInt(chainT + 1_200),
          BigInt(chainT + 1_200 + 86_400),
        ],
      }),
    ).rejects.toThrow();

    // Nothing changed on-chain — the rejected write left no trace.
    expect(await totalElections()).toBe(before);
  });

  test("a single-role wallet cannot perform another role's action (§24)", async () => {
    // A real Node-side wallet client for the deployer (DEFAULT_ADMIN_ROLE).
    const deployerWallet = createNodeWalletClient(deployer);

    expect(await hasRole(ELECTION_MANAGER_ROLE, outsider.address)).toBe(false);

    // The deployer genuinely grants the single operational role on-chain.
    const grantHash = await deployerWallet.writeContract({
      address: local.accessManager,
      abi: accessAbi,
      functionName: "grantRole",
      args: [ELECTION_MANAGER_ROLE, outsider.address],
    });
    await publicClient.waitForTransactionReceipt({ hash: grantHash, confirmations: 1 });
    expect(await hasRole(ELECTION_MANAGER_ROLE, outsider.address)).toBe(true);

    // The outsider now holds ONE role — but the SECURITY_OFFICER action
    // (emergency pause) is still rejected by the contract itself.
    await expect(
      publicClient.simulateContract({
        account: outsider.address,
        address: local.emergencyController,
        abi: emergencyAbi,
        functionName: "pauseElection",
        args: [BigInt(demo.electionId)],
      }),
    ).rejects.toThrow();

    // Clean up: revoke the role so the fixture state is restored on-chain.
    const revokeHash = await deployerWallet.writeContract({
      address: local.accessManager,
      abi: accessAbi,
      functionName: "revokeRole",
      args: [ELECTION_MANAGER_ROLE, outsider.address],
    });
    await publicClient.waitForTransactionReceipt({ hash: revokeHash, confirmations: 1 });
    expect(await hasRole(ELECTION_MANAGER_ROLE, outsider.address)).toBe(false);
  });
});
