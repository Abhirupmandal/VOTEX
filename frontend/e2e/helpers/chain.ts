/**
 * Shared E2E helpers for the VOTEX real-blockchain suite (Phase 5 §23).
 *
 * The vote transaction is NEVER mocked here:
 *   - a real EIP-1193 provider is installed on `window.ethereum`;
 *   - signing is delegated to viem running in Node (via `exposeFunction`);
 *   - all reads/writes go to the local Hardhat node (chainId 31337);
 *   - deployment addresses and the contract ABI are read from the Phase 2
 *     artifacts on disk (no hand-written ABI or hard-coded address).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page } from "@playwright/test";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  keccak256,
  toHex,
  type Abi,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

/** Hardhat's local JSON-RPC endpoint. */
export const LOCAL_RPC_URL = "http://127.0.0.1:8545";
/** Local chain id (31337) as an EIP-1193 hex quantity. */
export const LOCAL_CHAIN_ID_HEX: Hex = "0x7a69";

/** Local development chain mirroring the app's `lib/wagmi.ts` definition. */
export const localChain = defineChain({
  id: 31337,
  name: "Local Development Network",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [LOCAL_RPC_URL] } },
  testnet: true,
});

/**
 * Hardhat account #1's private key. It is the deterministic, funded demo voter
 * seeded by `scripts/demo-setup.ts` and is only ever used against the local
 * node — it is a well-known test key, never a real secret.
 */
export const HARDHAT_FUNDED_VOTER_KEY: Hex =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

/**
 * Hardhat account #0's private key — the deployer that `scripts/deploy.ts`
 * grants every operational VOTEX role. It is therefore the only wallet able to
 * drive the Phase 6 administrative writes under test. Well-known local test key.
 */
export const HARDHAT_DEPLOYER_KEY: Hex =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

/**
 * Hardhat account #9's private key — never registered and holds NO VOTEX role.
 * Used for the negative access-control tests (§24). Well-known local test key.
 */
export const HARDHAT_UNPRIVILEGED_KEY: Hex =
  "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6";

const contractsRoot = resolve(process.cwd(), "..", "contracts");

function readJson<T>(relativePath: string): T {
  const full = resolve(contractsRoot, relativePath);
  if (!existsSync(full)) {
    throw new Error(
      `E2E prerequisite missing: ${full}. Run the Phase 2 deploy and demo seed first.`,
    );
  }
  return JSON.parse(readFileSync(full, "utf8")) as T;
}

export interface DemoDeployment {
  electionId: number;
  electionAddress: Address;
  electionTitle: string;
  fundedVoter: Address;
  candidates: { id: number; name: string }[];
}

/** The demo election artifact written by `scripts/demo-setup.ts`. */
export function loadDemoDeployment(): DemoDeployment {
  return readJson<DemoDeployment>("deployments/demo.json");
}

/** The real ElectionInstance ABI, read straight from the compiled artifact. */
export function loadElectionAbi(): Abi {
  const artifact = readJson<{ abi: Abi }>(
    "artifacts/contracts/core/ElectionInstance.sol/ElectionInstance.json",
  );
  return artifact.abi;
}

/** The real ElectionFactory ABI, read straight from the compiled artifact. */
export function loadFactoryAbi(): Abi {
  return readJson<{ abi: Abi }>(
    "artifacts/contracts/core/ElectionFactory.sol/ElectionFactory.json",
  ).abi;
}

/** The real VoterRegistry ABI, read straight from the compiled artifact. */
export function loadRegistryAbi(): Abi {
  return readJson<{ abi: Abi }>(
    "artifacts/contracts/core/VoterRegistry.sol/VoterRegistry.json",
  ).abi;
}

/** The real VotexAccessManager ABI, read straight from the compiled artifact. */
export function loadAccessManagerAbi(): Abi {
  return readJson<{ abi: Abi }>(
    "artifacts/contracts/access/VotexAccessManager.sol/VotexAccessManager.json",
  ).abi;
}

