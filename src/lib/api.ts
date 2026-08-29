/**
 * Typed fetch client.
 *
 * Mirrors the backend envelope exactly: `{ data }` on success,
 * `{ error: { code, message, details }, requestId }` on failure. Unwrapping
 * that in one place means screens deal in domain values and a single error
 * type, never in response shapes.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INSUFFICIENT_STOCK"
  | "BATCH_EXPIRED"
  | "INVALID_STATE_TRANSITION"
  | "IDEMPOTENCY_CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown;
  /** Quote this to support; it finds the full server-side trace. */
  readonly requestId?: string;

  constructor(init: {
    code: ErrorCode;
    message: string;
    status: number;
    details?: unknown;
    requestId?: string;
  }) {
    super(init.message);
    this.name = "ApiError";
    this.code = init.code;
    this.status = init.status;
    this.details = init.details;
    this.requestId = init.requestId;
  }

  /** Retrying is only meaningful for genuinely transient failures. */
  get isRetryable(): boolean {
    return this.code === "CONFLICT" || this.status >= 500;
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /**
   * Set on any mutation that must not double-apply — placing a sale, posting a
   * receipt. Generate it ONCE per user intent and reuse it across retries;
   * generating a fresh key per attempt defeats the entire mechanism.
   */
  idempotencyKey?: string;
  signal?: AbortSignal;
  /**
   * Return the whole `{ data, meta }` envelope rather than just `data`.
   * List screens need `meta.total` to page; everything else wants the payload.
   */
  rawEnvelope?: boolean;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = new URL(`${BASE_URL}/api${path}`, window.location.origin);

  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    // Session cookies are httpOnly; without this they are never sent.
    credentials: "include",
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  if (response.status === 204) return undefined as T;

  const payload = (await response.json().catch(() => null)) as
    | { data?: T; error?: { code: ErrorCode; message: string; details?: unknown }; requestId?: string }
    | null;

  if (!response.ok) {
    throw new ApiError({
      code: payload?.error?.code ?? "INTERNAL_ERROR",
      message: payload?.error?.message ?? `Request failed with status ${response.status}`,
      status: response.status,
      details: payload?.error?.details,
      requestId: payload?.requestId,
    });
  }

  return (options.rawEnvelope ? payload : payload?.data) as T;
}

/** Stable key for one user intent, reused across every retry of that intent. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
