import { ethers, network } from "hardhat";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

async function main() {
  console.log("==================================================");
  console.log("VOTEX PHASE 6 — LIVE ON-CHAIN REAL WORKFLOW");
  console.log("==================================================");

  const [admin, voter1, unauthorized] = await ethers.getSigners();
  const artifactPath = resolve(__dirname, "..", "deployments", `${network.name}.json`);
  const deployment = JSON.parse(readFileSync(artifactPath, "utf8"));

  console.log("Admin address:", admin.address);
  console.log("Voter1 address:", voter1.address);
  console.log("Unauthorized address:", unauthorized.address);

  // 1. ACCESS MANAGER ROLE VERIFICATION
  const accessManager = await ethers.getContractAt("VotexAccessManager", deployment.accessManager);
  const DEFAULT_ADMIN_ROLE = await accessManager.DEFAULT_ADMIN_ROLE();
  const ELECTION_MANAGER_ROLE = await accessManager.ELECTION_MANAGER_ROLE();
  const VOTER_REGISTRAR_ROLE = await accessManager.VOTER_REGISTRAR_ROLE();
  const SECURITY_OFFICER_ROLE = await accessManager.SECURITY_OFFICER_ROLE();
  const AUDITOR_ROLE = await accessManager.AUDITOR_ROLE();

  const hasAdmin = await accessManager.hasRole(DEFAULT_ADMIN_ROLE, admin.address);
  const hasManager = await accessManager.hasRole(ELECTION_MANAGER_ROLE, admin.address);
  const hasRegistrar = await accessManager.hasRole(VOTER_REGISTRAR_ROLE, admin.address);
  const hasSecurity = await accessManager.hasRole(SECURITY_OFFICER_ROLE, admin.address);
  const hasAuditor = await accessManager.hasRole(AUDITOR_ROLE, admin.address);

  console.log("\n[ROLE VERIFICATION]");
  console.log("DEFAULT_ADMIN_ROLE:", hasAdmin);
  console.log("ELECTION_MANAGER_ROLE:", hasManager);
  console.log("VOTER_REGISTRAR_ROLE:", hasRegistrar);
  console.log("SECURITY_OFFICER_ROLE:", hasSecurity);
  console.log("AUDITOR_ROLE:", hasAuditor);

  // 2. REAL ELECTION CREATION
  const factory = await ethers.getContractAt("ElectionFactory", deployment.electionFactory);
  const currentBlock = await ethers.provider.getBlock("latest");
  const chainTime = Number(currentBlock?.timestamp ?? 0);
  console.log("Current chain block time:", chainTime);

  const regStart = chainTime + 100;
  const regEnd = regStart + 500;
  const voteStart = regEnd + 50;
  const voteEnd = voteStart + 1000;

  console.log("\n[CREATING ELECTION]");
  const createTx = await factory.connect(admin).createElection(
    "Phase 6 Real Verification Election",
    "Authoritative on-chain election instance for end-to-end verification",
    regStart,
    regEnd,
    voteStart,
    voteEnd
  );
  const createReceipt = await createTx.wait();
  console.log("Election Created TX:", createReceipt?.hash);
  console.log("Election Created Block:", createReceipt?.blockNumber);

  // Extract ElectionCreated event
  let electionId = 0n;
  let electionAddress = "";
  for (const log of createReceipt?.logs ?? []) {
    try {
      const parsed = factory.interface.parseLog(log);
      if (parsed?.name === "ElectionCreated") {
        electionId = parsed.args[0];
        break;
      }
    } catch {}
  }
  electionAddress = await factory.getElectionAddress(electionId);
  console.log("Election ID:", electionId.toString());
  console.log("Election Instance Address:", electionAddress);

  const electionInstance = await ethers.getContractAt("ElectionInstance", electionAddress);

  // 3. REAL CANDIDATE ADDITION
  console.log("\n[ADDING CANDIDATE]");
  const candTx = await electionInstance.connect(admin).addCandidate(
    "Dr. Jane Doe",
    "Dean of Artificial Intelligence & Security"
  );
  const candReceipt = await candTx.wait();
  console.log("Candidate Added TX:", candReceipt?.hash);
  console.log("Candidate Added Block:", candReceipt?.blockNumber);

  // 4. REAL VOTER REGISTRATION
  console.log("\n[REGISTERING VOTER]");
  const signers = await ethers.getSigners();
  const voterNew = signers[4];
  const registry = await ethers.getContractAt("VoterRegistry", deployment.voterRegistry);
  const commitment = ethers.keccak256(ethers.toUtf8Bytes(`voter-${voterNew.address}-auth`));
  const voterTx = await registry.connect(admin).registerVoter(voterNew.address, commitment);
  const voterReceipt = await voterTx.wait();
  console.log("Voter Registered Address:", voterNew.address);
  console.log("Voter Registered TX:", voterReceipt?.hash);
  console.log("Voter Registered Block:", voterReceipt?.blockNumber);

  // 5. REAL LIFECYCLE TRANSITIONS
  console.log("\n[LIFECYCLE TRANSITIONS]");
  // DRAFT -> REGISTRATION
  await ethers.provider.send("evm_setNextBlockTimestamp", [regStart + 1]);
  await ethers.provider.send("evm_mine", []);

  const openRegTx = await electionInstance.connect(admin).openRegistration();
  const openRegReceipt = await openRegTx.wait();
  console.log("1. Open Registration TX:", openRegReceipt?.hash, "Block:", openRegReceipt?.blockNumber);

  // REGISTRATION -> ACTIVE
  await ethers.provider.send("evm_setNextBlockTimestamp", [voteStart + 1]);
  await ethers.provider.send("evm_mine", []);

  const startTx = await electionInstance.connect(admin).startElection();
  const startReceipt = await startTx.wait();
  console.log("2. Start Election TX:", startReceipt?.hash, "Block:", startReceipt?.blockNumber);

  // ACTIVE -> PAUSED via EmergencyController
  const emergencyController = await ethers.getContractAt("EmergencyController", deployment.emergencyController);
  const pauseTx = await emergencyController.connect(admin).pauseElection(electionId);
  const pauseReceipt = await pauseTx.wait();
  console.log("3. Pause Election TX:", pauseReceipt?.hash, "Block:", pauseReceipt?.blockNumber);

  let state = await electionInstance.state();
  console.log("State while paused (expected 3):", state.toString());

  // PAUSED -> ACTIVE via EmergencyController
  const resumeTx = await emergencyController.connect(admin).resumeElection(electionId);
  const resumeReceipt = await resumeTx.wait();
  console.log("4. Resume Election TX:", resumeReceipt?.hash, "Block:", resumeReceipt?.blockNumber);

  state = await electionInstance.state();
  console.log("State resumed (expected 2):", state.toString());

  // 6. REAL VOTING REGRESSION
  console.log("\n[REAL VOTE CAST]");
  const voteTx = await electionInstance.connect(voter1).castVote(electionId, 1);
  const voteReceipt = await voteTx.wait();
  console.log("Vote Cast TX:", voteReceipt?.hash);
  console.log("Vote Cast Block:", voteReceipt?.blockNumber);

  const hasVoted = await electionInstance.hasVoted(voter1.address);
  console.log("Voter1 hasVoted:", hasVoted);

  // Verify duplicate vote rejected
  console.log("\n[DUPLICATE VOTE PROTECTION]");
  let duplicateRejected = false;
  try {
    await electionInstance.connect(voter1).castVote(electionId, 1);
  } catch (err: any) {
    duplicateRejected = true;
    console.log("Duplicate vote reverted as expected with:", err.message?.slice(0, 80));
  }
  console.log("Duplicate vote rejected:", duplicateRejected);

  // 7. END ELECTION & FINALIZE RESULTS
  console.log("\n[ENDING AND FINALIZING ELECTION]");
  await ethers.provider.send("evm_setNextBlockTimestamp", [voteEnd + 1]);
  await ethers.provider.send("evm_mine", []);

  const endTx = await electionInstance.connect(admin).endElection();
  const endReceipt = await endTx.wait();
  console.log("5. End Election TX:", endReceipt?.hash, "Block:", endReceipt?.blockNumber);

  const finalizeTx = await electionInstance.connect(admin).finalizeResults();
  const finalizeReceipt = await finalizeTx.wait();
  console.log("6. Finalize Results TX:", finalizeReceipt?.hash, "Block:", finalizeReceipt?.blockNumber);

  const finalWinner = await electionInstance.getWinner();
  console.log("Final Winner Candidate ID:", finalWinner[0].toString(), "Name:", finalWinner[1], "Votes:", finalWinner[2].toString());

  // 8. UNAUTHORIZED TRANSACTION REVERSION TEST
  console.log("\n[UNAUTHORIZED ACCESS CONTROL TEST]");
  let unauthCreateRejected = false;
  try {
    await factory.connect(unauthorized).createElection("Rogue Election", "Should Fail", now + 10, now + 100, now + 100, now + 200);
  } catch (err: any) {
    unauthCreateRejected = true;
    console.log("Unauthorized create reverted as expected:", err.message?.slice(0, 80));
  }

  let unauthPauseRejected = false;
  try {
    await emergencyController.connect(unauthorized).pauseElection(electionId);
  } catch (err: any) {
    unauthPauseRejected = true;
    console.log("Unauthorized pause reverted as expected:", err.message?.slice(0, 80));
  }

  console.log("Unauthorized create rejected:", unauthCreateRejected);
  console.log("Unauthorized pause rejected:", unauthPauseRejected);

  console.log("\n==================================================");
  console.log("REAL ON-CHAIN VERIFICATION COMPLETE");
  console.log("==================================================");
}

main().catch((err) => {
  console.error("Execution error:", err);
  process.exit(1);
});
