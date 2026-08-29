import { createContext, useContext, type ReactNode } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api } from "./api";
import type { Permission } from "./permissions";

/**
 * The signed-in user, their permissions, and the locations they may act on.
 *
 * Fetched once from `GET /api/me` and shared through context. The whole UI
 * drives visibility from the flat permission list rather than from a role name,
 * for the same reason the backend does: a role is a bundle that can change, a
 * permission is the thing an action actually requires.
 */

export interface SessionLocation {
  id: string;
  code: string;
  name: string;
  type: "warehouse" | "store" | "transit" | "supplier" | "customer" | "scrap" | "variance";
  allowsSales: boolean;
  allowsReceipts: boolean;
  isPrimary: boolean;
}

export interface SessionData {
  user: { id: string; name: string; email: string };
  roles: string[];
  permissions: Permission[];
  locations: SessionLocation[];
  activeLocationId: string | null;
}

export interface SessionValue {
  session: SessionData;
  can: (permission: Permission) => boolean;
  canAll: (...permissions: Permission[]) => boolean;
  canAny: (...permissions: Permission[]) => boolean;
  activeLocation: SessionLocation | undefined;
}

const SessionContext = createContext<SessionValue | undefined>(undefined);

export function useSessionQuery(): UseQueryResult<SessionData, Error> {
  return useQuery({
    queryKey: ["session"],
    queryFn: () => api<SessionData>("/me"),
    // Access changes are rare, but a revoked user should not keep a stale menu
    // for long. The server re-checks everything regardless.
    staleTime: 60_000,
    retry: false,
  });
}

export function SessionProvider({
  session,
  children,
}: {
  session: SessionData;
  children: ReactNode;
}) {
  const granted = new Set(session.permissions);

  const value: SessionValue = {
    session,
    can: (permission) => granted.has(permission),
    canAll: (...permissions) => permissions.every((p) => granted.has(p)),
    canAny: (...permissions) => permissions.some((p) => granted.has(p)),
    activeLocation: session.locations.find((l) => l.id === session.activeLocationId),
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSessionContext(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSessionContext must be used inside a SessionProvider");
  }
  return value;
}

/** Convenience for the common case. */
export function useCan(): (permission: Permission) => boolean {
  return useSessionContext().can;
}
