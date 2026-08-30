import { BarChart3, Boxes, IndianRupee, PackageMinus, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { useApi } from "../../lib/hooks";
import { useSessionContext } from "../../lib/session";
import { Card, Empty, Field, PageHead, QueryState, Stat, Table } from "../../components/ui";
import {
  CategoryChart,
  ChartLegend,
  Delta,
  TrendChart,
  useChartPalette,
} from "../../components/charts";
import { Segmented } from "../../components/filters";
import { SkeletonStats } from "../../components/feedback";
import {
  date,
  dateShort,
  humanise,
  money,
  moneyCompact,
  qty,
  toDateInput,
} from "../../lib/format";
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
/**
 * The ranges anybody actually asks for.
 *
 * "Custom" is kept, because month-to-date is not the same question as "the
 * fortnight the promotion ran". But four of the five reports anyone opens are
 * one of these, and each was previously two date-picker interactions and a
 * mental arithmetic problem about how many days ago Monday was.
 */
type Preset = "7d" | "30d" | "mtd" | "90d" | "custom";

const PRESETS: { value: Preset; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "mtd", label: "This month" },
  { value: "90d", label: "90 days" },
  { value: "custom", label: "Custom" },
];

function presetRange(preset: Preset): { from: string; to: string } | null {
  if (preset === "custom") return null;
  const today = new Date();
  if (preset === "mtd") {
    return {
      from: toDateInput(new Date(today.getFullYear(), today.getMonth(), 1)),
      to: toDateInput(today),
    };
  }
  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
  const start = new Date(today);
  // Inclusive of today, so "7 days" is a week and not eight of them.
  start.setDate(start.getDate() - (days - 1));
  return { from: toDateInput(start), to: toDateInput(today) };
}

/**
 * The equal-length window immediately before the selected one.
 *
 * A revenue figure on its own is a number; the same figure against the previous
 * thirty days is a direction, and direction is what somebody opens this screen
 * to find out. Aligned so no day is counted twice and none is skipped.
 */
function previousRange(from: string, to: string): { from: string; to: string } | null {
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  const spanDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (spanDays < 1) return null;

  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (spanDays - 1));

  return { from: toDateInput(prevStart), to: toDateInput(prevEnd) };
}

function sumSales(rows: SalesSummaryRow[]) {
  return rows.reduce(
    (acc, row) => ({
      revenue: acc.revenue + Number(row.revenue),
      cost: acc.cost + Number(row.cost),
      margin: acc.margin + Number(row.margin),
      orders: acc.orders + row.orders,
    }),
    { revenue: 0, cost: 0, margin: 0, orders: 0 },
  );
}

