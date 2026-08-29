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

/**
 * A list endpoint returns `{ data, meta }`, and `api()` unwraps only `data`.
 * This keeps the pager's `total` by reading the envelope itself.
 */
export function useApiList<T>(
  key: unknown[],
  path: string,
  query?: QueryParams,
  options?: { enabled?: boolean },
): UseQueryResult<{ items: T[]; total: number }, Error> {
  return useQuery({
    queryKey: [...key, query ?? null],
    enabled: options?.enabled ?? true,
    staleTime: 15_000,
    queryFn: async () => {
      const raw = await api<T[] | { data: T[]; meta: { total: number } }>(path, {
        query,
        rawEnvelope: true,
      });
      if (Array.isArray(raw)) return { items: raw, total: raw.length };
      return { items: raw.data ?? [], total: raw.meta?.total ?? 0 };
    },
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
