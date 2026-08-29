import { NavLink, Outlet, useLocation } from "react-router-dom";
import { ErrorBoundary } from "./feedback";
import { useQueryClient } from "@tanstack/react-query";
import { signOut } from "../lib/auth";
import { api } from "../lib/api";
import { useSessionContext } from "../lib/session";
import type { Permission } from "../lib/permissions";

/**
 * Application shell: navigation, the working-location switcher, sign out.
 *
 * The location switcher is not a filter. Which store or warehouse a user is
 * working at determines where their stock actions LAND, and the backend records
 * it on the session — so switching here is a real state change, and every
 * cached figure that was scoped to the old location has to go with it.
 */

interface NavItem {
  to: string;
  label: string;
  /** Shown only if the user holds at least one of these. */
  anyOf: Permission[];
}

const NAV: { heading: string; items: NavItem[] }[] = [
  {
    heading: "Trade",
    items: [
      { to: "/counter", label: "Sales Counter", anyOf: ["sale:create"] },
      { to: "/counter/orders", label: "Bills", anyOf: ["sale:read"] },
      { to: "/counter/shifts", label: "Shifts", anyOf: ["shift:open", "shift:close", "shift:reconcile"] },
    ],
  },
  {
    heading: "Purchasing",
    items: [
      { to: "/purchase-orders", label: "Purchase Orders", anyOf: ["po:read"] },
      { to: "/goods-receipts", label: "Goods In", anyOf: ["grn:read"] },
      { to: "/supplier-returns", label: "Supplier Returns", anyOf: ["purchase_return:read"] },
      { to: "/suppliers", label: "Suppliers", anyOf: ["supplier:read"] },
    ],
  },
  {
    heading: "Stock",
    items: [
      { to: "/stock", label: "Stock on Hand", anyOf: ["stock:read"] },
      { to: "/transfers", label: "Transfers", anyOf: ["stock:read", "stock:transfer"] },
      { to: "/adjustments", label: "Adjustments", anyOf: ["stock:adjust", "stock:read"] },
      { to: "/counts", label: "Stock Counts", anyOf: ["stock:count", "stock:read"] },
      { to: "/stock/ledger", label: "Stock Ledger", anyOf: ["stock:read"] },
      { to: "/serials", label: "Warranty Lookup", anyOf: ["stock:read"] },
    ],
  },
  {
    heading: "Catalogue",
    items: [
      { to: "/products", label: "Products", anyOf: ["catalog:read"] },
      { to: "/categories", label: "Categories", anyOf: ["catalog:read"] },
      { to: "/customers", label: "Customers", anyOf: ["customer:read"] },
    ],
  },
  {
    heading: "Insight",
    items: [
      { to: "/reports", label: "Reports", anyOf: ["report:operational", "report:financial"] },
      { to: "/insights", label: "Insights", anyOf: ["report:operational", "report:financial"] },
      { to: "/replenishment", label: "What to reorder", anyOf: ["report:operational"] },
    ],
  },
  {
    heading: "Administration",
    items: [
      { to: "/admin/staff", label: "Staff", anyOf: ["user:read"] },
      { to: "/admin/roles", label: "Roles", anyOf: ["user:read"] },
      { to: "/admin/locations", label: "Locations", anyOf: ["location:read"] },
      { to: "/admin/audit", label: "Audit Trail", anyOf: ["audit:read"] },
      { to: "/admin/health", label: "System Health", anyOf: ["settings:write"] },
    ],
  },
];

export function Shell() {
  const { session, activeLocation, canAny } = useSessionContext();
  const queryClient = useQueryClient();
  const { pathname } = useLocation();

  // Only real places can be worked at; the virtual counterparties in the ledger
  // are not somewhere a person stands.
  const workable = session.locations.filter(
    (location) => location.type === "warehouse" || location.type === "store",
  );

  async function switchLocation(locationId: string) {
    await api("/me/active-location", { method: "PUT", body: { locationId } });
    // Everything on screen was scoped to the previous location, so the whole
    // cache goes rather than a hand-picked subset that will inevitably miss one.
    await queryClient.invalidateQueries();
  }

  const groups = NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => canAny(...item.anyOf)),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          IMS
          <small>Inventory Management</small>
        </div>

        <nav>
          <div className="sidebar-group">
            <NavLink to="/" end>
              Dashboard
            </NavLink>
          </div>

          {groups.map((group) => (
            <div className="sidebar-group" key={group.heading}>
              <h4>{group.heading}</h4>
              {group.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.to === "/counter"}>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="who">
            {session.user.name}
            <span>{session.roles.join(", ") || "No role"}</span>
          </div>
          <button type="button" className="sm" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="content">
        <header className="topbar">
          <div className="location-switch">
            <label htmlFor="working-location">Working at</label>
            {workable.length > 1 ? (
              <select
                id="working-location"
                value={activeLocation?.id ?? ""}
                onChange={(event) => void switchLocation(event.target.value)}
              >
                {activeLocation ? null : <option value="">Select a location</option>}
                {workable.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            ) : (
              <strong>{activeLocation?.name ?? workable[0]?.name ?? "No location assigned"}</strong>
            )}
          </div>
        </header>

        <main className="page">
          {workable.length === 0 ? (
            <div className="alert warn">
              You are not assigned to any store or warehouse, so you cannot receive, move or sell
              stock. Ask an administrator to grant you location access.
            </div>
          ) : null}
          {/*
            * Keyed on the path so navigating away from a broken screen clears
            * the error: without the key the boundary stays latched and every
            * subsequent page renders the failure of the one before it.
            */}
          <ErrorBoundary key={pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
