import { describe, expect, it } from "vitest";
import {
  getExplorerAddressUrl,
  getExplorerBaseUrl,
  getExplorerBlockUrl,
  getExplorerTxUrl,
  isExternalExplorerAvailable,
  LOCAL_CHAIN_ID,
  SEPOLIA_CHAIN_ID,
} from "./explorer";

describe("explorer url resolver", () => {
  it("resolves Sepolia transaction, address, and block URLs", () => {
    const tx = "0x" + "a".repeat(64);
    const addr = "0x" + "b".repeat(40);
    const block = 1234567;

    expect(getExplorerBaseUrl(SEPOLIA_CHAIN_ID)).toBe("https://sepolia.etherscan.io");
    expect(isExternalExplorerAvailable(SEPOLIA_CHAIN_ID)).toBe(true);
    expect(getExplorerTxUrl(tx, SEPOLIA_CHAIN_ID)).toBe(
      `https://sepolia.etherscan.io/tx/${tx}`,
    );
    expect(getExplorerAddressUrl(addr, SEPOLIA_CHAIN_ID)).toBe(
      `https://sepolia.etherscan.io/address/${addr}`,
    );
    expect(getExplorerBlockUrl(block, SEPOLIA_CHAIN_ID)).toBe(
      `https://sepolia.etherscan.io/block/${block}`,
    );
  });

  it("falls back to internal audit routes on local chain", () => {
    const tx = "0x" + "c".repeat(64);
    const addr = "0x" + "d".repeat(40);
    const block = 42;

    expect(getExplorerBaseUrl(LOCAL_CHAIN_ID)).toBeNull();
    expect(isExternalExplorerAvailable(LOCAL_CHAIN_ID)).toBe(false);
    expect(getExplorerTxUrl(tx, LOCAL_CHAIN_ID)).toBe(`/audit?tx=${tx}`);
    expect(getExplorerAddressUrl(addr, LOCAL_CHAIN_ID)).toBe(`/audit?address=${addr}`);
    expect(getExplorerBlockUrl(block, LOCAL_CHAIN_ID)).toBe(`/audit?block=42`);
  });
});
