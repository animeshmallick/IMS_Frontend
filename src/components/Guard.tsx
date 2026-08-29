import type { ReactNode } from "react";
import { useSessionContext } from "../lib/session";
import type { Permission } from "../lib/permissions";

/**
 * Hides UI the user cannot use.
 *
 * This is ergonomics, NOT security. Every one of these permissions is checked
 * again on the server, which is the only check that counts — a hidden button is
 * one HTTP client away from being pressed. Treat this as "do not show people
 * doors they cannot open", never as the lock itself.
 */
export function Guard({
  permission,
  anyOf,
  fallback = null,
  children,
}: {
  permission?: Permission;
  anyOf?: Permission[];
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const { can, canAny } = useSessionContext();

  const allowed = permission ? can(permission) : anyOf ? canAny(...anyOf) : true;

  return <>{allowed ? children : fallback}</>;
}
