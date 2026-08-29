import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowLeftRight,
  BadgeCheck,
  BarChart3,
  Bell,
  Boxes,
  Building2,
  ClipboardCheck,
  ClipboardList,
  Coins,
  FileClock,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  Menu,
  Monitor,
  Moon,
  Package,
  PackageCheck,
  PackageMinus,
  Receipt,
  RotateCcw,
  ScanLine,
  Search,
  ShieldCheck,
  ShoppingCart,
  Sun,
  Tags,
  Truck,
  Users,
  Wallet,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { api } from "../lib/api";
import { signOut } from "../lib/auth";
import type { Permission } from "../lib/permissions";
import { useApi } from "../lib/hooks";
import { useOffline } from "../lib/offline";
import { useSessionContext } from "../lib/session";
import { useTheme } from "../lib/theme";
import { CommandPalette, openCommandPalette } from "./CommandPalette";
import { ErrorBoundary } from "./feedback";

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
  icon: LucideIcon;
  /** Shown only if the user holds at least one of these. */
  anyOf: Permission[];
}

const NAV: { heading: string; items: NavItem[] }[] = [
  {
    heading: "Trade",
    items: [
      { to: "/counter", label: "Sales Counter", icon: ShoppingCart, anyOf: ["sale:create"] },
      { to: "/counter/orders", label: "Bills", icon: Receipt, anyOf: ["sale:read"] },
      {
        to: "/counter/shifts",
        label: "Shifts",
        icon: Wallet,
        anyOf: ["shift:open", "shift:close", "shift:reconcile"],
      },
    ],
  },
  {
    heading: "Purchasing",
    items: [
      { to: "/purchase-orders", label: "Purchase Orders", icon: ClipboardList, anyOf: ["po:read"] },
      { to: "/goods-receipts", label: "Goods In", icon: PackageCheck, anyOf: ["grn:read"] },
      {
        to: "/supplier-returns",
        label: "Supplier Returns",
        icon: RotateCcw,
        anyOf: ["purchase_return:read"],
      },
      { to: "/suppliers", label: "Suppliers", icon: Truck, anyOf: ["supplier:read"] },
    ],
  },
  {
    heading: "Stock",
    items: [
      { to: "/stock", label: "Stock on Hand", icon: Boxes, anyOf: ["stock:read"] },
      {
        to: "/transfers",
        label: "Transfers",
        icon: ArrowLeftRight,
        anyOf: ["stock:read", "stock:transfer"],
      },
      {
        to: "/adjustments",
        label: "Adjustments",
        icon: PackageMinus,
        anyOf: ["stock:adjust", "stock:read"],
      },
      {
        to: "/counts",
        label: "Stock Counts",
        icon: ClipboardCheck,
        anyOf: ["stock:count", "stock:read"],
      },
      { to: "/stock/ledger", label: "Stock Ledger", icon: FileClock, anyOf: ["stock:read"] },
      { to: "/serials", label: "Warranty Lookup", icon: BadgeCheck, anyOf: ["stock:read"] },
    ],
  },
  {
    heading: "Catalogue",
    items: [
      { to: "/products", label: "Products", icon: Package, anyOf: ["catalog:read"] },
      { to: "/categories", label: "Categories", icon: Tags, anyOf: ["catalog:read"] },
      { to: "/customers", label: "Customers", icon: Users, anyOf: ["customer:read"] },
    ],
  },
  {
    heading: "Insight",
    items: [
      {
        to: "/reports",
        label: "Reports",
        icon: BarChart3,
        anyOf: ["report:operational", "report:financial"],
      },
      {
        to: "/insights",
        label: "Insights",
        icon: Coins,
        anyOf: ["report:operational", "report:financial"],
      },
      {
        to: "/replenishment",
        label: "What to reorder",
        icon: Archive,
        anyOf: ["report:operational"],
      },
    ],
  },
  {
    heading: "Administration",
    items: [
      { to: "/admin/staff", label: "Staff", icon: Users, anyOf: ["user:read"] },
      { to: "/admin/roles", label: "Roles", icon: ShieldCheck, anyOf: ["user:read"] },
      { to: "/admin/locations", label: "Locations", icon: Building2, anyOf: ["location:read"] },
      { to: "/admin/audit", label: "Audit Trail", icon: ScanLine, anyOf: ["audit:read"] },
      { to: "/admin/health", label: "System Health", icon: HeartPulse, anyOf: ["settings:write"] },
    ],
  },
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function Shell() {
  const { session, activeLocation, canAny } = useSessionContext();
  const queryClient = useQueryClient();
  const { pathname } = useLocation();
  const { theme, setTheme } = useTheme();
  const offline = useOffline();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  /*
   * Alerts raised in the last day.
   *
   * Low stock, a till that did not balance, a ledger that drifted — nobody
   * goes looking for these, so the count has to come to them.
   *
   * Deliberately "last 24 hours" and not "unread": alerts are outbox events
   * and carry no acknowledged state, so a badge counting all of them would
   * only ever climb, and a number that never goes down is one people stop
   * reading. A rolling window clears itself and stays honest about what it is
   * counting. `delivered` on these rows means the webhook fired, not that a
   * person dealt with it — it is not a substitute.
   *
   * Stale-tolerant on purpose: an ambient signal, not a live feed worth
   * hammering the API for.
   */
  const alerts = useApi<{ id: string; createdAt: string }[]>(
    ["alerts", "recent"],
    "/alerts",
    { limit: 100 },
    { enabled: canAny("stock:read"), staleTime: 120_000 },
  );

  const alertCount = (() => {
    const since = Date.now() - 24 * 60 * 60 * 1000;
    return (alerts.data ?? []).filter((a) => new Date(a.createdAt).getTime() >= since).length;
  })();

  // Any navigation closes the mobile drawer; leaving it open over the page the
  // user just asked for is the most common small annoyance in this pattern.
  useEffect(() => setMenuOpen(false), [pathname]);

  /*
   * A translucent sticky header sitting on a flat page reads as a seam rather
   * than a layer. It gains a border and a shadow only once content is actually
   * passing underneath it, which is the moment the separation starts carrying
   * information.
   */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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

  const paletteItems = [
    { to: "/", label: "Dashboard", group: "Overview" },
    ...groups.flatMap((group) =>
      group.items.map((item) => ({ to: item.to, label: item.label, group: group.heading })),
    ),
  ];

  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  /*
   * Where am I?
   *
   * With six groups and twenty-four screens, the sidebar's active row is a
   * small mark in a long list — easy to lose after scrolling, and invisible
   * entirely once the sidebar collapses on a narrow screen. The header says it
   * in words instead. Longest match wins, so /stock/ledger resolves to the
   * ledger rather than to /stock.
   */
  const currentGroup = NAV.find((group) =>
    group.items.some((item) => pathname === item.to || pathname.startsWith(item.to + "/")),
  );
  const currentItem = currentGroup?.items
    .filter((item) => pathname === item.to || pathname.startsWith(item.to + "/"))
    .sort((a, b) => b.to.length - a.to.length)[0];

  return (
    <div className="shell">
      {menuOpen ? (
        <button
          type="button"
          className="scrim"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      <aside className={menuOpen ? "sidebar open" : "sidebar"}>
        <div className="sidebar-brand">
          <span className="mark" aria-hidden>
            IM
          </span>
          <span className="brand-text">
            <span className="brand-name">IMS</span>
            <span className="brand-sub">Inventory</span>
          </span>
        </div>

        <nav aria-label="Main">
          <NavLink to="/" end className="nav-link">
            <LayoutDashboard size={15} aria-hidden />
            Dashboard
          </NavLink>

          {groups.map((group) => (
            <div key={group.heading}>
              <div className="sidebar-group">{group.heading}</div>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/counter"}
                  className="nav-link"
                >
                  <item.icon size={15} aria-hidden />
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button type="button" className="ghost user-button">
                <span className="avatar" aria-hidden>
                  {initials(session.user.name)}
                </span>
                <span className="grow" style={{ textAlign: "left", minWidth: 0 }}>
                  <span className="ellipsis">{session.user.name}</span>
                  <span className="sub ellipsis">{session.roles.join(", ") || "No role"}</span>
                </span>
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content className="menu" side="top" align="start" sideOffset={6}>
                <DropdownMenu.Label className="menu-label">
                  {session.user.email}
                </DropdownMenu.Label>
                <DropdownMenu.Separator className="menu-sep" />

                <DropdownMenu.Label className="menu-label">Appearance</DropdownMenu.Label>
                {(
                  [
                    ["light", "Light", Sun],
                    ["dark", "Dark", Moon],
                    ["system", "Match system", Monitor],
                  ] as const
                ).map(([value, label, Icon]) => (
                  <DropdownMenu.Item
                    key={value}
                    className="menu-item"
                    onSelect={() => setTheme(value)}
                  >
                    <Icon size={14} aria-hidden />
                    {label}
                    {theme === value ? <span className="grow right small muted">✓</span> : null}
                  </DropdownMenu.Item>
                ))}

                <DropdownMenu.Separator className="menu-sep" />
                <DropdownMenu.Item className="menu-item danger" onSelect={() => void signOut()}>
                  <LogOut size={14} aria-hidden />
                  Sign out
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </aside>

      <div className="content">
        <header className={scrolled ? "topbar scrolled" : "topbar"}>
          <div className="row topbar-left">
            <button
              type="button"
              className="ghost sm menu-toggle"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="Toggle menu"
            >
              <Menu size={16} aria-hidden />
            </button>

            <nav className="crumbs" aria-label="Breadcrumb">
              {currentGroup ? <span className="crumb-group">{currentGroup.heading}</span> : null}
              <span className="crumb-current">{currentItem?.label ?? "Dashboard"}</span>
            </nav>

            <span className="topbar-sep" aria-hidden />

            <div className="location-switch">
              <label htmlFor="working-location" className="small muted nowrap">
                At
              </label>
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
                <strong>
                  {activeLocation?.name ?? workable[0]?.name ?? "No location assigned"}
                </strong>
              )}
            </div>
          </div>

          <div className="row topbar-right">
            {/*
             * Connection state, shown only when it is not the boring answer.
             * A till that has silently dropped offline still takes money, and
             * the cashier needs to know that is what is happening — but a green
             * "online" badge on every screen all day is noise that trains
             * people to stop looking at exactly this corner.
             */}
            {!offline.online ? (
              <span className="conn offline" title="Working offline — bills are queued locally">
                <WifiOff size={13} aria-hidden />
                Offline
                {offline.pending > 0 ? <span className="conn-count">{offline.pending}</span> : null}
              </span>
            ) : offline.pending > 0 ? (
              <span className="conn syncing" title="Queued bills waiting to sync">
                <Wifi size={13} aria-hidden />
                Syncing
                <span className="conn-count">{offline.pending}</span>
              </span>
            ) : null}

            {alertCount > 0 ? (
              <Link
                to="/admin/health"
                className="alert-bell"
                title={`${alertCount} alert${alertCount === 1 ? "" : "s"} in the last 24 hours`}
              >
                <Bell size={15} aria-hidden />
                <span className="bell-count">{alertCount > 99 ? "99+" : alertCount}</span>
              </Link>
            ) : null}

            {/*
             * The palette is opened with ⌘K; this button exists so it is
             * discoverable at all. A shortcut nobody knows about is a feature
             * nobody has.
             */}
            <button
              type="button"
              className="ghost sm search-trigger"
              onClick={openCommandPalette}
            >
              <Search size={14} aria-hidden />
              <span className="small">Search</span>
              <kbd>⌘K</kbd>
            </button>

            <button
              type="button"
              className="ghost sm icon-only"
              aria-label={`Theme: ${theme}. Click to change.`}
              onClick={() =>
                setTheme(theme === "light" ? "dark" : theme === "dark" ? "system" : "light")
              }
            >
              <ThemeIcon size={15} aria-hidden />
            </button>
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

      <CommandPalette items={paletteItems} />
    </div>
  );
}