/** The real EmergencyController ABI, read straight from the compiled artifact. */
export function loadEmergencyAbi(): Abi {
  return readJson<{ abi: Abi }>(
    "artifacts/contracts/emergency/EmergencyController.sol/EmergencyController.json",
  ).abi;
}

export interface LocalDeployment {
  chainId: number;
  accessManager: Address;
  voterRegistry: Address;
  electionFactory: Address;
  emergencyController: Address;
}

/** The Phase 2 deployment artifact written by `scripts/deploy.ts`. */
export function loadLocalDeployment(): LocalDeployment {
  return readJson<LocalDeployment>("deployments/localhost.json");
}

/**
 * Solidity-compatible role hash. The frontend computes roles with
 * `keccak256(toHex("VOTEX_..._ROLE"))`; this mirrors it exactly so the on-chain
 * `hasRole` assertions query the real role identifier.
 */
export function roleHash(name: string): Hex {
  return keccak256(toHex(name));
}

/** A viem client bound to the local chain, used for on-chain assertions. */
export function createChainClient(): PublicClient {
  return createPublicClient({ chain: localChain, transport: http(LOCAL_RPC_URL) });
}

/** Derive the funded demo voter account (asserted against the artifact). */
export function fundedVoterAccount(): PrivateKeyAccount {
  return privateKeyToAccount(HARDHAT_FUNDED_VOTER_KEY);
}

/** Derive the privileged deployer/admin account (holds every VOTEX role). */
export function deployerAccount(): PrivateKeyAccount {
  return privateKeyToAccount(HARDHAT_DEPLOYER_KEY);
}

/** Derive an account holding no VOTEX roles (for the negative tests). */
export function unprivilegedAccount(): PrivateKeyAccount {
  return privateKeyToAccount(HARDHAT_UNPRIVILEGED_KEY);
}

/**
 * A Node-side viem wallet client for an account, used to drive REAL
 * transactions directly against the local node (e.g. granting a role before a
 * negative assertion). Every call is a genuine mined transaction — nothing here
 * is simulated or mocked.
 */
export function createNodeWalletClient(account: PrivateKeyAccount) {
  return createWalletClient({
    account,
    chain: localChain,
    transport: http(LOCAL_RPC_URL),
  });
}

/** Node-side signer bridging browser wallet RPC calls to viem. */
function createNodeSigner(account: PrivateKeyAccount) {
  const walletClient = createWalletClient({
    account,
    chain: localChain,
    transport: http(LOCAL_RPC_URL),
  });

  return async (method: string, params: unknown[]): Promise<unknown> => {
    switch (method) {
      case "sendTransaction": {
        const tx = params[0] as {
          to?: Address;
          data?: Hex;
          value?: Hex;
          gas?: Hex;
          nonce?: Hex;
        };
        return walletClient.sendTransaction({
          account,
          to: tx.to,
          data: tx.data,
          value: tx.value ? BigInt(tx.value) : undefined,
          gas: tx.gas ? BigInt(tx.gas) : undefined,
          nonce: tx.nonce !== undefined ? Number(BigInt(tx.nonce)) : undefined,
        });
      }
      case "signMessage": {
        const [message] = params as [Hex];
        return account.signMessage({ message: { raw: message } });
      }
      case "signTypedData": {
        const [, payload] = params as [string, string | Record<string, unknown>];
        const typed = typeof payload === "string" ? JSON.parse(payload) : payload;
        return account.signTypedData(typed as never);
      }
      default:
        throw new Error(`Unsupported wallet signer method: ${method}`);
    }
  };
}

export interface WireInjectedProviderOptions {
  account: PrivateKeyAccount;
  /** Chain id the wallet reports (hex). Defaults to the local chain. */
  chainIdHex?: Hex;
}

/**
 * Installs a real EIP-1193 provider on `window.ethereum` before the app loads.
 * Signing is delegated to viem in Node; every other method is forwarded to the
 * Hardhat node, so the resulting vote is a genuine on-chain transaction.
 */
