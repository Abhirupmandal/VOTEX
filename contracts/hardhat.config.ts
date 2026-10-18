import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-chai-matchers";
import { validateSepoliaConfig } from "./scripts/env";

/**
 * VOTEX Hardhat configuration.
 *
 * Solidity 0.8.24 pinned per architectural specification.
 * Supports Hardhat local (31337) and Ethereum Sepolia testnet (11155111).
 */

const isSepoliaTarget =
  process.argv.includes("sepolia") ||
  process.env.HARDHAT_NETWORK === "sepolia";

// Strictly validate when Sepolia is explicitly targeted; otherwise resolve optional config.
const sepoliaConfig = validateSepoliaConfig(isSepoliaTarget);

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    sepolia: {
      url: sepoliaConfig?.rpcUrl || "https://rpc.sepolia.org",
      chainId: 11155111,
      accounts: sepoliaConfig ? [sepoliaConfig.formattedPrivateKey] : [],
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
