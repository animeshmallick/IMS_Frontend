import { lazy, Suspense, useMemo } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../lib/hooks";
import { useSessionContext } from "../lib/session";
import { Card, Empty, PageHead, QueryState, Stat, Table, Badge } from "../components/ui";
import { SkeletonStats } from "../components/feedback";
import {
  Clock,
  IndianRupee,
  type LucideIcon,
  PackageSearch,
  Percent,
  Receipt,
  TrendingUp,
  Truck,
} from "lucide-react";
import { money, qty, date, daysUntil, toDateInput } from "../lib/format";
import type { TrendPoint } from "./DashboardCharts";

/*
 * The charts are fetched only by people who can see money.
 *
 * This is the landing route — everybody arrives here, the cashier included —
 * and the charting library is ~115 KB gzipped. A static import would post that
 * download to every till in the business in order to render nothing, since the
 * cards below are already behind `report:financial`. Lazily imported, the
 * download follows the permission.
 */
const TakingsTrend = lazy(async () => ({
  default: (await import("./DashboardCharts")).TakingsTrend,
}));
const TakingsSpark = lazy(async () => ({
  default: (await import("./DashboardCharts")).TakingsSpark,
}));
import type {
  DashboardTotals,
  ExpiringBatch,
  InTransitRow,
  ReorderRow,
  SalesSummaryRow,
} from "../lib/types";

/**
 * The opening screen.
 *
 * Deliberately made of things that need a DECISION today — stock about to
 * expire, items below their reorder point, deliveries still on a vehicle —
 * rather than a wall of totals. Takings are here because an owner asks for them
 * first, and only for the people allowed to see money.
 */