export async function wireInjectedProvider(
  page: Page,
  options: WireInjectedProviderOptions,
): Promise<void> {
  await page.exposeFunction("__votexWalletRpc", createNodeSigner(options.account));
  await page.addInitScript(installInjectedProvider, {
    address: options.account.address,
    chainIdHex: options.chainIdHex ?? LOCAL_CHAIN_ID_HEX,
    rpcUrl: LOCAL_RPC_URL,
  });
}

/** Connect the injected wallet via the site header and wait for the chip. */
export async function connectWallet(page: Page): Promise<void> {
  await page.getByTestId("wallet-connect").click();
  await expect(page.getByTestId("wallet-chip")).toBeVisible({ timeout: 20_000 });
}

interface InjectedProviderConfig {
  address: string;
  chainIdHex: string;
  rpcUrl: string;
}

/**
 * Self-contained provider installed into the page. Declared as a bare function
 * (no outer references) so Playwright can serialise it into `addInitScript`.
 */
function installInjectedProvider(config: InjectedProviderConfig): void {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  let currentChainId = config.chainIdHex;

  const emit = (event: string, ...args: unknown[]): void => {
    const handlers = listeners.get(event);
    if (!handlers) return;
    handlers.forEach((handler) => {
      try {
        handler(...args);
      } catch {
        /* a misbehaving listener must not break the provider */
      }
    });
  };

  const forward = async (method: string, params: unknown[]): Promise<unknown> => {
    const response = await fetch(config.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method,
        params: params ?? [],
      }),
    });
    const payload = (await response.json()) as {
      result?: unknown;
      error?: { code: number; message: string };
    };
    if (payload.error) {
      const error = new Error(payload.error.message) as Error & { code?: number };
      error.code = payload.error.code;
      throw error;
    }
    return payload.result;
  };

  const provider: Record<string, unknown> = {
    isMetaMask: true,
    isVOTEX: true,
    chainId: currentChainId,
    selectedAddress: config.address,

    request: async ({ method, params }: { method: string; params?: unknown[] }) => {
      const args = params ?? [];
      switch (method) {
        case "eth_requestAccounts":
        case "eth_accounts":
          return [config.address];
        case "eth_chainId":
          return currentChainId;
        case "net_version":
          return String(parseInt(currentChainId, 16));
        case "wallet_getPermissions":
          return [];
        case "wallet_requestPermissions":
          return [{ parentCapability: "eth_accounts" }];
        case "wallet_switchEthereumChain": {
          const target = (args[0] as { chainId: string }).chainId;
          currentChainId = target;
          provider.chainId = target;
          emit("chainChanged", target);
          return null;
        }
        case "wallet_addEthereumChain":
          return null;
        case "eth_sendTransaction":
        case "personal_sign":
        case "eth_signTypedData_v4":
        case "eth_sign": {
          const bridged = (
            window as unknown as {
              __votexWalletRpc: (m: string, p: unknown[]) => Promise<unknown>;
            }
          ).__votexWalletRpc;
          if (method === "eth_sendTransaction") {
            return bridged("sendTransaction", args);
          }
          if (method === "eth_signTypedData_v4") {
            return bridged("signTypedData", args);
          }
          // personal_sign: [message, address]; eth_sign: [address, message].
          const message = method === "eth_sign" ? [args[1]] : args;
          return bridged("signMessage", message);
        }
        default:
          return forward(method, args);
      }
    },

    on: (event: string, handler: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
      return provider;
    },

    once: (event: string, handler: (...args: unknown[]) => void) => {
      const wrapper = (...args: unknown[]): void => {
        (provider.removeListener as (e: string, h: (...a: unknown[]) => void) => void)(
          event,
          wrapper,
        );
        handler(...args);
      };
      (provider.on as (e: string, h: (...a: unknown[]) => void) => void)(event, wrapper);
      return provider;
    },

    removeListener: (event: string, handler: (...args: unknown[]) => void) => {
      listeners.get(event)?.delete(handler);
      return provider;
    },

    removeAllListeners: (event?: string) => {
      if (event) listeners.delete(event);
      else listeners.clear();
      return provider;
    },
  };

  (window as unknown as { ethereum: unknown }).ethereum = provider;
}
