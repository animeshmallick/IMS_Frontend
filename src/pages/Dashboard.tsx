import { Link } from "react-router-dom";
import { useApi } from "../lib/hooks";
import { useSessionContext } from "../lib/session";
import { Card, Empty, PageHead, QueryState, Table, Badge } from "../components/ui";
import { money, qty, date, daysUntil } from "../lib/format";
import type { DashboardTotals, ExpiringBatch, InTransitRow, ReorderRow } from "../lib/types";

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

  return (
    <>
      <PageHead
        title={`Good day, ${session.user.name.split(" ")[0]}`}
        subtitle={activeLocation ? `Working at ${activeLocation.name}` : "No working location set"}
      />

      {can("report:operational") && totals.data ? (
        <div className="grid cols-4 mb">
          <Card>
            <div className="stat">
              <div className="label">Today's bills</div>
              <div className="value">{totals.data.today.orders}</div>
            </div>
          </Card>
          {showMoney ? (
            <>
              <Card>
                <div className="stat">
                  <div className="label">Today's sales</div>
                  <div className="value">{money(totals.data.today.revenue)}</div>
                  <div className="hint">Margin {money(totals.data.today.margin)}</div>
                </div>
              </Card>
              <Card>
                <div className="stat">
                  <div className="label">This month</div>
                  <div className="value">{money(totals.data.monthToDate.revenue)}</div>
                  <div className="hint">{totals.data.monthToDate.orders} bills</div>
                </div>
              </Card>
              <Card>
                <div className="stat">
                  <div className="label">Month margin</div>
                  <div className="value">{money(totals.data.monthToDate.margin)}</div>
                </div>
              </Card>
            </>
          ) : null}
        </div>
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
              empty={<Empty title="Nothing expiring" hint="No batch expires in the next 45 days." />}
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
              <Empty title="No working location" hint="Choose where you are working to see this." />
            ) : (
              <QueryState
                query={reorder}
                empty={<Empty title="Nothing to reorder" hint="Every stocked item is above its reorder point." />}
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
            empty={<Empty title="Nothing in transit" hint="Every dispatched transfer has been received." />}
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
