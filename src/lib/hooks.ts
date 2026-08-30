import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { api, newIdempotencyKey, type RequestOptions } from "./api";
import { useRef } from "react";

/**
 * Thin wrappers over TanStack Query so screens do not each re-derive the same
 * fetch/invalidate plumbing.
 */

type QueryParams = Record<string, string | number | boolean | undefined>;

export function useApi<T>(
  key: unknown[],
  path: string,
  query?: QueryParams,
  options?: { enabled?: boolean; staleTime?: number },
): UseQueryResult<T, Error> {
  return useQuery({
    queryKey: [...key, query ?? null],
    queryFn: () => api<T>(path, { query }),
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime ?? 15_000,
  });
}

/** What a list query resolves to, whichever envelope the endpoint used. */
export type ListResult<T> = {
  items: T[];
  /**
   * `null` when the endpoint deliberately does not count. `/stock/balances` is
   * a grouped aggregate, where an exact total costs a second full scan of the
   * same joins — so it reports `hasMore` instead, and a pager that needs a
   * total has to cope with not having one.
   */
  total: number | null;
  hasMore: boolean;
};

/**
 * Turn whatever a list endpoint returned into one shape.
 *
 * Three envelopes reach here, because the API grew that way and rewriting every
 * endpoint to agree would be a larger change than teaching the client to cope:
 *
 *   T[]                                 an unpaginated list
 *   { data: T[], meta: { total } }      the shared page() envelope
 *   { data: { items, hasMore } }        endpoints that cannot afford a count
 *
 * `items` is ALWAYS an array. That guarantee is the whole point, not a
 * convenience: every caller ends in `.map`, so an unrecognised shape used to
 * take the entire screen down with "map is not a function" — an error naming
 * the component and saying nothing about the endpoint that caused it. An
 * unknown envelope now renders an empty list, which is wrong but legible and
 * leaves the page working.
 *
 * Exported for its tests. Pure, so they need no query client and no DOM.
 */
export function normaliseList<T>(raw: unknown): ListResult<T> {
  if (Array.isArray(raw)) {
    return { items: raw as T[], total: raw.length, hasMore: false };
  }

  const envelope = (raw ?? {}) as {
    data?: unknown;
    meta?: { total?: number; limit?: number; offset?: number };
  };

  if (Array.isArray(envelope.data)) {
    const items = envelope.data as T[];
    const total = envelope.meta?.total ?? items.length;
    const offset = envelope.meta?.offset ?? 0;
    return { items, total, hasMore: offset + items.length < total };
  }

  // `{ data: { items, hasMore } }` — a count would be too expensive here.
  const nested = (envelope.data ?? {}) as { items?: unknown; hasMore?: boolean };
  if (Array.isArray(nested.items)) {
    return { items: nested.items as T[], total: null, hasMore: nested.hasMore ?? false };
  }

  return { items: [], total: 0, hasMore: false };
}

export function useApiList<T>(
  key: unknown[],
  path: string,
  query?: QueryParams,
  options?: { enabled?: boolean },
): UseQueryResult<ListResult<T>, Error> {
  return useQuery({
    queryKey: [...key, query ?? null],
    enabled: options?.enabled ?? true,
    staleTime: 15_000,
    queryFn: async () => normaliseList<T>(await api<unknown>(path, { query, rawEnvelope: true })),
  });
}

/**
 * A mutation that invalidates the query keys it affects.
 *
 * `invalidate` takes key PREFIXES, matched loosely, so `["stock"]` clears every
 * stock query regardless of the filters baked into its full key.
 */
export function useApiMutation<TBody, TResult>(
  path: string | ((body: TBody) => string),
  options: {
    method?: RequestOptions["method"];
    invalidate?: unknown[][];
    idempotent?: boolean;
    onSuccess?: (result: TResult, body: TBody) => void;
  } = {},
): UseMutationResult<TResult, Error, TBody> {
  const queryClient = useQueryClient();

  /*
   * One idempotency key per mounted intent, NOT per attempt.
   *
   * The whole mechanism exists so that a retry after a timeout returns the
   * original result instead of booking a second delivery. Generating a fresh key
   * inside `mutationFn` would defeat it entirely, so the key is minted once and
   * reused until the mutation succeeds.
   */
  const keyRef = useRef<string | undefined>(undefined);

  return useMutation<TResult, Error, TBody>({
    mutationFn: (body: TBody) => {
      if (options.idempotent && !keyRef.current) keyRef.current = newIdempotencyKey();
      return api<TResult>(typeof path === "function" ? path(body) : path, {
        method: options.method ?? "POST",
        body,
        idempotencyKey: options.idempotent ? keyRef.current : undefined,
      });
    },
    onSuccess: (result, body) => {
      keyRef.current = undefined;
      for (const key of options.invalidate ?? []) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      options.onSuccess?.(result, body);
    },
  });
}

/** Invalidate query prefixes imperatively, for flows that span several calls. */
export function useInvalidate(): (...keys: unknown[][]) => Promise<void> {
  const queryClient = useQueryClient();
  return async (...keys) => {
    await Promise.all(keys.map((key) => queryClient.invalidateQueries({ queryKey: key })));
  };
}
