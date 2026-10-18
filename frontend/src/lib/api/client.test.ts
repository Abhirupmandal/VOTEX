import { describe, expect, it, vi } from "vitest";

import { ApiError, apiGet, buildQuery } from "@/lib/api/client";

describe("api.client.buildQuery", () => {
  it("skips null, undefined and empty values", () => {
    expect(
      buildQuery({ a: 1, b: null, c: undefined, d: "" }),
    ).toBe("?a=1");
  });

  it("expands array values into repeated keys", () => {
    const qs = buildQuery({ state: ["ACTIVE", "PAUSED"] });
    expect(qs).toBe("?state=ACTIVE&state=PAUSED");
  });

  it("returns an empty string when there is nothing to encode", () => {
    expect(buildQuery({})).toBe("");
    expect(buildQuery()).toBe("");
  });
});

describe("api.client.apiGet", () => {
  it("calls the versioned endpoint and parses JSON", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await apiGet<{ ok: boolean }>("/health", { fetchImpl });
    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const calledUrl = String((fetchImpl.mock.calls[0] as unknown[])[0]);
    expect(calledUrl).toContain("/api/v1/health");
  });

  it("throws an ApiError carrying the status on a non-2xx response", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ detail: "Election not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(apiGet("/elections/99", { fetchImpl })).rejects.toBeInstanceOf(
      ApiError,
    );

    try {
      await apiGet("/elections/99", { fetchImpl });
    } catch (error) {
      const apiError = error as ApiError;
      expect(apiError.status).toBe(404);
      expect(apiError.message).toContain("Election not found");
    }
  });

  it("normalises a transport failure (status 0) into an ApiError", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("Failed to fetch");
    });

    try {
      await apiGet("/health", { fetchImpl });
      throw new Error("expected apiGet to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(0);
    }
  });

  it("returns undefined for a 204 No Content response", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(null, { status: 204 }),
    );
    await expect(apiGet("/elections/1", { fetchImpl })).resolves.toBeUndefined();
  });
});
