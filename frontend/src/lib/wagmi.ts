import { createConfig, http } from "wagmi";
import { defineChain, fallback } from "viem";
import { injected } from "wagmi/connectors";

/**
 * Local development chain matching the Hardhat network (chainId 31337).
 */
export const localChain = defineChain({
  id: 31337,
  name: "Hardhat Local",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_LOCAL_RPC_URL ??
          process.env.NEXT_PUBLIC_RPC_URL ??
          "http://127.0.0.1:8545",
      ],
    },
  },
  testnet: true,
});

/**
 * Public Ethereum Sepolia testnet chain (chainId 11155111).
 * Uses robust multi-provider RPC endpoints with fallback redundancy.
 */
export const sepoliaChain = defineChain({
  id: 11155111,
  name: "Ethereum Sepolia",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ??
          process.env.NEXT_PUBLIC_RPC_URL ??
          "https://ethereum-sepolia-rpc.publicnode.com",
        "https://1rpc.io/sepolia",
        "https://rpc.sepolia.org",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "Etherscan",
      url:
        process.env.NEXT_PUBLIC_EXPLORER_URL ??
        process.env.NEXT_PUBLIC_SEPOLIA_EXPLORER_URL ??
        "https://sepolia.etherscan.io",
    },
  },
  testnet: true,
});

export type SupportedChainId = typeof localChain.id | typeof sepoliaChain.id;

/** Configured target chain id (defaults to local 31337). */
export const TARGET_CHAIN_ID: SupportedChainId =
  Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? localChain.id) === sepoliaChain.id
    ? sepoliaChain.id
    : localChain.id;

/** Active target chain configuration. */
export const targetChain =
  TARGET_CHAIN_ID === sepoliaChain.id ? sepoliaChain : localChain;

export const supportedChains =
  TARGET_CHAIN_ID === sepoliaChain.id
    ? ([sepoliaChain, localChain] as const)
    : ([localChain, sepoliaChain] as const);

/**
 * Browser wallet configuration supporting both local and Sepolia networks.
 * The active targetChain is configured first so disconnected reads default to it,
 * and Sepolia utilizes resilient fallback transports across providers.
 */
export const wagmiConfig = createConfig({
  chains: supportedChains,
  connectors: [injected()],
  transports: {
    [localChain.id]: http(localChain.rpcUrls.default.http[0]),
    [sepoliaChain.id]: fallback([
      http(sepoliaChain.rpcUrls.default.http[0]),
      http("https://1rpc.io/sepolia"),
      http("https://rpc.sepolia.org"),
    ]),
  },
  ssr: true,
});

/** Human-readable network label for a given chain id. */
export function networkName(chainId: number | undefined): string {
  if (chainId === localChain.id) return localChain.name;
  if (chainId === sepoliaChain.id) return sepoliaChain.name;
  return chainId ? `Unsupported Network (${chainId})` : "Not Connected";
}

/** Check if a chain id is supported by VOTEX. */
export function isSupportedChain(chainId: number | undefined): boolean {
  if (chainId === undefined) return false;
  return chainId === localChain.id || chainId === sepoliaChain.id;
}

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
