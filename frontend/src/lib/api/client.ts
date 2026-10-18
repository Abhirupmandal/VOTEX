/**
 * Typed HTTP client for the VOTEX backend read/observability API.
 *
 * IMPORTANT (Phase 5 §17): the backend is an OFF-CHAIN INDEXED VIEW. It is used
 * for election *discovery*, the *audit trail*, and *analytics* only. Voter
 * eligibility, election state, vote submission, and verification are always read
 * directly from the chain via wagmi/viem — never from this client.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly detail: unknown;
  readonly url: string;

  constructor(message: string, status: number, detail: unknown, url: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.url = url;
  }
}

/** Backend base URL. Falls back to the local FastAPI dev server. */
export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000"
).replace(/\/+$/, "");

/** Every backend route lives under this version prefix. */
export const API_PREFIX = "/api/v1";

/** Query-string values accepted by the client (arrays expand to repeats). */
export type QueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Array<string | number | boolean>;

/** Build a query string, skipping null/undefined values. */
export function buildQuery(params?: Record<string, QueryValue>): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, String(item));
    } else {
      search.append(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

interface RequestOptions {
  /** Query parameters appended to the URL. */
  query?: Record<string, QueryValue>;
  /** Abort signal for cancellation (used by React Query). */
  signal?: AbortSignal;
  /** Injectable fetch (tests supply a mock). */
  fetchImpl?: typeof fetch;
}

/**
 * Perform a typed GET against the backend.
 *
 * Errors are normalised into {@link ApiError} so callers can render a
 * human-readable message while still exposing the raw payload for diagnostics.
 */
export async function apiGet<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = `${API_BASE_URL}${API_PREFIX}${path}${buildQuery(options.query)}`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: options.signal,
      cache: "no-store",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Network request failed";
    throw new ApiError(
      `Cannot reach the VOTEX backend at ${API_BASE_URL}. ${message}`,
      0,
      error,
      url,
    );
  }

  if (!response.ok) {
    let detail: unknown = null;
    try {
      detail = await response.json();
    } catch {
      detail = await response.text().catch(() => null);
    }
    throw new ApiError(
      extractDetail(detail) ?? `Backend returned ${response.status}`,
      response.status,
      detail,
      url,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/**
 * Perform a typed POST against the backend.
 */
export async function apiPost<T>(
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = `${API_BASE_URL}${API_PREFIX}${path}${buildQuery(options.query)}`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: options.signal,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Network request failed";
    throw new ApiError(
      `Cannot reach the VOTEX backend at ${API_BASE_URL}. ${message}`,
      0,
      error,
      url,
    );
  }

  if (!response.ok) {
    let detail: unknown = null;
    try {
      detail = await response.json();
    } catch {
      detail = await response.text().catch(() => null);
    }
    throw new ApiError(
      extractDetail(detail) ?? `Backend returned ${response.status}`,
      response.status,
      detail,
      url,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}


/** Pull a readable message out of FastAPI's `{ "detail": ... }` envelope. */
function extractDetail(detail: unknown): string | null {
  if (!detail || typeof detail !== "object") {
    return typeof detail === "string" ? detail : null;
  }
  const record = detail as Record<string, unknown>;
  const value = record.detail;
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0] as Record<string, unknown>;
    if (first && typeof first.msg === "string") return first.msg;
  }
  if (typeof value === "object" && value !== null) {
    const nested = value as Record<string, unknown>;
    if (typeof nested.message === "string") return nested.message;
  }
  return null;
}