export function Dashboard() {
  const { session, can, activeLocation } = useSessionContext();
  const locationId = activeLocation?.id;

  const totals = useApi<DashboardTotals>(["reports", "dashboard"], "/reports/dashboard", {
    locationId,
  }, { enabled: can("report:operational") });

  const expiring = useApi<ExpiringBatch[]>(["stock", "expiring"], "/stock/expiring", {
    withinDays: 45,
    locationId,
  }, { enabled: can("stock:read") });

  const reorder = useApi<ReorderRow[]>(["stock", "reorder"], "/stock/reorder", {
    locationId: locationId!,
  }, { enabled: can("stock:read") && Boolean(locationId) });

  const inTransit = useApi<InTransitRow[]>(
    ["transfers", "in-transit"],
    "/stock-transfers/in-transit",
    { toLocationId: locationId },
    { enabled: can("stock:read") },
  );

  const showMoney = can("report:financial");

  /*
   * The last fortnight of takings.
   *
   * "Today's sales: ₹18,420" is a number without a scale — good day, bad day,
   * Tuesday? The trend answers that in the same glance, and fourteen days is
   * the shortest window that shows two of every weekday, so a quiet Monday
   * reads as a Monday rather than as a problem.
   */
  const fortnightStart = new Date();
  fortnightStart.setDate(fortnightStart.getDate() - 13);

  const recent = useApi<SalesSummaryRow[]>(
    ["reports", "sales-summary", "dashboard"],
    "/reports/sales-summary",
    { from: toDateInput(fortnightStart), to: toDateInput(new Date()), locationId },
    { enabled: showMoney, staleTime: 300_000 },
  );

  /*
   * Recharts wants numbers; the API sends `numeric` columns as strings, because
   * turning them into floats is precisely what the backend avoids. Parsing here
   * is safe: this copy is only ever drawn, never sent back, and every figure the
   * user reads still comes from the untouched string.
   */
  const trend = useMemo<TrendPoint[]>(
    () =>
      (recent.data ?? []).map((row) => ({
        day: row.day,
        revenue: Number(row.revenue),
        margin: Number(row.margin),
      })),
    [recent.data],
  );

  const expiringCount = expiring.data?.length ?? 0;
  const reorderCount = reorder.data?.length ?? 0;
  const inTransitCount = inTransit.data?.length ?? 0;

  return (
    <>
      <PageHead
        title={`Good day, ${session.user.name.split(" ")[0]}`}
        subtitle={activeLocation ? `Working at ${activeLocation.name}` : "No working location set"}
      />

      {can("report:operational") && totals.isPending ? (
        <div className="mb">
          <SkeletonStats count={showMoney ? 4 : 1} />
        </div>
      ) : null}

      {can("report:operational") && totals.data ? (
        <div className="grid cols-4 mb">
          <Card>
            <Stat
              icon={<Receipt size={13} aria-hidden />}
              label="Today's bills"
              value={totals.data.today.orders}
            />
          </Card>
          {showMoney ? (
            <>
              <Card>
                <Stat
                  icon={<IndianRupee size={13} aria-hidden />}
                  tone="info"
                  label="Today's sales"
                  value={money(totals.data.today.revenue)}
                  hint={`Margin ${money(totals.data.today.margin)}`}
                />
              </Card>
              <Card>
                <Stat
                  icon={<TrendingUp size={13} aria-hidden />}
                  tone="good"
                  label="This month"
                  value={money(totals.data.monthToDate.revenue)}
                  hint={`${totals.data.monthToDate.orders} bills`}
                >
                  {/* Shape only — no axes, no labels. The figure above is the
                      value; this says how it got there. Nothing is shown while
                      it loads: a 30px placeholder under a stat is more
                      distracting than the half-second of nothing it replaces. */}
                  <Suspense fallback={null}>
                    <TakingsSpark data={trend} />
                  </Suspense>
                </Stat>
              </Card>
              <Card>
                <Stat
                  icon={<Percent size={13} aria-hidden />}
                  label="Month margin"
                  value={money(totals.data.monthToDate.margin)}
                  hint={
                    Number(totals.data.monthToDate.revenue) > 0
                      ? `${(
                          (Number(totals.data.monthToDate.margin) /
                            Number(totals.data.monthToDate.revenue)) *
                          100
                        ).toFixed(1)}% of revenue`
                      : undefined
                  }
                />
              </Card>
            </>
          ) : null}
        </div>
      ) : null}

      {/*
        * What needs a decision, counted.
        *
        * The tables below say WHAT; this says HOW MUCH, which is the thing you
        * want before deciding whether to open the screen at all. Each figure is
        * a link, because a count nobody can act on is decoration.
        */}
      {can("stock:read") ? (
        <div className="attention mb">
          <AttentionItem
            icon={Clock}
            tone={expiringCount > 0 ? "warn" : "neutral"}
            count={expiringCount}
            label="expiring within 45 days"
            to="/stock"
          />
          <AttentionItem
            icon={PackageSearch}
            tone={reorderCount > 0 ? "danger" : "neutral"}
            count={reorderCount}
            label="below reorder point"
            to="/replenishment"
          />
          <AttentionItem
            icon={Truck}
            tone="neutral"
            count={inTransitCount}
            label="lines still in transit"
            to="/transfers"
          />
        </div>
      ) : null}

      {/*
        * Trading, at the scale a day is judged against.
        *
        * Placed under the attention strip rather than above it on purpose: the
        * strip is what needs doing today, and this is context for it. Only for
        * people who may see money at all, and only once there is enough of a
        * series to have a shape.
        */}
      {showMoney && trend.length > 2 ? (
        <Suspense fallback={null}>
          <TakingsTrend data={trend} />
        </Suspense>
      ) : null}

      <div className="grid cols-2">
        {can("stock:read") ? (
          <Card
            title="Expiring soon"
            actions={<Link className="btn sm" to="/stock">All stock</Link>}
            flush
          >
            <QueryState
              query={expiring}
              empty={<Empty
                  icon={<Clock size={14} aria-hidden />}
                  title="Nothing expiring"
                  hint="No batch expires in the next 45 days."
                />}
            >
              <Table
                head={
                  <tr>
                    <th>Item</th>
                    <th>Batch</th>
                    <th>Expires</th>
                    <th className="num">On hand</th>
                    {showMoney ? <th className="num">At risk</th> : null}
                  </tr>
                }
              >
                {(expiring.data ?? []).slice(0, 8).map((row) => {
                  const days = daysUntil(row.expiresOn);
                  return (
                    <tr key={`${row.batchId}-${row.locationId}`}>
                      <td>
                        {row.sku}
                        <span className="sub">{row.locationName}</span>
                      </td>
                      <td className="small">{row.batchCode}</td>
                      <td>
                        {date(row.expiresOn)}
                        <span className="sub">
                          <Badge tone={days !== null && days < 0 ? "danger" : days !== null && days <= 14 ? "warn" : "neutral"}>
                            {days === null ? "—" : days < 0 ? `${-days}d overdue` : `${days}d left`}
                          </Badge>
                        </span>
                      </td>
                      <td className="num">{qty(row.onHand)}</td>
                      {showMoney ? <td className="num">{money(row.valueAtRisk)}</td> : null}
                    </tr>
                  );
                })}
              </Table>
            </QueryState>
          </Card>
        ) : null}

        {can("stock:read") ? (
          <Card
            title="Below reorder point"
            actions={
              can("po:write") ? (
                <Link className="btn sm primary" to="/purchase-orders/new">
                  Raise order
                </Link>
              ) : null
            }
            flush
          >
            {!locationId ? (
              <Empty
                icon={<PackageSearch size={14} aria-hidden />}
                title="No working location"
                hint="Choose where you are working to see this."
              />
            ) : (
              <QueryState
                query={reorder}
                empty={<Empty
                    icon={<PackageSearch size={14} aria-hidden />}
                    title="Nothing to reorder"
                    hint="Every stocked item is above its reorder point."
                  />}
              >
                <Table
                  head={
                    <tr>
                      <th>Item</th>
                      <th className="num">On hand</th>
                      <th className="num">Reorder at</th>
                      <th className="num">Suggested</th>
                    </tr>
                  }
                >
                  {(reorder.data ?? []).slice(0, 8).map((row) => (
                    <tr key={row.variantId}>
                      <td>
                        {row.sku}
                        <span className="sub">{row.productName}</span>
                      </td>
                      <td className="num">{qty(row.onHand)}</td>
                      <td className="num muted">{qty(row.reorderPoint)}</td>
                      <td className="num">
                        <strong>{qty(row.suggestedQty)}</strong>
                      </td>
                    </tr>
                  ))}
                </Table>
              </QueryState>
            )}
          </Card>
        ) : null}
      </div>

      {can("stock:read") ? (
        <Card
          title="On a vehicle right now"
          actions={<Link className="btn sm" to="/transfers">All transfers</Link>}
          flush
        >
          <QueryState
            query={inTransit}
            empty={<Empty
              icon={<Truck size={14} aria-hidden />}
              title="Nothing in transit"
              hint="Every dispatched transfer has been received."
            />}
          >
            <Table
              head={
                <tr>
                  <th>Transfer</th>
                  <th>Item</th>
                  <th>Batch</th>
                  <th>Dispatched</th>
                  <th className="num">Outstanding</th>
                </tr>
              }
            >
              {(inTransit.data ?? []).map((row) => (
                <tr key={`${row.transferId}-${row.variantId}-${row.batchCode}`}>
                  <td>
                    <Link to={`/transfers/${row.transferId}`}>{row.transferNumber}</Link>
                  </td>
                  <td>{row.sku}</td>
                  <td className="small">{row.batchCode}</td>
                  <td>{date(row.dispatchedAt)}</td>
                  <td className="num">{qty(row.outstandingQty)}</td>
                </tr>
              ))}
            </Table>
          </QueryState>
        </Card>
      ) : null}
    </>
  );
}

/**
 * One figure from the attention strip.
 *
 * Zero is rendered plainly rather than hidden: "nothing is expiring" is
 * information, and a strip that changes shape depending on the day is harder to
 * read at a glance than one that always says the same three things.
 */
function AttentionItem({
  icon: Icon,
  tone,
  count,
  label,
  to,
}: {
  icon: LucideIcon;
  tone: "neutral" | "warn" | "danger";
  count: number;
  label: string;
  to: string;
}) {
  return (
    <Link to={to} className={`attention-item ${count > 0 ? tone : "neutral"}`}>
      <Icon size={16} aria-hidden />
      <span className="attention-count">{count}</span>
      <span className="small muted">{label}</span>
    </Link>
  );
}
