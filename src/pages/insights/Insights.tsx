import { useState } from "react";
import { useApi } from "../../lib/hooks";
import { useSessionContext } from "../../lib/session";
import { Badge, Card, Empty, Field, PageHead, QueryState, Table } from "../../components/ui";
import { date, humanise, money, qty, toDateInput } from "../../lib/format";
import type { Location } from "../../lib/types";

/**
 * Insights.
 *
 * Every figure on this page is DERIVED from documents staff already create.
 * Nothing here asked anyone to record anything extra — which is the point: the
 * cheapest data is the data you are already capturing and not yet reading.
 */

interface SupplierRow {
  supplierId: string;
  supplierName: string;
  ordersPlaced: number;
  deliveries: number;
  lateDeliveries: number;
  onTimePercent: string;
  shortLines: number;
  shortPercent: string;
  priceVariance: string;
  avgLeadDays: string;
}

interface StaffRow {
  userId: string;
  name: string;
  bills: number;
  revenue: string;
  margin: string;
  discountGiven: string;
  avgBillValue: string;
  returnsProcessed: number;
  returnValue: string;
  shiftsClosed: number;
  totalCashVariance: string;
}

interface ShrinkageRow {
  reason: string;
  locationId: string;
  locationName: string;
  documents: number;
  costImpact: string;
}

interface DeadStockRow {
  variantId: string;
  sku: string;
  productName: string;
  locationName: string;
  onHand: string;
  stockValue: string;
  lastSoldAt: string | null;
  daysSinceSale: number | null;
}

interface MarginRow {
  variantId: string;
  sku: string;
  productName: string;
  currentPrice: string;
  latestCost: string;
  previousCost: string;
  costIncrease: string;
  currentMarginPercent: string;
  priceSetAt: string;
  latestCostAt: string;
}

interface AccuracyRow {
  countId: string;
  countNumber: string;
  locationName: string;
  postedAt: string;
  linesCounted: number;
  linesExact: number;
  accuracyPercent: string;
  netVarianceCost: string;
  absVarianceCost: string;
}

interface TradingRow {
  hour: number;
  bills: number;
  revenue: string;
  avgBill: string;
}

type Tab =
  | "suppliers"
  | "staff"
  | "shrinkage"
  | "dead-stock"
  | "margin"
  | "accuracy"
  | "trading";

