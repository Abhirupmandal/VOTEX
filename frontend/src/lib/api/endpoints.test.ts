import { describe, expect, it, vi, afterEach } from "vitest";

import {
  getAlert,
  acknowledgeAlert,
  resolveAlert,
  triggerAIAnalysis,
  getElectionFeatures,
  getElection,
  getElectionResults,
  listElections,
  listVoters,
} from "@/lib/api/endpoints";

/** A minimal fetch stub that records the URL and returns a JSON payload. */
function stubFetch(payload: unknown, status = 200) {
  return vi.fn(async () =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("api.endpoints.listElections", () => {
  it("targets the /elections path with pagination query params", async () => {
    const fetchImpl = stubFetch({
      items: [],
      page: 1,
      page_size: 25,
      total: 0,
      pages: 0,
      source: "indexed",
    });

    await listElections({ state: "ACTIVE", page: 2, pageSize: 10 }, { fetchImpl });

    const url = String((fetchImpl.mock.calls[0] as unknown[])[0]);
    expect(url).toContain("/api/v1/elections");
    expect(url).toContain("state=ACTIVE");
    expect(url).toContain("page=2");
    expect(url).toContain("page_size=10");
  });
});

describe("api.endpoints.getElection", () => {
  it("requests the election detail route", async () => {
    const fetchImpl = stubFetch({ id: 1, blockchain_election_id: 1 });
    await getElection(1, { fetchImpl });
    const url = String((fetchImpl.mock.calls[0] as unknown[])[0]);
    expect(url).toContain("/api/v1/elections/1");
  });
});

describe("api.endpoints.getElectionResults", () => {
  it("requests the nested results route", async () => {
    const fetchImpl = stubFetch({ election_id: 1 });
    await getElectionResults(1, { fetchImpl });
    const url = String((fetchImpl.mock.calls[0] as unknown[])[0]);
    expect(url).toContain("/api/v1/elections/1/results");
  });
});

describe("api.endpoints.listVoters", () => {
  it("targets the /voters path with pagination and active filter", async () => {
    const fetchImpl = stubFetch({
      items: [],
      page: 1,
      page_size: 20,
      total: 0,
      pages: 0,
    });
    await listVoters({ page: 1, pageSize: 20, active: true }, { fetchImpl });
    const url = String((fetchImpl.mock.calls[0] as unknown[])[0]);
    expect(url).toContain("/api/v1/voters");
    expect(url).toContain("page=1");
    expect(url).toContain("page_size=20");
    expect(url).toContain("active=true");
  });
});

describe("api.endpoints alert lifecycle and AI triggers", () => {
  it("getAlert targets the alert detail route", async () => {
    const fetchImpl = stubFetch({ id: 42, alert_type: "VELOCITY_SPIKE" });
    await getAlert(42, { fetchImpl });
    const url = String((fetchImpl.mock.calls[0] as unknown[])[0]);
    expect(url).toContain("/api/v1/alerts/42");
  });

  it("acknowledgeAlert sends POST to /alerts/{id}/acknowledge", async () => {
    const fetchImpl = stubFetch({ id: 42, status: "ACKNOWLEDGED" });
    await acknowledgeAlert(42, { fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/alerts/42/acknowledge");
    expect(init.method).toBe("POST");
  });

  it("resolveAlert sends POST to /alerts/{id}/resolve", async () => {
    const fetchImpl = stubFetch({ id: 42, status: "RESOLVED" });
    await resolveAlert(42, { fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/alerts/42/resolve");
    expect(init.method).toBe("POST");
  });

  it("triggerAIAnalysis sends POST to trigger analysis", async () => {
    const fetchImpl = stubFetch({ election_id: 3, risk_score: 12 });
    await triggerAIAnalysis(3, { fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/elections/3/ai/analyze");
    expect(init.method).toBe("POST");
  });

  it("getElectionFeatures requests the telemetry features endpoint", async () => {
    const fetchImpl = stubFetch({ election_id: 3, snapshots: [] });
    await getElectionFeatures(3, 10, { fetchImpl });
    const url = String((fetchImpl.mock.calls[0] as unknown[])[0]);
    expect(url).toContain("/api/v1/elections/3/ai/features");
    expect(url).toContain("limit=10");
  });
});

