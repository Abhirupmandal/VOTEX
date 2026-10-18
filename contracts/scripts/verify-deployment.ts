import { ethers } from "ethers";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateSepoliaConfig } from "./env";

/**
 * Verifies an active Ethereum Sepolia deployment.
 * Ensures all contracts exist on-chain with valid bytecode, non-zero addresses,
 * and correct inter-contract wiring.
 */
async function main(): Promise<void> {
  console.log("==================================================");
  console.log("VOTEX — ETHEREUM SEPOLIA DEPLOYMENT VERIFICATION");
  console.log("==================================================\n");

  const deploymentPath = resolve(__dirname, "..", "deployments", "sepolia.json");
  if (!existsSync(deploymentPath)) {
    throw new Error(
      `Deployment artifact 'deployments/sepolia.json' not found. ` +
        `Execute 'npm run deploy:sepolia' first once credentials are configured.`,
    );
  }

  const deployment = JSON.parse(readFileSync(deploymentPath, "utf8"));
  console.log(`Deployment Record Found:`);
  console.log(`  Network:     ${deployment.network}`);
  console.log(`  Chain ID:    ${deployment.chainId}`);
  console.log(`  Deployer:    ${deployment.deployer}`);
  console.log(`  Deployed At: ${deployment.deployedAt}\n`);

  if (deployment.chainId !== 11155111) {
    throw new Error(`Deployment artifact chain ID (${deployment.chainId}) is not Sepolia (11155111)!`);
  }

  const config = validateSepoliaConfig(false);
  const rpcUrl = config?.rpcUrl || process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org";
  console.log(`Connecting to Sepolia RPC endpoint...`);
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  const network = await provider.getNetwork();
  const currentChainId = Number(network.chainId);
  console.log(`Connected chain ID: ${currentChainId}`);
  if (currentChainId !== 11155111) {
    throw new Error(`RPC node chain ID (${currentChainId}) does not match Sepolia (11155111)!`);
  }

  const contracts = [
    { name: "VotexAccessManager", address: deployment.accessManager },
    { name: "VoterRegistry", address: deployment.voterRegistry },
    { name: "ElectionFactory", address: deployment.electionFactory },
    { name: "EmergencyController", address: deployment.emergencyController },
  ];

  console.log("\n[1/2] Verifying On-Chain Bytecode (eth_getCode)...");
  for (const c of contracts) {
    if (!c.address || c.address === ethers.ZeroAddress) {
      throw new Error(`Invalid or zero address for ${c.name}: ${c.address}`);
    }
    const code = await provider.getCode(c.address);
    if (!code || code === "0x") {
      throw new Error(
        `Bytecode verification FAILED for ${c.name} at ${c.address}: Address contains no contract code (0x)!`,
      );
    }
    console.log(`  ✓ ${c.name} (${c.address}): ${code.length / 2 - 1} bytes of bytecode verified.`);
  }

  console.log("\n[2/4] Verifying Architectural Inter-Contract Wiring...");
  const factoryAbi = [
    "function accessManager() view returns (address)",
    "function voterRegistry() view returns (address)",
    "function emergencyController() view returns (address)",
  ];
  const factoryContract = new ethers.Contract(deployment.electionFactory, factoryAbi, provider);

  const configuredAm = await factoryContract.accessManager();
  const configuredVr = await factoryContract.voterRegistry();
  const configuredEc = await factoryContract.emergencyController();

  if (configuredAm.toLowerCase() !== deployment.accessManager.toLowerCase()) {
    throw new Error(`Mismatch: ElectionFactory.accessManager does not match ${deployment.accessManager}`);
  }
  if (configuredVr.toLowerCase() !== deployment.voterRegistry.toLowerCase()) {
    throw new Error(`Mismatch: ElectionFactory.voterRegistry does not match ${deployment.voterRegistry}`);
  }
  if (configuredEc.toLowerCase() !== deployment.emergencyController.toLowerCase()) {
    throw new Error(`Mismatch: ElectionFactory.emergencyController does not match ${deployment.emergencyController}`);
  }

  console.log(`  ✓ ElectionFactory -> AccessManager wired correctly.`);
  console.log(`  ✓ ElectionFactory -> VoterRegistry wired correctly.`);
  console.log(`  ✓ ElectionFactory -> EmergencyController wired correctly.`);

  console.log("\n[3/4] Verifying Deployment Transaction Receipts & Blocks...");
  for (const [key, details] of Object.entries(deployment.contracts) as [string, any][]) {
    if (!details.transactionHash) {
      throw new Error(`Missing transaction hash for ${key}`);
    }
    const receipt = await provider.getTransactionReceipt(details.transactionHash);
    if (!receipt) {
      throw new Error(`Transaction receipt not found on Sepolia for ${key}: ${details.transactionHash}`);
    }
    if (receipt.status !== 1) {
      throw new Error(`Transaction failed (status ${receipt.status}) for ${key}: ${details.transactionHash}`);
    }
    console.log(
      `  ✓ ${key}: confirmed in block ${receipt.blockNumber} (tx: ${details.transactionHash.slice(0, 10)}...${details.transactionHash.slice(-8)})`,
    );
  }

  console.log("\n[4/4] Verifying Operational RBAC Roles on VotexAccessManager...");
  const accessManagerAbi = [
    "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
    "function ELECTION_MANAGER_ROLE() view returns (bytes32)",
    "function VOTER_REGISTRAR_ROLE() view returns (bytes32)",
    "function SECURITY_OFFICER_ROLE() view returns (bytes32)",
    "function AUDITOR_ROLE() view returns (bytes32)",
    "function hasRole(bytes32 role, address account) view returns (bool)",
  ];
  const amContract = new ethers.Contract(deployment.accessManager, accessManagerAbi, provider);

  const rolesToCheck = [
    "DEFAULT_ADMIN_ROLE",
    "ELECTION_MANAGER_ROLE",
    "VOTER_REGISTRAR_ROLE",
    "SECURITY_OFFICER_ROLE",
    "AUDITOR_ROLE",
  ];

  for (const roleName of rolesToCheck) {
    const roleHash = await amContract[roleName]();
    const hasRole = await amContract.hasRole(roleHash, deployment.deployer);
    if (!hasRole) {
      throw new Error(`Deployer ${deployment.deployer} is missing expected role ${roleName}!`);
    }
    console.log(`  ✓ ${roleName} granted to deployer (${deployment.deployer})`);
  }

  console.log("\n==================================================");
  console.log("SEPOLIA DEPLOYMENT VERIFICATION: ALL CHECKS PASSED");
  console.log("All 4 core contracts, wiring, receipts, and RBAC roles confirmed on Sepolia.");
  console.log("==================================================\n");
}

main().catch((err) => {
  console.error("\nVerification failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
