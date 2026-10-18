import { isAddress, type Address } from "viem";
import { LOCAL_CHAIN_ID, SEPOLIA_CHAIN_ID } from "@/lib/explorer";
import { TARGET_CHAIN_ID } from "@/lib/wagmi";

/**
 * Contract addresses are supplied via NEXT_PUBLIC_* environment variables so the
 * same build can target a local chain, a testnet, or production.
 *
 * Network-aware resolution allows simultaneous multi-network configuration
 * (e.g. NEXT_PUBLIC_SEPOLIA_* alongside default NEXT_PUBLIC_*).
 */
export function readAddress(value: string | undefined): Address | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!isAddress(trimmed)) return undefined;
  return trimmed as Address;
}

export interface ContractAddresses {
  electionFactory: Address | undefined;
  voterRegistry: Address | undefined;
  emergencyController: Address | undefined;
  accessManager: Address | undefined;
}

/**
 * Authoritative deployed contract addresses on Ethereum Sepolia (chainId 11155111).
 * Extracted from contracts/deployments/sepolia.json.
 */
export const SEPOLIA_DEPLOYMENT_ADDRESSES: ContractAddresses = {
  electionFactory: "0x27B6CBfCF0E909e2e4158A34b42e2904041312Be",
  voterRegistry: "0x3C2482EdA3aaDa7EEeb07c937f1c2DAF7fedCeEc",
  emergencyController: "0x6a381FCe8494c09D131d0F0467e83150801Ec526",
  accessManager: "0x32CcA7F2A1336e9160e2c1D76F9C3493C0f6F033",
};

/**
 * Resolve contract addresses specifically for the given chain ID (or default target chain).
 */
export function getContractAddresses(chainId?: number): ContractAddresses {
  const activeChainId = chainId ?? TARGET_CHAIN_ID;

  if (activeChainId === SEPOLIA_CHAIN_ID) {
    return {
      electionFactory:
        readAddress(process.env.NEXT_PUBLIC_SEPOLIA_ELECTION_FACTORY_ADDRESS) ??
        (TARGET_CHAIN_ID === SEPOLIA_CHAIN_ID
          ? readAddress(process.env.NEXT_PUBLIC_ELECTION_FACTORY_ADDRESS)
          : undefined) ??
        SEPOLIA_DEPLOYMENT_ADDRESSES.electionFactory,
      voterRegistry:
        readAddress(process.env.NEXT_PUBLIC_SEPOLIA_VOTER_REGISTRY_ADDRESS) ??
        (TARGET_CHAIN_ID === SEPOLIA_CHAIN_ID
          ? readAddress(process.env.NEXT_PUBLIC_VOTER_REGISTRY_ADDRESS)
          : undefined) ??
        SEPOLIA_DEPLOYMENT_ADDRESSES.voterRegistry,
      emergencyController:
        readAddress(
          process.env.NEXT_PUBLIC_SEPOLIA_EMERGENCY_CONTROLLER_ADDRESS,
        ) ??
        (TARGET_CHAIN_ID === SEPOLIA_CHAIN_ID
          ? readAddress(process.env.NEXT_PUBLIC_EMERGENCY_CONTROLLER_ADDRESS)
          : undefined) ??
        SEPOLIA_DEPLOYMENT_ADDRESSES.emergencyController,
      accessManager:
        readAddress(process.env.NEXT_PUBLIC_SEPOLIA_ACCESS_MANAGER_ADDRESS) ??
        (TARGET_CHAIN_ID === SEPOLIA_CHAIN_ID
          ? readAddress(process.env.NEXT_PUBLIC_ACCESS_MANAGER_ADDRESS)
          : undefined) ??
        SEPOLIA_DEPLOYMENT_ADDRESSES.accessManager,
    };
  }

  // Local or default fallback
  return {
    electionFactory:
      readAddress(process.env.NEXT_PUBLIC_LOCAL_ELECTION_FACTORY_ADDRESS) ??
      readAddress(process.env.NEXT_PUBLIC_ELECTION_FACTORY_ADDRESS),
    voterRegistry:
      readAddress(process.env.NEXT_PUBLIC_LOCAL_VOTER_REGISTRY_ADDRESS) ??
      readAddress(process.env.NEXT_PUBLIC_VOTER_REGISTRY_ADDRESS),
    emergencyController:
      readAddress(process.env.NEXT_PUBLIC_LOCAL_EMERGENCY_CONTROLLER_ADDRESS) ??
      readAddress(process.env.NEXT_PUBLIC_EMERGENCY_CONTROLLER_ADDRESS),
    accessManager:
      readAddress(process.env.NEXT_PUBLIC_LOCAL_ACCESS_MANAGER_ADDRESS) ??
      readAddress(process.env.NEXT_PUBLIC_ACCESS_MANAGER_ADDRESS),
  };
}

/** Active target contract addresses */
export const contractAddresses: ContractAddresses = getContractAddresses();

export const electionFactoryAddress = contractAddresses.electionFactory;
export const voterRegistryAddress = contractAddresses.voterRegistry;
export const emergencyControllerAddress = contractAddresses.emergencyController;
export const accessManagerAddress = contractAddresses.accessManager;

/** True when the minimum required contracts are configured for reads/writes. */
export function isFactoryConfigured(chainId?: number): boolean {
  return getContractAddresses(chainId).electionFactory !== undefined;
}

export function isRegistryConfigured(chainId?: number): boolean {
  return getContractAddresses(chainId).voterRegistry !== undefined;
}
