import { ethers } from "ethers";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateSepoliaConfig } from "./env";

interface LifecycleRecord {
  electionAddress: string;
  electionId: number;
  transactions: {
    createElection: { hash: string; block: number; gasUsed: string };
    addCandidateA: { hash: string; block: number; gasUsed: string };
    addCandidateB: { hash: string; block: number; gasUsed: string };
    registerVoter: { hash: string; block: number; gasUsed: string };
    openRegistration: { hash: string; block: number; gasUsed: string };
    startElection: { hash: string; block: number; gasUsed: string };
    castVote: { hash: string; block: number; gasUsed: string };
    endElection: { hash: string; block: number; gasUsed: string };
    finalizeResults: { hash: string; block: number; gasUsed: string };
  };
  results: {
    winnerId: number;
    maxVotes: string;
    totalVotes: string;
  };
}

async function main(): Promise<void> {
  console.log("==================================================");
  console.log("VOTEX — PHASE 7 STEP 5: REAL SEPOLIA ELECTION LIFECYCLE");
  console.log("==================================================\n");

  const config = validateSepoliaConfig(true);
  if (!config) {
    throw new Error("Sepolia credentials missing in contracts/.env. Cannot proceed.");
  }

  const deploymentPath = resolve(__dirname, "..", "deployments", "sepolia.json");
  if (!existsSync(deploymentPath)) {
    throw new Error("deployments/sepolia.json not found. Contracts must be deployed first.");
  }

  const deployment = JSON.parse(readFileSync(deploymentPath, "utf8"));
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const wallet = new ethers.Wallet(config.formattedPrivateKey, provider);

  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);
  console.log(`Connected Network: Ethereum Sepolia (Chain ID: ${chainId})`);
  if (chainId !== 11155111) {
    throw new Error(`Connected chain ID ${chainId} is not Ethereum Sepolia (11155111)!`);
  }

  console.log("Deployer / Admin Wallet:", wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log("Current Balance:", ethers.formatEther(balance), "Sepolia ETH");
  if (balance === 0n) {
    throw new Error("Wallet balance is 0. Cannot pay for Sepolia gas.");
  }

  // Load ABI definitions from compiled Hardhat artifacts
  const factoryArtifact = JSON.parse(
    readFileSync(
      resolve(__dirname, "..", "artifacts/contracts/core/ElectionFactory.sol/ElectionFactory.json"),
      "utf8",
    ),
  );
  const instanceArtifact = JSON.parse(
    readFileSync(
      resolve(__dirname, "..", "artifacts/contracts/core/ElectionInstance.sol/ElectionInstance.json"),
      "utf8",
    ),
  );
  const registryArtifact = JSON.parse(
    readFileSync(
      resolve(__dirname, "..", "artifacts/contracts/core/VoterRegistry.sol/VoterRegistry.json"),
      "utf8",
    ),
  );

  const factory = new ethers.Contract(deployment.electionFactory, factoryArtifact.abi, wallet);
  const registry = new ethers.Contract(deployment.voterRegistry, registryArtifact.abi, wallet);

  // ---------------------------------------------------------------------------
  // STEP A: CREATE TEST ELECTION
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------");
  console.log("STEP A: CREATING TEST ELECTION ON SEPOLIA");
  console.log("--------------------------------------------------");

  const latestBlock = await provider.getBlock("latest");
  if (!latestBlock) throw new Error("Could not fetch latest block from Sepolia RPC.");
  const blockTime = latestBlock.timestamp;
  console.log(`Current Sepolia block #${latestBlock.number} timestamp: ${blockTime}`);

  const title = "VOTEX Sepolia E2E Test Election";
  const description = "Authoritative real-chain election lifecycle test for VOTEX Phase 7 Step 5";

  // Timing bounds adhering strictly to ElectionFactory invariants:
  // regStart >= block.timestamp (give 150s buffer to safely clear Sepolia mempool delay)
  // regEnd > regStart (60s registration window)
  // voteStart >= regEnd (voting opens right as registration ends)
  // voteEnd > voteStart (2 hours voting window)
  const regStart = blockTime + 150;
  const regEnd = regStart + 60;
  const voteStart = regEnd;
  const voteEnd = voteStart + 7200;

  console.log(`Planned Timestamps:`);
  console.log(`  Registration: ${regStart} -> ${regEnd}`);
  console.log(`  Voting:       ${voteStart} -> ${voteEnd}`);

  console.log("Broadcasting createElection transaction...");
  const createTx = await factory.createElection(title, description, regStart, regEnd, voteStart, voteEnd);
  console.log(`  Tx Hash: ${createTx.hash}`);
  console.log(`  Explorer: https://sepolia.etherscan.io/tx/${createTx.hash}`);
  const createReceipt = await createTx.wait();
  if (createReceipt.status !== 1) throw new Error(`createElection failed on-chain! Tx: ${createTx.hash}`);
  console.log(`  ✓ Mined in block #${createReceipt.blockNumber} (Gas used: ${createReceipt.gasUsed})`);

  const totalElections = await factory.totalElections();
  const electionId = Number(totalElections);
  const instanceAddress = await factory.getElectionAddress(electionId);
  console.log(`  ✓ Election ID: #${electionId}`);
  console.log(`  ✓ ElectionInstance Deployed Address: ${instanceAddress}`);
  console.log(`  ✓ Instance Explorer: https://sepolia.etherscan.io/address/${instanceAddress}`);

  const instance = new ethers.Contract(instanceAddress, instanceArtifact.abi, wallet);

  // ---------------------------------------------------------------------------
  // STEP B: VERIFY ELECTION DEPLOYMENT
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------");
  console.log("STEP B: VERIFYING ELECTION DEPLOYMENT ON-CHAIN");
  console.log("--------------------------------------------------");

  const code = await provider.getCode(instanceAddress);
  if (!code || code === "0x") {
    throw new Error(`ElectionInstance at ${instanceAddress} has no deployed bytecode!`);
  }
  console.log(`  ✓ Bytecode verified: ${code.length / 2 - 1} bytes.`);

  const onChainCreator = await instance.creator();
  const onChainAccessManager = await instance.accessManager();
  const onChainVoterRegistry = await instance.voterRegistry();
  const onChainEmergency = await instance.emergencyController();
  const initialState = await instance.state();

  console.log(`  ✓ Creator: ${onChainCreator} (Matches wallet: ${onChainCreator.toLowerCase() === wallet.address.toLowerCase()})`);
  console.log(`  ✓ AccessManager: ${onChainAccessManager}`);
  console.log(`  ✓ VoterRegistry: ${onChainVoterRegistry}`);
  console.log(`  ✓ EmergencyController: ${onChainEmergency}`);
  console.log(`  ✓ Initial State: ${initialState} (0 = DRAFT)`);

  if (Number(initialState) !== 0) throw new Error(`Expected initial state 0 (DRAFT), got ${initialState}`);

  // ---------------------------------------------------------------------------
  // STEP C: REGISTER TEST CANDIDATES
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------");
  console.log("STEP C: REGISTERING CANDIDATES (DRAFT STATE)");
  console.log("--------------------------------------------------");

  console.log("Adding Candidate 1: 'Dr. Alice Vance' (Decentralized Governance Lead)...");
  const cand1Tx = await instance.addCandidate("Dr. Alice Vance", "Decentralized Governance Lead");
  console.log(`  Tx: https://sepolia.etherscan.io/tx/${cand1Tx.hash}`);
  const cand1Receipt = await cand1Tx.wait();
  if (cand1Receipt.status !== 1) throw new Error("addCandidate 1 failed!");
  console.log(`  ✓ Confirmed in block #${cand1Receipt.blockNumber} (Gas: ${cand1Receipt.gasUsed})`);

  console.log("Adding Candidate 2: 'Bob Chen' (Infrastructure & Security Lead)...");
  const cand2Tx = await instance.addCandidate("Bob Chen", "Infrastructure & Security Lead");
  console.log(`  Tx: https://sepolia.etherscan.io/tx/${cand2Tx.hash}`);
  const cand2Receipt = await cand2Tx.wait();
  if (cand2Receipt.status !== 1) throw new Error("addCandidate 2 failed!");
  console.log(`  ✓ Confirmed in block #${cand2Receipt.blockNumber} (Gas: ${cand2Receipt.gasUsed})`);

  const candCount = await instance.candidateCount();
  console.log(`  ✓ Total Candidates on-chain: ${candCount}`);
  const c1 = await instance.getCandidate(1);
  const c2 = await instance.getCandidate(2);
  console.log(`  Candidate #1: ${c1.name} (Active: ${c1.active}, Votes: ${c1.voteCount})`);
  console.log(`  Candidate #2: ${c2.name} (Active: ${c2.active}, Votes: ${c2.voteCount})`);

  // ---------------------------------------------------------------------------
  // STEP D: REGISTER TEST VOTER
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------");
  console.log("STEP D: REGISTERING TEST VOTER ON VOTERREGISTRY");
  console.log("--------------------------------------------------");

  const voterAddress = wallet.address;
  const isVoterRegistered = await registry.isRegistered(voterAddress);
  let voterRegTxHash = "ALREADY_REGISTERED";
  let voterRegBlock = 0;
  let voterRegGas = "0";

  if (!isVoterRegistered) {
    const voterCommitment = ethers.keccak256(ethers.toUtf8Bytes(`voter-credential-${voterAddress}`));
    console.log(`Registering voter ${voterAddress}...`);
    const regTx = await registry.registerVoter(voterAddress, voterCommitment);
    console.log(`  Tx: https://sepolia.etherscan.io/tx/${regTx.hash}`);
    const regReceipt = await regTx.wait();
    if (regReceipt.status !== 1) throw new Error("registerVoter failed!");
    voterRegTxHash = regTx.hash;
    voterRegBlock = regReceipt.blockNumber;
    voterRegGas = regReceipt.gasUsed.toString();
    console.log(`  ✓ Registered in block #${regReceipt.blockNumber} (Gas: ${regReceipt.gasUsed})`);
  } else {
    console.log(`  ✓ Voter ${voterAddress} is already registered on-chain.`);
  }

  const isEligible = await registry.isActive(voterAddress);
  console.log(`  ✓ Voter Registered: true, Active Eligibility: ${isEligible}`);
  if (!isEligible) throw new Error(`Voter ${voterAddress} is not active!`);

  // ---------------------------------------------------------------------------
  // STEP E: EXECUTE ELECTION LIFECYCLE (DRAFT -> REGISTRATION -> ACTIVE)
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------");
  console.log("STEP E: EXECUTING ELECTION LIFECYCLE TRANSITIONS");
  console.log("--------------------------------------------------");

  console.log("Transition 1: DRAFT -> REGISTRATION via openRegistration()...");
  const openRegTx = await instance.openRegistration();
  console.log(`  Tx: https://sepolia.etherscan.io/tx/${openRegTx.hash}`);
  const openRegReceipt = await openRegTx.wait();
  if (openRegReceipt.status !== 1) throw new Error("openRegistration failed!");
  console.log(`  ✓ Confirmed in block #${openRegReceipt.blockNumber} (Gas: ${openRegReceipt.gasUsed})`);

  const regState = await instance.state();
  console.log(`  ✓ State after openRegistration: ${regState} (1 = REGISTRATION)`);
  if (Number(regState) !== 1) throw new Error(`Expected state 1 (REGISTRATION), got ${regState}`);

  // Wait for block timestamp to reach votingStart
  console.log(`\nChecking voting start window (target: ${voteStart})...`);
  let currentBlock = await provider.getBlock("latest");
  while (currentBlock && currentBlock.timestamp < voteStart) {
    const waitSeconds = voteStart - currentBlock.timestamp;
    console.log(`  Waiting for Sepolia block timestamp to reach voting window (${waitSeconds}s remaining)...`);
    await new Promise((resolve) => setTimeout(resolve, Math.min(waitSeconds * 1000, 15000)));
    currentBlock = await provider.getBlock("latest");
  }
  console.log(`  ✓ Sepolia block timestamp (${currentBlock?.timestamp}) has reached votingStart (${voteStart}).`);

  console.log("Transition 2: REGISTRATION -> ACTIVE via startElection()...");
  const startTx = await instance.startElection();
  console.log(`  Tx: https://sepolia.etherscan.io/tx/${startTx.hash}`);
  const startReceipt = await startTx.wait();
  if (startReceipt.status !== 1) throw new Error("startElection failed!");
  console.log(`  ✓ Confirmed in block #${startReceipt.blockNumber} (Gas: ${startReceipt.gasUsed})`);

  const activeState = await instance.state();
  console.log(`  ✓ State after startElection: ${activeState} (2 = ACTIVE)`);
  if (Number(activeState) !== 2) throw new Error(`Expected state 2 (ACTIVE), got ${activeState}`);

  // ---------------------------------------------------------------------------
  // STEP F: REAL TEST VOTE & DUPLICATE VOTE REJECTION
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------");
  console.log("STEP F: CASTING REAL ON-CHAIN VOTE ON SEPOLIA");
  console.log("--------------------------------------------------");

  const candidateToVote = 1; // Dr. Alice Vance
  const hasVotedBefore = await instance.hasVoted(voterAddress);
  console.log(`  Pre-vote hasVoted(${voterAddress}): ${hasVotedBefore}`);
  if (hasVotedBefore) throw new Error("Voter already voted before test cast!");

  console.log(`Submitting castVote(electionId=${electionId}, candidateId=${candidateToVote})...`);
  const voteTx = await instance.castVote(electionId, candidateToVote);
  console.log(`  Vote Tx Hash: ${voteTx.hash}`);
  console.log(`  Explorer: https://sepolia.etherscan.io/tx/${voteTx.hash}`);
  const voteReceipt = await voteTx.wait();
  if (voteReceipt.status !== 1) throw new Error("castVote failed on-chain!");
  console.log(`  ✓ Vote confirmed in block #${voteReceipt.blockNumber} (Gas used: ${voteReceipt.gasUsed})`);

  const hasVotedAfter = await instance.hasVoted(voterAddress);
  console.log(`  ✓ Post-vote hasVoted(${voterAddress}): ${hasVotedAfter}`);
  if (!hasVotedAfter) throw new Error("hasVoted is false after successful castVote!");

  // Verify duplicate vote rejection
  console.log("\nTesting Duplicate Vote Protection (Re-vote rejection)...");
  let duplicateRejected = false;
  try {
    const dupTx = await instance.castVote(electionId, candidateToVote);
    await dupTx.wait();
  } catch (err: any) {
    duplicateRejected = true;
    console.log(`  ✓ Smart contract successfully reverted duplicate vote: ${err?.message?.slice(0, 100)}...`);
  }
  if (!duplicateRejected) {
    throw new Error("SECURITY VIOLATION: Duplicate vote was accepted by smart contract!");
  }

  // ---------------------------------------------------------------------------
  // STEP G: COMPLETE LIFECYCLE (ACTIVE -> ENDED -> RESULTS_FINALIZED)
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------");
  console.log("STEP G: ADVANCING TO ENDED & FINALIZING RESULTS");
  console.log("--------------------------------------------------");

  console.log("Transition 3: ACTIVE -> ENDED via endElection()...");
  const endTx = await instance.endElection();
  console.log(`  Tx: https://sepolia.etherscan.io/tx/${endTx.hash}`);
  const endReceipt = await endTx.wait();
  if (endReceipt.status !== 1) throw new Error("endElection failed!");
  console.log(`  ✓ Confirmed in block #${endReceipt.blockNumber} (Gas: ${endReceipt.gasUsed})`);

  const endedState = await instance.state();
  console.log(`  ✓ State after endElection: ${endedState} (4 = ENDED)`);

  console.log("Transition 4: ENDED -> RESULTS_FINALIZED via finalizeResults()...");
  const finTx = await instance.finalizeResults();
  console.log(`  Tx: https://sepolia.etherscan.io/tx/${finTx.hash}`);
  const finReceipt = await finTx.wait();
  if (finReceipt.status !== 1) throw new Error("finalizeResults failed!");
  console.log(`  ✓ Confirmed in block #${finReceipt.blockNumber} (Gas: ${finReceipt.gasUsed})`);

  const finalState = await instance.state();
  console.log(`  ✓ State after finalizeResults: ${finalState} (5 = RESULTS_FINALIZED)`);

  // ---------------------------------------------------------------------------
  // STEP H: VERIFY RESULTS & TALLY
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------");
  console.log("STEP H: ON-CHAIN RESULTS & TALLY INSPECTION");
  console.log("--------------------------------------------------");

  const totalVotesOnChain = await instance.getTotalVotes();
  const c1Final = await instance.getCandidate(1);
  const c2Final = await instance.getCandidate(2);
  const [winnerId, tie, maxVotes] = await instance.getWinner();
  const [candIds, candNames, candVotes] = await instance.getElectionResults();

  console.log(`  Total Votes Cast: ${totalVotesOnChain.toString()}`);
  console.log(`  Candidate 1 (${c1Final.name}): ${c1Final.voteCount} votes`);
  console.log(`  Candidate 2 (${c2Final.name}): ${c2Final.voteCount} votes`);
  console.log(`  Winner Candidate ID: #${winnerId.toString()} (Max votes: ${maxVotes.toString()}, Tie: ${tie})`);

  if (totalVotesOnChain !== 1n || c1Final.voteCount !== 1n || winnerId !== 1n) {
    throw new Error("On-chain tally verification failed!");
  }
  console.log("  ✓ Authoritative on-chain results verified 100% accurate.");

  // Save execution record
  const record: LifecycleRecord = {
    electionAddress: instanceAddress,
    electionId,
    transactions: {
      createElection: {
        hash: createTx.hash,
        block: Number(createReceipt.blockNumber),
        gasUsed: createReceipt.gasUsed.toString(),
      },
      addCandidateA: {
        hash: cand1Tx.hash,
        block: Number(cand1Receipt.blockNumber),
        gasUsed: cand1Receipt.gasUsed.toString(),
      },
      addCandidateB: {
        hash: cand2Tx.hash,
        block: Number(cand2Receipt.blockNumber),
        gasUsed: cand2Receipt.gasUsed.toString(),
      },
      registerVoter: {
        hash: voterRegTxHash,
        block: voterRegBlock,
        gasUsed: voterRegGas,
      },
      openRegistration: {
        hash: openRegTx.hash,
        block: Number(openRegReceipt.blockNumber),
        gasUsed: openRegReceipt.gasUsed.toString(),
      },
      startElection: {
        hash: startTx.hash,
        block: Number(startReceipt.blockNumber),
        gasUsed: startReceipt.gasUsed.toString(),
      },
      castVote: {
        hash: voteTx.hash,
        block: Number(voteReceipt.blockNumber),
        gasUsed: voteReceipt.gasUsed.toString(),
      },
      endElection: {
        hash: endTx.hash,
        block: Number(endReceipt.blockNumber),
        gasUsed: endReceipt.gasUsed.toString(),
      },
      finalizeResults: {
        hash: finTx.hash,
        block: Number(finReceipt.blockNumber),
        gasUsed: finReceipt.gasUsed.toString(),
      },
    },
    results: {
      winnerId: Number(winnerId),
      maxVotes: maxVotes.toString(),
      totalVotes: totalVotesOnChain.toString(),
    },
  };

  const outRecordPath = resolve(__dirname, "..", "deployments", "sepolia-election-test.json");
  writeFileSync(outRecordPath, JSON.stringify(record, null, 2), "utf8");
  console.log(`\nLifecycle record persisted to: ${outRecordPath}`);

  console.log("\n==================================================");
  console.log("SEPOLIA REAL ELECTION LIFECYCLE: 100% SUCCESS");
  console.log("All real transactions executed and confirmed on Sepolia.");
  console.log("==================================================\n");
}

main().catch((err) => {
  console.error("\n[CRITICAL ERROR] Sepolia lifecycle aborted:", err instanceof Error ? err.message : err);
  process.exit(1);
});
