import { BarChart3 } from "lucide-react";
import { useState } from "react";
import { useApi } from "../../lib/hooks";
import { useSessionContext } from "../../lib/session";
import { Card, Empty, Field, PageHead, QueryState, Table } from "../../components/ui";
import { SkeletonStats } from "../../components/feedback";
import { date, humanise, money, qty, toDateInput } from "../../lib/format";
import type {
  ExpiringBatch,
  Location,
  SalesSummaryRow,
  TopProductRow,
  Valuation,
} from "../../lib/types";

interface PaymentRow {
  method: string;
  count: number;
  amount: string;
}
interface PurchaseRow {
  supplierId: string;
  supplierName: string;
  receipts: number;
  qtyReceived: string;
  value: string;
}
interface LocationRow {
  locationId: string;
  name: string;
  orders: number;
  revenue: string;
  margin: string;
}

/**
 * Reports.
 *
 * Split by the two permissions the backend enforces: `report:operational`
 * covers volume and movement — what sold, what is running out — while
 * `report:financial` covers money and margin. A store manager needs the first
 * to run a shop; the second tells them what the business earns, which is not
 * automatically theirs to see.
 *
 * Every figure is scoped to the locations the caller is assigned to; narrowing
 * by location is possible, widening is not.
 */
export function Reports() {
  const { can } = useSessionContext();

  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const [from, setFrom] = useState(toDateInput(monthStart));
  const [to, setTo] = useState(toDateInput(today));
  const [locationId, setLocationId] = useState("");

  const range = { from, to, locationId: locationId || undefined };
  const financial = can("report:financial");

  const locations = useApi<Location[]>(["locations"], "/locations");
  const summary = useApi<SalesSummaryRow[]>(["reports", "sales-summary"], "/reports/sales-summary", range, {
    enabled: financial,
  });
  const top = useApi<TopProductRow[]>(["reports", "top-products"], "/reports/top-products", {
    ...range,
    limit: 15,
  });
  const byLocation = useApi<LocationRow[]>(
    ["reports", "sales-by-location"],
    "/reports/sales-by-location",
    range,
    { enabled: financial },
  );
  const payments = useApi<PaymentRow[]>(
    ["reports", "payments"],
    "/reports/payment-breakdown",
    range,
    { enabled: financial },
  );
  const purchases = useApi<PurchaseRow[]>(
    ["reports", "purchase-summary"],
    "/reports/purchase-summary",
    range,
    { enabled: financial },
  );
  const valuation = useApi<Valuation>(["stock", "valuation"], "/stock/valuation", {
    locationId: locationId || undefined,
  });
  const expiring = useApi<ExpiringBatch[]>(["stock", "expiring"], "/stock/expiring", {
    withinDays: 60,
    locationId: locationId || undefined,
  });

  const totals = (summary.data ?? []).reduce(
    (acc, row) => ({
      revenue: acc.revenue + Number(row.revenue),
      cost: acc.cost + Number(row.cost),
      margin: acc.margin + Number(row.margin),
      orders: acc.orders + row.orders,
    }),
    { revenue: 0, cost: 0, margin: 0, orders: 0 },
  );

  return (
    <>
      <PageHead title="Reports" subtitle="Scoped to the locations you are assigned to" />

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

      {financial && summary.isPending ? (
        <div className="mb">
          <SkeletonStats count={4} />
        </div>
      ) : null}

      {financial ? (
        <div className="grid cols-4 mb">
          <Card>
            <div className="stat">
              <div className="label">Revenue</div>
              <div className="value">{money(totals.revenue)}</div>
              <div className="hint">{totals.orders} bills</div>
            </div>
          </Card>
          <Card>
            <div className="stat">
              <div className="label">Cost of goods</div>
              <div className="value">{money(totals.cost)}</div>
              <div className="hint">From the batches actually sold</div>
            </div>
          </Card>
          <Card>
            <div className="stat">
              <div className="label">Gross margin</div>
              <div className="value">{money(totals.margin)}</div>
              <div className="hint">
                {totals.revenue > 0
                  ? `${((totals.margin / totals.revenue) * 100).toFixed(1)}%`
                  : "—"}
              </div>
            </div>
          </Card>
          <Card>
            <div className="stat">
              <div className="label">Stock value</div>
              <div className="value">
                {money(
                  (valuation.data?.byLocation ?? []).reduce(
                    (sum, row) => sum + Number(row.totalValue),
                    0,
                  ),
                )}
              </div>
              <div className="hint">At batch cost, right now</div>
            </div>
          </Card>
        </div>
      ) : null}

      {financial ? (
        <Card title="Sales by day" flush>
          <QueryState
            query={summary}
            empty={<Empty icon={<BarChart3 size={14} aria-hidden />} title="No sales in this period" />}
          >
            <Table
              head={
                <tr>
                  <th>Day</th>
                  <th className="num">Bills</th>
                  <th className="num">Revenue</th>
                  <th className="num">Discount</th>
                  <th className="num">Cost</th>
                  <th className="num">Margin</th>
                  <th className="num">Margin %</th>
                </tr>
              }
            >
              {(summary.data ?? []).map((row) => (
                <tr key={row.day}>
                  <td>{date(row.day)}</td>
                  <td className="num">{row.orders}</td>
                  <td className="num">{money(row.revenue)}</td>
                  <td className="num muted">{money(row.discount)}</td>
                  <td className="num muted">{money(row.cost)}</td>
                  <td className="num">
                    <strong>{money(row.margin)}</strong>
                  </td>
                  <td className="num">{row.marginPercent}%</td>
                </tr>
              ))}
            </Table>
          </QueryState>
        </Card>
      ) : null}

      <div className="grid cols-2">
        <Card title="Best sellers" flush>
          <QueryState query={top} empty={<Empty icon={<BarChart3 size={14} aria-hidden />} title="Nothing sold in this period" />}>
            <Table
              head={
                <tr>
                  <th>Item</th>
                  <th className="num">Qty sold</th>
                  <th className="num">Revenue</th>
                  {financial ? <th className="num">Margin</th> : null}
                </tr>
              }
            >
              {(top.data ?? []).map((row) => (
                <tr key={row.variantId}>
                  <td>
                    {row.sku}
                    <span className="sub">{row.name}</span>
                  </td>
                  <td className="num">{qty(row.qtySold)}</td>
                  <td className="num">{money(row.revenue)}</td>
                  {financial ? <td className="num">{money(row.margin ?? "0")}</td> : null}
                </tr>
              ))}
            </Table>
          </QueryState>
        </Card>

        {financial ? (
          <Card title="How customers paid" flush>
            <QueryState query={payments} empty={<Empty icon={<BarChart3 size={14} aria-hidden />} title="No payments in this period" />}>
              <Table
                head={
                  <tr>
                    <th>Method</th>
                    <th className="num">Count</th>
                    <th className="num">Amount</th>
                  </tr>
                }
              >
                {(payments.data ?? []).map((row) => (
                  <tr key={row.method}>
                    <td>{humanise(row.method)}</td>
                    <td className="num">{row.count}</td>
                    <td className="num">{money(row.amount)}</td>
                  </tr>
                ))}
              </Table>
            </QueryState>
          </Card>
        ) : null}
      </div>

      {financial ? (
        <div className="grid cols-2">
          <Card title="Sales by location" flush>
            <QueryState query={byLocation} empty={<Empty icon={<BarChart3 size={14} aria-hidden />} title="No sales in this period" />}>
              <Table
                head={
                  <tr>
                    <th>Location</th>
                    <th className="num">Bills</th>
                    <th className="num">Revenue</th>
                    <th className="num">Margin</th>
                  </tr>
                }
              >
                {(byLocation.data ?? []).map((row) => (
                  <tr key={row.locationId}>
                    <td>{row.name}</td>
                    <td className="num">{row.orders}</td>
                    <td className="num">{money(row.revenue)}</td>
                    <td className="num">{money(row.margin)}</td>
                  </tr>
                ))}
              </Table>
            </QueryState>
          </Card>

          <Card title="Purchases received, by supplier" flush>
            <QueryState
              query={purchases}
              empty={<Empty icon={<BarChart3 size={14} aria-hidden />} title="Nothing received in this period" />}
            >
              <Table
                head={
                  <tr>
                    <th>Supplier</th>
                    <th className="num">Deliveries</th>
                    <th className="num">Units</th>
                    <th className="num">Value</th>
                  </tr>
                }
              >
                {(purchases.data ?? []).map((row) => (
                  <tr key={row.supplierId}>
                    <td>{row.supplierName}</td>
                    <td className="num">{row.receipts}</td>
                    <td className="num">{qty(row.qtyReceived)}</td>
                    <td className="num">{money(row.value)}</td>
                  </tr>
                ))}
              </Table>
            </QueryState>
          </Card>
        </div>
      ) : null}

      <Card title="Expiring within 60 days" flush>
        <QueryState
          query={expiring}
          empty={<Empty icon={<BarChart3 size={14} aria-hidden />} title="Nothing expiring soon" />}
        >
          <Table
            head={
              <tr>
                <th>Item</th>
                <th>Location</th>
                <th>Batch</th>
                <th>Expires</th>
                <th className="num">On hand</th>
                {financial ? <th className="num">Value at risk</th> : null}
              </tr>
            }
          >
            {(expiring.data ?? []).map((row) => (
              <tr key={`${row.batchId}-${row.locationId}`}>
                <td>{row.sku}</td>
                <td className="small">{row.locationName}</td>
                <td className="small">{row.batchCode}</td>
                <td>{date(row.expiresOn)}</td>
                <td className="num">{qty(row.onHand)}</td>
                {financial ? <td className="num">{money(row.valueAtRisk)}</td> : null}
              </tr>
            ))}
          </Table>
        </QueryState>
      </Card>
    </>
  );
}
