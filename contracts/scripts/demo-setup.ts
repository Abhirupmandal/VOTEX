import { ethers, network } from "hardhat";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Seeds a reproducible local demo election ("NMIET Student Council").
 *
 * Steps:
 *   1. Read the deployment artifact written by scripts/deploy.ts.
 *   2. Create the election with a short, future registration window.
 *   3. Add three candidates.
 *   4. Register demo voter accounts 1..5.
 *   5. Open registration and start the election.
 *   6. Advance the chain time into the voting window, then cast a few seed
 *      votes from accounts 2 and 3 so the results page has real tallies.
 *
 * Account 1 is intentionally left un-voted so the E2E flow can cast a real
 * first vote and then verify the contract rejects a duplicate.
 */
const CANDIDATES: { name: string; description: string }[] = [
  { name: "Rahul Sharma", description: "Focus on campus infrastructure and labs." },
  { name: "Priya Patil", description: "Student welfare, clubs, and events." },
  { name: "Arjun Mehta", description: "Academic reforms and placements." },
];

const DEMO_TITLE = "NMIET Student Council";
const DEMO_DESCRIPTION =
  "Annual student council election for the NMIET campus (local demo).";

async function advanceTo(target: number): Promise<void> {
  const latest = await ethers.provider.getBlock("latest");
  const currentTs = latest?.timestamp ?? 0;
  if (target > currentTs) {
    await ethers.provider.send("evm_setNextBlockTimestamp", [target]);
    await ethers.provider.send("evm_mine", []);
  }
}

async function main(): Promise<void> {
  const artifactPath = resolve(
    __dirname,
    "..",
    "deployments",
    `${network.name}.json`,
  );
  const deployment = JSON.parse(readFileSync(artifactPath, "utf8")) as {
    electionFactory: string;
    voterRegistry: string;
  };
  console.log("Using ElectionFactory:", deployment.electionFactory);

  const factory = await ethers.getContractAt(
    "ElectionFactory",
    deployment.electionFactory,
  );
  const registry = await ethers.getContractAt(
    "VoterRegistry",
    deployment.voterRegistry,
  );

  const latest = await ethers.provider.getBlock("latest");
  const now = latest?.timestamp ?? Math.floor(Date.now() / 1000);

  // Hardhat Network advances a new block's timestamp to wall-clock time when
  // real time has moved on, so the windows must start far enough ahead to
  // survive the (tiny, but non-zero) drift between reading the head and mining
  // the creation block. Lifecycle transitions carry no time guards, so the
  // election can still be driven to ACTIVE immediately.
  const registrationStart = now + 600;
  const registrationEnd = now + 1200;
  const votingStart = now + 1200;
  const votingEnd = now + 1200 + 7 * 24 * 60 * 60;

  const createTx = await factory.createElection(
    DEMO_TITLE,
    DEMO_DESCRIPTION,
    registrationStart,
    registrationEnd,
    votingStart,
    votingEnd,
  );
  await createTx.wait();
  const electionId = await factory.totalElections();
  console.log("Election created. id =", electionId.toString());

  const electionAddress = await factory.getElectionAddress(electionId);
  const election = await ethers.getContractAt("ElectionInstance", electionAddress);
  console.log("ElectionInstance:", electionAddress);

  // Candidates.
  for (const candidate of CANDIDATES) {
    await (
      await election.addCandidate(candidate.name, candidate.description)
    ).wait();
    console.log("Added candidate:", candidate.name);
  }

  // Demo voters: accounts 1..5.
  const voterSigners = [];
  for (let i = 1; i <= 5; i += 1) {
    const signer = (await ethers.getSigners())[i];
    const commitment = ethers.keccak256(
      ethers.toUtf8Bytes(`demo-credential-${i}`),
    );
    // Registration is global (per VoterRegistry) and cannot be replayed, so
    // guard it to keep the seed script safe to re-run against a live node.
    if (!(await registry.isRegistered(signer.address))) {
      await (await registry.registerVoter(signer.address, commitment)).wait();
      console.log(`Registered voter ${i}:`, signer.address);
    } else {
      console.log(`Voter ${i} already registered:`, signer.address);
    }
    voterSigners.push(signer);
  }

  // Lifecycle: DRAFT -> REGISTRATION -> ACTIVE.
  await (await election.openRegistration()).wait();
  await (await election.startElection()).wait();
  console.log("Election is now ACTIVE");

  // Move into the voting window so castVote passes the time checks.
  await advanceTo(votingStart + 10);

  // Seed votes from accounts 2..5 (account 1 stays eligible so the E2E flow
  // can cast a real first vote and then prove a duplicate is rejected on-chain).
  const seedVotes: Array<[voterIndex: number, candidateId: number]> = [
    [1, 1],
    [2, 2],
    [3, 1],
    [4, 3],
  ];
  for (const [voterIndex, candidateId] of seedVotes) {
    const voter = voterSigners[voterIndex];
    if (await election.hasVoted(voter.address)) continue;
    await (await election.connect(voter).castVote(electionId, candidateId)).wait();
  }
  console.log("Seed votes cast");

  const demoArtifact = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    electionFactory: deployment.electionFactory,
    voterRegistry: deployment.voterRegistry,
    electionId: Number(electionId),
    electionAddress,
    electionTitle: DEMO_TITLE,
    candidates: CANDIDATES.map((c, index) => ({ id: index + 1, name: c.name })),
    voters: voterSigners.map((s) => s.address),
    fundedVoter: voterSigners[0].address,
    seededAt: new Date().toISOString(),
  };
  const outPath = resolve(__dirname, "..", "deployments", "demo.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(demoArtifact, null, 2)}\n`, "utf8");
  console.log("Demo artifact written to", outPath);

  console.log("\nVOTEX demo election ready.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
