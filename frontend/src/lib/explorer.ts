/**
 * Centralized Block Explorer URL Resolver.
 *
 * Provides authoritative URL resolution for transactions, accounts/addresses,
 * and blocks across supported networks (Hardhat Local 31337 and Ethereum Sepolia 11155111).
 */

export const SEPOLIA_CHAIN_ID = 11155111;
export const LOCAL_CHAIN_ID = 31337;

export const SEPOLIA_EXPLORER_BASE =
  process.env.NEXT_PUBLIC_EXPLORER_URL ??
  process.env.NEXT_PUBLIC_SEPOLIA_EXPLORER_URL ??
  "https://sepolia.etherscan.io";

/**
 * Resolve the explorer base URL for a given chain id or current runtime environment.
 */
export function getExplorerBaseUrl(chainId?: number): string | null {
  const activeChainId =
    chainId ?? Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? LOCAL_CHAIN_ID);
  if (activeChainId === SEPOLIA_CHAIN_ID) {
    return SEPOLIA_EXPLORER_BASE.replace(/\/+$/, "");
  }
  return null;
}

/**
 * Returns the public explorer transaction URL on Sepolia (e.g. https://sepolia.etherscan.io/tx/0x...),
 * or falls back to the internal audit explorer URL (/audit?tx=0x...) on local networks.
 */
export function getExplorerTxUrl(txHash: string, chainId?: number): string {
  const base = getExplorerBaseUrl(chainId);
  if (base) {
    return `${base}/tx/${txHash}`;
  }
  return `/audit?tx=${txHash}`;
}

/**
 * Returns the public explorer address URL on Sepolia (e.g. https://sepolia.etherscan.io/address/0x...),
 * or falls back to the internal audit URL on local networks.
 */
export function getExplorerAddressUrl(address: string, chainId?: number): string {
  const base = getExplorerBaseUrl(chainId);
  if (base) {
    return `${base}/address/${address}`;
  }
  return `/audit?address=${address}`;
}

/**
 * Returns the public explorer block URL on Sepolia (e.g. https://sepolia.etherscan.io/block/123),
 * or falls back to the internal audit URL on local networks.
 */
export function getExplorerBlockUrl(
  blockNumber: number | bigint | string,
  chainId?: number,
): string {
  const base = getExplorerBaseUrl(chainId);
  if (base) {
    return `${base}/block/${blockNumber.toString()}`;
  }
  return `/audit?block=${blockNumber.toString()}`;
}

/**
 * Check if the given chain or current runtime has an external block explorer.
 */
export function isExternalExplorerAvailable(chainId?: number): boolean {
  return getExplorerBaseUrl(chainId) !== null;
}
