import { ethers, network } from "hardhat";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { validateSepoliaConfig } from "./env";

/**
 * Deploys the full VOTEX blockchain core and persists rich deployment metadata
 * (addresses, deployment block numbers, transaction hashes) consumed by the backend,
 * frontend, indexer, and verification tools.
 *
 * Deployment order:
 *   1. VotexAccessManager
 *   2. VoterRegistry
 *   3. ElectionFactory
 *   4. EmergencyController
 *   5. Wire the controller into the factory
 *   6. Grant operational roles to the deployer
 *   7. Automatically export frontend ABIs
 */
async function main(): Promise<void> {
  if (network.name === "sepolia") {
    validateSepoliaConfig(true);
  }

  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error(
      `No signer accounts available for network '${network.name}'. ` +
        `Ensure SEPOLIA_PRIVATE_KEY is set in contracts/.env or environment.`,
    );
  }
  const [deployer] = signers;
  console.log(`\n==================================================`);
  console.log(`VOTEX CONTRACT DEPLOYMENT: ${network.name.toUpperCase()}`);
  console.log(`==================================================`);
  console.log("Deployer Address:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer Balance:", ethers.formatEther(balance), "ETH");

  // 1. VotexAccessManager
  console.log("\n[1/5] Deploying VotexAccessManager...");
  const AccessManagerFactory = await ethers.getContractFactory("VotexAccessManager");
  const accessManager = await AccessManagerFactory.deploy(deployer.address);
  await accessManager.waitForDeployment();
  const accessManagerAddress = await accessManager.getAddress();
  const amTx = accessManager.deploymentTransaction();
  const amReceipt = amTx ? await amTx.wait() : null;
  const amBlock = amReceipt ? Number(amReceipt.blockNumber) : null;
  console.log(`  -> Address: ${accessManagerAddress}`);
  console.log(`  -> Tx: ${amTx?.hash ?? "N/A"} (Block ${amBlock ?? "N/A"})`);

  // 2. VoterRegistry
  console.log("\n[2/5] Deploying VoterRegistry...");
  const RegistryFactory = await ethers.getContractFactory("VoterRegistry");
  const voterRegistry = await RegistryFactory.deploy(accessManagerAddress);
  await voterRegistry.waitForDeployment();
  const voterRegistryAddress = await voterRegistry.getAddress();
  const vrTx = voterRegistry.deploymentTransaction();
  const vrReceipt = vrTx ? await vrTx.wait() : null;
  const vrBlock = vrReceipt ? Number(vrReceipt.blockNumber) : null;
  console.log(`  -> Address: ${voterRegistryAddress}`);
  console.log(`  -> Tx: ${vrTx?.hash ?? "N/A"} (Block ${vrBlock ?? "N/A"})`);

  // 3. ElectionFactory
  console.log("\n[3/5] Deploying ElectionFactory...");
  const ElectionFactory = await ethers.getContractFactory("ElectionFactory");
  const factory = await ElectionFactory.deploy(accessManagerAddress, voterRegistryAddress);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  const efTx = factory.deploymentTransaction();
  const efReceipt = efTx ? await efTx.wait() : null;
  const efBlock = efReceipt ? Number(efReceipt.blockNumber) : null;
  console.log(`  -> Address: ${factoryAddress}`);
  console.log(`  -> Tx: ${efTx?.hash ?? "N/A"} (Block ${efBlock ?? "N/A"})`);

  // 4. EmergencyController
  console.log("\n[4/5] Deploying EmergencyController...");
  const ControllerFactory = await ethers.getContractFactory("EmergencyController");
  const controller = await ControllerFactory.deploy(accessManagerAddress, factoryAddress);
  await controller.waitForDeployment();
  const controllerAddress = await controller.getAddress();
  const ecTx = controller.deploymentTransaction();
  const ecReceipt = ecTx ? await ecTx.wait() : null;
  const ecBlock = ecReceipt ? Number(ecReceipt.blockNumber) : null;
  console.log(`  -> Address: ${controllerAddress}`);
  console.log(`  -> Tx: ${ecTx?.hash ?? "N/A"} (Block ${ecBlock ?? "N/A"})`);

  // 5. Wire EmergencyController into ElectionFactory
  console.log("\n[5/5] Wiring EmergencyController into ElectionFactory...");
  const wireTx = await factory.setEmergencyController(controllerAddress);
  const wireReceipt = await wireTx.wait();
  console.log(`  -> Wire Tx: ${wireTx.hash} (Block ${wireReceipt?.blockNumber})`);

  // Grant operational roles to deployer
  console.log("\nConfiguring operational RBAC roles on VotexAccessManager...");
  const roles = [
    "ELECTION_MANAGER_ROLE",
    "VOTER_REGISTRAR_ROLE",
    "SECURITY_OFFICER_ROLE",
    "AUDITOR_ROLE",
  ];
  for (const name of roles) {
    const role = await accessManager[name]();
    const grantTx = await accessManager.grantRole(role, deployer.address);
    await grantTx.wait();
    console.log(`  -> Granted ${name} to ${deployer.address}`);
  }

  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const earliestDeploymentBlock = Math.min(
    ...[amBlock, vrBlock, efBlock, ecBlock].filter((b): b is number => b !== null),
  );

  const deployment = {
    network: network.name,
    chainId,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    startBlock: earliestDeploymentBlock,
    contracts: {
      accessManager: {
        address: accessManagerAddress,
        transactionHash: amTx?.hash ?? null,
        blockNumber: amBlock,
      },
      voterRegistry: {
        address: voterRegistryAddress,
        transactionHash: vrTx?.hash ?? null,
        blockNumber: vrBlock,
      },
      electionFactory: {
        address: factoryAddress,
        transactionHash: efTx?.hash ?? null,
        blockNumber: efBlock,
      },
      emergencyController: {
        address: controllerAddress,
        transactionHash: ecTx?.hash ?? null,
        blockNumber: ecBlock,
      },
    },
    // Top-level address aliases for backwards compatibility with existing consumers
    accessManager: accessManagerAddress,
    voterRegistry: voterRegistryAddress,
    electionFactory: factoryAddress,
    emergencyController: controllerAddress,
  };

  const outPath = resolve(__dirname, "..", "deployments", `${network.name}.json`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(deployment, null, 2)}\n`, "utf8");
  console.log("\nDeployment artifact written to:", outPath);

  // Automatically trigger ABI export to sync frontend
  console.log("\nTriggering ABI export to frontend/src/lib/contracts/abis/...");
  try {
    const { exportAbis } = await import("./export-abis");
    exportAbis();
  } catch (err) {
    console.warn("Could not automatically run exportAbis inline; running via standalone script:", err);
  }

  console.log(`\n==================================================`);
  console.log(`VOTEX DEPLOYMENT COMPLETE (${network.name.toUpperCase()})`);
  console.log(`Earliest Deployment Block: ${earliestDeploymentBlock}`);
  console.log(`==================================================\n`);
}

main().catch((error) => {
  console.error("\nDeployment failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
