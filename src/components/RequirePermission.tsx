import type { ReactNode } from "react";
import { useSessionContext } from "../lib/session";
import type { Permission } from "../lib/permissions";

/**
 * Route-level guard.
 *
 * Like `Guard`, this is ergonomics rather than security — it stops someone
 * landing on a screen whose every request would be refused, and explains why
 * instead of showing them a page of failed panels. The server enforces the same
 * permission on each call, which is the check that actually counts.
 */
export function RequirePermission({
  permission,
  anyOf,
  children,
}: {
  permission?: Permission;
  anyOf?: Permission[];
  children: ReactNode;
}) {
  const { can, canAny } = useSessionContext();

  const allowed = permission ? can(permission) : anyOf ? canAny(...anyOf) : true;

  if (!allowed) {
    return (
      <div className="empty">
        <h3>Not available to you</h3>
        <p>
          Your account does not have permission to view this. Ask an administrator if you need it.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
