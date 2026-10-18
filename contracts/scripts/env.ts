import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Lightweight, zero-dependency .env loader for the contracts workspace.
 * Reads contracts/.env first, then falls back to root .env if not found.
 * Never overrides existing environment variables.
 */
export function loadEnv(): void {
  const candidates = [
    resolve(__dirname, "..", ".env"),
    resolve(__dirname, "..", "..", ".env"),
  ];

  for (const envPath of candidates) {
    if (existsSync(envPath)) {
      try {
        const content = readFileSync(envPath, "utf8");
        const lines = content.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx === -1) continue;
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          // Remove wrapping quotes if present
          if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
          ) {
            val = val.slice(1, -1);
          }
          if (!(key in process.env)) {
            process.env[key] = val;
          }
        }
      } catch {
        // Silently skip unreadable files
      }
      break;
    }
  }
}

export interface SepoliaConfig {
  rpcUrl: string;
  privateKey: string;
  formattedPrivateKey: string;
}

/**
 * Validates Sepolia testnet deployment configuration.
 *
 * Rules:
 * - Fails clearly if RPC URL is missing when required
 * - Fails clearly if private key is missing when required
 * - Fails clearly if private key format is invalid (must be 64 hex characters)
 * - NEVER prints or exposes the actual secret value in error messages or logs
 */
export function validateSepoliaConfig(required = false): SepoliaConfig | null {
  loadEnv();

  const rpcUrl =
    process.env.SEPOLIA_RPC_URL?.trim() ||
    process.env.TESTNET_RPC_URL?.trim() ||
    "";

  const rawKey =
    process.env.SEPOLIA_PRIVATE_KEY?.trim() ||
    process.env.DEPLOYER_PRIVATE_KEY?.trim() ||
    "";

  if (!rpcUrl) {
    if (required) {
      throw new Error(
        "[Sepolia Configuration Error] Missing SEPOLIA_RPC_URL. " +
          "Please configure a valid Ethereum Sepolia RPC endpoint in contracts/.env or your environment.",
      );
    }
    return null;
  }

  // Basic URL sanity check
  if (!rpcUrl.startsWith("http://") && !rpcUrl.startsWith("https://")) {
    if (required) {
      throw new Error(
        "[Sepolia Configuration Error] Invalid SEPOLIA_RPC_URL: must start with http:// or https://",
      );
    }
    return null;
  }

  if (!rawKey) {
    if (required) {
      throw new Error(
        "[Sepolia Configuration Error] Missing SEPOLIA_PRIVATE_KEY. " +
          "Please configure your dedicated testnet deployer private key in contracts/.env or your environment. " +
          "NEVER paste private keys into chat.",
      );
    }
    return null;
  }

  // Format validation: 64 hex characters, optional 0x prefix
  const cleanHex = rawKey.replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{64}$/.test(cleanHex)) {
    throw new Error(
      "[Sepolia Configuration Error] Invalid private key format for SEPOLIA_PRIVATE_KEY: " +
        "Must be exactly 64 hexadecimal characters (32 bytes). " +
        "Check that there are no accidental spaces, truncation, or invalid characters.",
    );
  }

  const formattedKey = `0x${cleanHex}`;

  return {
    rpcUrl,
    privateKey: cleanHex,
    formattedPrivateKey: formattedKey,
  };
}
