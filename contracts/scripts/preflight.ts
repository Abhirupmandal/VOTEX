import { ethers } from "ethers";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateSepoliaConfig } from "./env";

/**
 * Preflight verification tool for Ethereum Sepolia testnet deployment.
 * Safely inspects readiness WITHOUT exposing secrets or throwing uncaught exceptions.
 */
async function main(): Promise<void> {
  console.log("==================================================");
  console.log("VOTEX — ETHEREUM SEPOLIA PREFLIGHT CHECK");
  console.log("==================================================\n");

  const config = validateSepoliaConfig(false);
  const rpcConfigured = Boolean(config?.rpcUrl);
  const keyConfigured = Boolean(config?.formattedPrivateKey);

  console.log(`Target Network:           Ethereum Sepolia (Chain ID: 11155111)`);
  console.log(`RPC Configured:           ${rpcConfigured ? "YES" : "NO"}`);
  console.log(`Private Key Configured:   ${keyConfigured ? "YES" : "NO"}`);

  let providerConnected = false;
  let providerChainId: number | null = null;
  let currentBlock: number | null = null;
  let deployerAddress: string | null = null;
  let deployerBalanceEth: string | null = null;

  // 1. Inspect RPC connectivity if configured
  if (rpcConfigured && config) {
    try {
      const provider = new ethers.JsonRpcProvider(config.rpcUrl, undefined, {
        staticNetwork: false,
      });
      const network = await provider.getNetwork();
      providerChainId = Number(network.chainId);
      currentBlock = await provider.getBlockNumber();
      providerConnected = true;
      console.log(`Connected RPC Chain ID:   ${providerChainId}`);
      console.log(`Current Sepolia Block:    #${currentBlock}`);

      if (providerChainId !== 11155111) {
        console.warn(
          `[WARNING] Connected chain ID (${providerChainId}) does not match Sepolia (11155111)!`,
        );
      }
    } catch (err) {
      console.log(`RPC Connectivity:         FAILED (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  // 2. Inspect Deployer Wallet if configured
  if (keyConfigured && config) {
    try {
      const wallet = new ethers.Wallet(config.formattedPrivateKey);
      deployerAddress = wallet.address;
      console.log(`Deployer Public Address:  ${deployerAddress}`);

      if (providerConnected && config.rpcUrl) {
        const provider = new ethers.JsonRpcProvider(config.rpcUrl);
        const balance = await provider.getBalance(deployerAddress);
        deployerBalanceEth = ethers.formatEther(balance);
        console.log(`Deployer Balance:         ${deployerBalanceEth} Sepolia ETH`);

        if (balance === 0n) {
          console.warn(
            `\n[WARNING] Deployer wallet has 0 Sepolia ETH. Deployment transactions will fail.`,
          );
          console.warn(
            `Obtain free Sepolia test ETH from https://cloud.google.com/application/web3/faucet/ethereum/sepolia or https://sepoliafaucet.com`,
          );
        }
      }
    } catch (err) {
      console.log(`Deployer Wallet:          INVALID (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  // 3. Inspect Deployed Sepolia Artifact
  const deploymentPath = resolve(__dirname, "..", "deployments", "sepolia.json");
  const deploymentExists = existsSync(deploymentPath);
  let contractsDeployed = false;

  if (deploymentExists) {
    try {
      const data = JSON.parse(readFileSync(deploymentPath, "utf8"));
      if (
        data.accessManager &&
        data.voterRegistry &&
        data.electionFactory &&
        data.emergencyController
      ) {
        contractsDeployed = true;
      }
    } catch {
      contractsDeployed = false;
    }
  }

  console.log(`Deployment Artifact:      ${deploymentExists ? "sepolia.json FOUND" : "NOT FOUND (Pending deployment)"}`);
  console.log(`Core Contracts Deployed:  ${contractsDeployed ? "YES" : "NO"}`);

  console.log("\n==================================================");
  if (!rpcConfigured || !keyConfigured) {
    console.log("PREFLIGHT STATUS: PENDING CONFIGURATION");
    console.log("==================================================");
    console.log("To prepare deployment, create contracts/.env with:");
    console.log("  SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY");
    console.log("  SEPOLIA_PRIVATE_KEY=your_dedicated_testnet_private_key");
    console.log("\nNEVER paste or commit real private keys.");
    process.exit(1);
  } else if (!providerConnected) {
    console.log("PREFLIGHT STATUS: RPC CONNECTION BLOCKED");
    console.log("==================================================");
    process.exit(1);
  } else {
    console.log("PREFLIGHT STATUS: READY FOR SEPOLIA DEPLOYMENT");
    console.log("==================================================");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Preflight check encountered an unexpected error:", err);
  process.exit(1);
});
