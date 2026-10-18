import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for VOTEX end-to-end tests.
 *
 * The webServer block builds and starts the Next.js production server so the
 * smoke suite runs against a realistic bundle.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Build first: NEXT_PUBLIC_* values are inlined into the client bundle at
    // build time (sourced from votex/frontend/.env.local for local runs).
    command: "npm run build && npm run start",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      NEXT_PUBLIC_CHAIN_ID: process.env.NEXT_PUBLIC_CHAIN_ID ?? "31337",
      NEXT_PUBLIC_RPC_URL:
        process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545",
      NEXT_PUBLIC_API_BASE_URL:
        process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000",
      NEXT_PUBLIC_ELECTION_FACTORY_ADDRESS:
        process.env.NEXT_PUBLIC_ELECTION_FACTORY_ADDRESS ??
        "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
      NEXT_PUBLIC_VOTER_REGISTRY_ADDRESS:
        process.env.NEXT_PUBLIC_VOTER_REGISTRY_ADDRESS ??
        "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
      NEXT_PUBLIC_EMERGENCY_CONTROLLER_ADDRESS:
        process.env.NEXT_PUBLIC_EMERGENCY_CONTROLLER_ADDRESS ??
        "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
      NEXT_PUBLIC_ACCESS_MANAGER_ADDRESS:
        process.env.NEXT_PUBLIC_ACCESS_MANAGER_ADDRESS ??
        "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    },
  },
});