export function Reports() {
  const { can } = useSessionContext();
  const palette = useChartPalette();

  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const [preset, setPreset] = useState<Preset>("mtd");
  const [from, setFrom] = useState(toDateInput(monthStart));
  const [to, setTo] = useState(toDateInput(today));
  const [locationId, setLocationId] = useState("");

  function choosePreset(next: Preset) {
    setPreset(next);
    const range = presetRange(next);
    if (range) {
      setFrom(range.from);
      setTo(range.to);
    }
  }

  // Typing a date by hand is choosing a custom range, whatever chip was lit.
  function setCustomFrom(value: string) {
    setPreset("custom");
    setFrom(value);
  }
  function setCustomTo(value: string) {
    setPreset("custom");
    setTo(value);
  }

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

  /*
   * The same query over the preceding window, purely so every figure above can
   * say which way it is moving. Cheap — it is the same endpoint and TanStack
   * caches it under its own key — and only fetched for people who may see money
   * at all.
   */
  const comparison = previousRange(from, to);
  const previous = useApi<SalesSummaryRow[]>(
    ["reports", "sales-summary", "previous"],
    "/reports/sales-summary",
    { from: comparison?.from, to: comparison?.to, locationId: locationId || undefined },
    { enabled: financial && Boolean(comparison) },
  );

  const totals = sumSales(summary.data ?? []);
  const priorTotals = previous.data ? sumSales(previous.data) : null;

  /*
   * Recharts wants numbers; the API sends `numeric` columns as strings, because
   * parsing them to floats is exactly what the backend avoids doing. Parsing
   * here is safe and necessary — this copy is only ever drawn, never sent back,
   * and the table below still renders the untouched strings.
   */
  const salesTrend = useMemo(
    () =>
      (summary.data ?? []).map((row) => ({
        day: row.day,
        revenue: Number(row.revenue),
        margin: Number(row.margin),
      })),
    [summary.data],
  );

  const paymentMix = useMemo(
    () =>
      (payments.data ?? []).map((row) => ({
        method: humanise(row.method),
        amount: Number(row.amount),
      })),
    [payments.data],
  );

  const locationMix = useMemo(
    () =>
      (byLocation.data ?? []).map((row) => ({
        name: row.name,
        revenue: Number(row.revenue),
      })),
    [byLocation.data],
  );

  const trendSeries = [
    { key: "revenue", label: "Revenue", color: palette["--series-1"] },
    { key: "margin", label: "Margin", color: palette["--series-3"] },
  ];

  return (
    <>
      <PageHead title="Reports" subtitle="Scoped to the locations you are assigned to" />

      <div className="filters">
        <Segmented label="Period" value={preset} options={PRESETS} onChange={choosePreset} />
        <Field label="From">
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setCustomFrom(e.target.value)}
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setCustomTo(e.target.value)}
          />
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
            <Stat
              icon={<IndianRupee size={13} aria-hidden />}
              tone="info"
              label="Revenue"
              value={money(totals.revenue)}
              trailing={<Delta value={totals.revenue} previous={priorTotals?.revenue} />}
              hint={`${totals.orders} bills`}
            />
          </Card>
          <Card>
            <Stat
              icon={<PackageMinus size={13} aria-hidden />}
              label="Cost of goods"
              value={money(totals.cost)}
              hint="From the batches actually sold"
            />
          </Card>
          <Card>
            <Stat
              icon={<TrendingUp size={13} aria-hidden />}
              tone="good"
              label="Gross margin"
              value={money(totals.margin)}
              trailing={<Delta value={totals.margin} previous={priorTotals?.margin} />}
              hint={
                totals.revenue > 0
                  ? `${((totals.margin / totals.revenue) * 100).toFixed(1)}% of revenue`
                  : undefined
              }
            />
          </Card>
          <Card>
            <Stat
              icon={<Boxes size={13} aria-hidden />}
              label="Stock value"
              value={money(
                (valuation.data?.byLocation ?? []).reduce(
                  (sum, row) => sum + Number(row.totalValue),
                  0,
                ),
              )}
              hint="At batch cost, right now"
            />
          </Card>
        </div>
      ) : null}

      {/*
        * The shape first, the figures under it.
        *
        * The table below is unchanged and still authoritative — a shopkeeper
        * reconciling a day needs the exact paisa, and a number in a chart cannot
        * be copied into a spreadsheet or read down a phone. What the table could
        * never answer without being read row by row is "which way is this
        * going", which is the question somebody opens this screen holding.
        */}
      {financial ? (
        <Card
          title="Sales by day"
          actions={<ChartLegend series={trendSeries} />}
          flush
        >
          <QueryState
            query={summary}
            empty={<Empty icon={<BarChart3 size={14} aria-hidden />} title="No sales in this period" />}
          >
            {/* Two points is a line segment, not a trend; below that the table
                says it better on its own. */}
            {salesTrend.length > 2 ? (
              <TrendChart
                data={salesTrend}
                xKey="day"
                series={trendSeries}
                format={(value) => moneyCompact(value)}
                tickFormatter={dateShort}
                labelFormatter={(value) => date(value)}
                summary={`Revenue and margin per day from ${date(from)} to ${date(to)}. The same figures are in the table below.`}
              />
            ) : null}

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
              {/* Horizontal, because the categories are words. Rotated axis
                  labels are not read, they are deciphered. */}
              {paymentMix.length > 1 ? (
                <CategoryChart
                  data={paymentMix}
                  xKey="method"
                  series={[{ key: "amount", label: "Taken", color: palette["--series-1"] }]}
                  format={(value) => moneyCompact(value)}
                  size="sm"
                  horizontal
                  summary="Amount taken by payment method, listed in the table below."
                />
              ) : null}
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
              {/* One location is not a comparison, and a single bar in an empty
                  frame says less than the row beneath it. */}
              {locationMix.length > 1 ? (
                <CategoryChart
                  data={locationMix}
                  xKey="name"
                  series={[{ key: "revenue", label: "Revenue", color: palette["--series-1"] }]}
                  format={(value) => moneyCompact(value)}
                  size="sm"
                  horizontal
                  summary="Revenue by location, listed in the table below."
                />
              ) : null}
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