export function Insights() {
  const { can } = useSessionContext();
  const financial = can("report:financial");

  const today = new Date();
  const [from, setFrom] = useState(
    toDateInput(new Date(today.getFullYear(), today.getMonth() - 2, today.getDate())),
  );
  const [to, setTo] = useState(toDateInput(today));
  const [locationId, setLocationId] = useState("");
  const [tab, setTab] = useState<Tab>(financial ? "suppliers" : "shrinkage");
  const [idleDays, setIdleDays] = useState(90);

  const query = { from, to, locationId: locationId || undefined };
  const locations = useApi<Location[]>(["locations"], "/locations");

  const suppliers = useApi<SupplierRow[]>(["insights", "suppliers"], "/insights/suppliers", query, {
    enabled: financial && tab === "suppliers",
  });
  const staff = useApi<StaffRow[]>(["insights", "staff"], "/insights/staff", query, {
    enabled: financial && tab === "staff",
  });
  const shrink = useApi<ShrinkageRow[]>(["insights", "shrinkage"], "/insights/shrinkage", query, {
    enabled: tab === "shrinkage",
  });
  const dead = useApi<DeadStockRow[]>(
    ["insights", "dead-stock"],
    "/insights/dead-stock",
    { ...query, idleDays, limit: 100 },
    { enabled: financial && tab === "dead-stock" },
  );
  const margin = useApi<MarginRow[]>(["insights", "margin"], "/insights/margin-erosion", query, {
    enabled: financial && tab === "margin",
  });
  const accuracy = useApi<AccuracyRow[]>(
    ["insights", "accuracy"],
    "/insights/stock-accuracy",
    query,
    { enabled: tab === "accuracy" },
  );
  const trading = useApi<TradingRow[]>(
    ["insights", "trading"],
    "/insights/trading-pattern",
    query,
    { enabled: tab === "trading" },
  );

  const tabs: { id: Tab; label: string; financial: boolean }[] = [
    { id: "suppliers", label: "Suppliers", financial: true },
    { id: "staff", label: "Staff & counter", financial: true },
    { id: "shrinkage", label: "Shrinkage", financial: false },
    { id: "dead-stock", label: "Dead stock", financial: true },
    { id: "margin", label: "Margin erosion", financial: true },
    { id: "accuracy", label: "Stock accuracy", financial: false },
    { id: "trading", label: "Busy hours", financial: false },
  ].filter((t) => !t.financial || financial) as { id: Tab; label: string; financial: boolean }[];

  return (
    <>
      <PageHead
        title="Insights"
        subtitle="Derived from what your staff already record — nothing here needs extra data entry"
      />

      <div className="filters">
        <Field label="From">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Location">
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">All my locations</option>
            {(locations.data ?? [])
              .filter((l) => l.isPhysical && !l.isSystem)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </select>
        </Field>
      </div>

      <div className="tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? "active" : ""}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* -------------------------------------------------------- suppliers */}
      {tab === "suppliers" ? (
        <Card
          title="Supplier scorecard"
          actions={<span className="small muted">On time, in full, at the agreed price</span>}
          flush
        >
          <QueryState
            query={suppliers}
            empty={<Empty title="No deliveries in this period" />}
          >
            <Table
              head={
                <tr>
                  <th>Supplier</th>
                  <th className="num">Deliveries</th>
                  <th className="num">On time</th>
                  <th className="num">Short lines</th>
                  <th className="num">Avg lead</th>
                  <th className="num">Price variance</th>
                </tr>
              }
            >
              {(suppliers.data ?? []).map((row) => {
                const overcharged = Number(row.priceVariance) > 0;
                const onTime = Number(row.onTimePercent);
                return (
                  <tr key={row.supplierId}>
                    <td>
                      {row.supplierName}
                      <span className="sub">{row.ordersPlaced} orders</span>
                    </td>
                    <td className="num">{row.deliveries}</td>
                    <td className="num">
                      {row.onTimePercent === "—" ? (
                        <span className="muted">—</span>
                      ) : (
                        <Badge tone={onTime >= 90 ? "success" : onTime >= 70 ? "warn" : "danger"}>
                          {row.onTimePercent}%
                        </Badge>
                      )}
                      {row.lateDeliveries > 0 ? (
                        <span className="sub">{row.lateDeliveries} late</span>
                      ) : null}
                    </td>
                    <td className="num">
                      {row.shortLines > 0 ? (
                        <Badge tone="warn">
                          {row.shortLines} ({row.shortPercent}%)
                        </Badge>
                      ) : (
                        <span className="muted">none</span>
                      )}
                    </td>
                    <td className="num muted">{row.avgLeadDays} d</td>
                    <td className="num">
                      {/* Positive means they invoiced above the agreed price. */}
                      <span style={{ color: overcharged ? "var(--danger)" : undefined }}>
                        {money(row.priceVariance)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </Table>
          </QueryState>
          <div className="card-body">
            <p className="small muted">
              Price variance compares what was invoiced against the price agreed on the purchase
              order, per unit. A positive figure means you paid more than you ordered at.
            </p>
          </div>
        </Card>
      ) : null}

      {/* ------------------------------------------------------------ staff */}
      {tab === "staff" ? (
        <Card title="Staff and counter" flush>
          <QueryState query={staff} empty={<Empty title="No sales in this period" />}>
            <Table
              head={
                <tr>
                  <th>Person</th>
                  <th className="num">Bills</th>
                  <th className="num">Revenue</th>
                  <th className="num">Margin</th>
                  <th className="num">Avg bill</th>
                  <th className="num">Discounts</th>
                  <th className="num">Returns</th>
                  <th className="num">Till variance</th>
                </tr>
              }
            >
              {(staff.data ?? []).map((row) => {
                const variance = Number(row.totalCashVariance);
                return (
                  <tr key={row.userId}>
                    <td>{row.name}</td>
                    <td className="num">{row.bills}</td>
                    <td className="num">{money(row.revenue)}</td>
                    <td className="num">{money(row.margin)}</td>
                    <td className="num muted">{money(row.avgBillValue)}</td>
                    <td className="num">
                      {Number(row.discountGiven) > 0 ? money(row.discountGiven) : "—"}
                    </td>
                    <td className="num">
                      {row.returnsProcessed > 0 ? (
                        <>
                          {row.returnsProcessed}
                          <span className="sub">{money(row.returnValue)}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="num">
                      {row.shiftsClosed === 0 ? (
                        <span className="muted">—</span>
                      ) : (
                        <>
                          <span style={{ color: variance !== 0 ? "var(--danger)" : undefined }}>
                            {money(row.totalCashVariance)}
                          </span>
                          <span className="sub">{row.shiftsClosed} shifts</span>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </Table>
          </QueryState>
        </Card>
      ) : null}

      {/* -------------------------------------------------------- shrinkage */}
      {tab === "shrinkage" ? (
        <Card title="Shrinkage by reason" flush>
          <QueryState
            query={shrink}
            empty={<Empty title="No stock written off" hint="Nothing has been lost, damaged or expired in this period." />}
          >
            <Table
              head={
                <tr>
                  <th>Reason</th>
                  <th>Location</th>
                  <th className="num">Documents</th>
                  {financial ? <th className="num">Cost impact</th> : null}
                </tr>
              }
            >
              {(shrink.data ?? []).map((row) => (
                <tr key={`${row.reason}-${row.locationId}`}>
                  <td>
                    <Badge tone={row.reason === "found" ? "success" : "warn"}>
                      {humanise(row.reason)}
                    </Badge>
                  </td>
                  <td className="small">{row.locationName}</td>
                  <td className="num">{row.documents}</td>
                  {financial ? <td className="num">{money(row.costImpact)}</td> : null}
                </tr>
              ))}
            </Table>
          </QueryState>
          <div className="card-body">
            <p className="small muted">
              Grouped by reason on purpose: damage, theft and expiry are three different problems
              with three different fixes, and a single shrinkage figure hides which one you have.
            </p>
          </div>
        </Card>
      ) : null}

      {/* ------------------------------------------------------- dead stock */}
      {tab === "dead-stock" ? (
        <Card
          title="Dead and slow-moving stock"
          actions={
            <Field label="Not sold in">
              <select value={idleDays} onChange={(e) => setIdleDays(Number(e.target.value))}>
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
                <option value={90}>90 days</option>
                <option value={180}>180 days</option>
                <option value={365}>1 year</option>
              </select>
            </Field>
          }
          flush
        >
          <QueryState
            query={dead}
            empty={<Empty title="Everything is moving" hint="No stock has been idle this long." />}
          >
            <Table
              head={
                <tr>
                  <th>Item</th>
                  <th>Location</th>
                  <th className="num">On hand</th>
                  <th className="num">Money tied up</th>
                  <th>Last sold</th>
                </tr>
              }
            >
              {(dead.data ?? []).map((row) => (
                <tr key={`${row.variantId}-${row.locationName}`}>
                  <td>
                    {row.sku}
                    <span className="sub">{row.productName}</span>
                  </td>
                  <td className="small">{row.locationName}</td>
                  <td className="num">{qty(row.onHand)}</td>
                  <td className="num">
                    <strong>{money(row.stockValue)}</strong>
                  </td>
                  <td>
                    {row.lastSoldAt ? (
                      <>
                        {date(row.lastSoldAt)}
                        <span className="sub">{row.daysSinceSale} days ago</span>
                      </>
                    ) : (
                      <Badge tone="danger">Never sold</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          </QueryState>
          <div className="card-body">
            <p className="small muted">
              Measured on SALES, not movement — a transfer between your own locations is not
              someone wanting the item, and counting it would hide exactly what this is for.
            </p>
          </div>
        </Card>
      ) : null}

      {/* ---------------------------------------------------- margin erosion */}
      {tab === "margin" ? (
        <Card title="Margin erosion" flush>
          <QueryState
            query={margin}
            empty={
              <Empty
                title="No margin erosion detected"
                hint="No product has had its cost rise without a price review."
              />
            }
          >
            <Table
              head={
                <tr>
                  <th>Item</th>
                  <th className="num">Selling price</th>
                  <th className="num">Previous cost</th>
                  <th className="num">Latest cost</th>
                  <th className="num">Increase</th>
                  <th className="num">Margin now</th>
                  <th>Price last set</th>
                </tr>
              }
            >
              {(margin.data ?? []).map((row) => {
                const marginPercent = Number(row.currentMarginPercent);
                return (
                  <tr key={row.variantId}>
                    <td>
                      {row.sku}
                      <span className="sub">{row.productName}</span>
                    </td>
                    <td className="num">{money(row.currentPrice)}</td>
                    <td className="num muted">{money(row.previousCost)}</td>
                    <td className="num">{money(row.latestCost)}</td>
                    <td className="num">
                      <Badge tone="warn">+{money(row.costIncrease)}</Badge>
                    </td>
                    <td className="num">
                      <Badge
                        tone={marginPercent < 0 ? "danger" : marginPercent < 10 ? "warn" : "neutral"}
                      >
                        {row.currentMarginPercent}%
                      </Badge>
                    </td>
                    <td className="small muted">{date(row.priceSetAt)}</td>
                  </tr>
                );
              })}
            </Table>
          </QueryState>
          <div className="card-body">
            <p className="small muted">
              These are items where your cost went up but the selling price has not been reviewed
              since. Nothing errors when this happens — it is how margin dies quietly.
            </p>
          </div>
        </Card>
      ) : null}

      {/* ------------------------------------------------------ accuracy */}
      {tab === "accuracy" ? (
        <Card title="Stock accuracy" flush>
          <QueryState
            query={accuracy}
            empty={
              <Empty
                title="No counts posted"
                hint="Run a stock count to find out how closely the records match the shelf."
              />
            }
          >
            <Table
              head={
                <tr>
                  <th>Count</th>
                  <th>Location</th>
                  <th>Posted</th>
                  <th className="num">Lines</th>
                  <th className="num">Exact</th>
                  <th className="num">Accuracy</th>
                  {financial ? <th className="num">Value wrong by</th> : null}
                </tr>
              }
            >
              {(accuracy.data ?? []).map((row) => {
                const pct = Number(row.accuracyPercent);
                return (
                  <tr key={row.countId}>
                    <td>{row.countNumber}</td>
                    <td className="small">{row.locationName}</td>
                    <td className="small">{date(row.postedAt)}</td>
                    <td className="num">{row.linesCounted}</td>
                    <td className="num">{row.linesExact}</td>
                    <td className="num">
                      <Badge tone={pct >= 98 ? "success" : pct >= 90 ? "warn" : "danger"}>
                        {row.accuracyPercent}%
                      </Badge>
                    </td>
                    {financial ? (
                      <td className="num">
                        {money(row.absVarianceCost)}
                        <span className="sub">net {money(row.netVarianceCost)}</span>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </Table>
          </QueryState>
          <div className="card-body">
            <p className="small muted">
              "Value wrong by" is the absolute variance — a shortage in one place and a surplus in
              another cancel out in the net figure, which flatters the result.
            </p>
          </div>
        </Card>
      ) : null}

      {/* -------------------------------------------------------- trading */}
      {tab === "trading" ? (
        <Card title="When the shop is busy" flush>
          <QueryState query={trading} empty={<Empty title="No sales in this period" />}>
            <Table
              head={
                <tr>
                  <th>Hour</th>
                  <th className="num">Bills</th>
                  <th className="num">Revenue</th>
                  <th className="num">Avg bill</th>
                  <th style={{ width: "40%" }}>Share</th>
                </tr>
              }
            >
              {(() => {
                const rows = trading.data ?? [];
                const peak = Math.max(1, ...rows.map((r) => r.bills));
                return rows.map((row) => (
                  <tr key={row.hour}>
                    <td className="nowrap">
                      {String(row.hour).padStart(2, "0")}:00–{String(row.hour + 1).padStart(2, "0")}:00
                    </td>
                    <td className="num">{row.bills}</td>
                    <td className="num">{money(row.revenue)}</td>
                    <td className="num muted">{money(row.avgBill)}</td>
                    <td>
                      {/* A plain proportional bar reads faster than a number here. */}
                      <div
                        style={{
                          height: "0.6rem",
                          borderRadius: "3px",
                          background: "var(--accent)",
                          width: `${(row.bills / peak) * 100}%`,
                          minWidth: "2px",
                        }}
                        aria-label={`${row.bills} bills`}
                      />
                    </td>
                  </tr>
                ));
              })()}
            </Table>
          </QueryState>
          <div className="card-body">
            <p className="small muted">Useful for deciding when you need a second person on the till.</p>
          </div>
        </Card>
      ) : null}
    </>
  );
}
