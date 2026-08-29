import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi, useApiMutation } from "../../lib/hooks";
import { useSessionContext } from "../../lib/session";
import {
  Badge,
  Card,
  Empty,
  ErrorBanner,
  Field,
  PageHead,
  QueryState,
  Table,
} from "../../components/ui";
import { money, multiplyMoney, qty, sumMoney } from "../../lib/format";
import type { Location } from "../../lib/types";

interface ReplenishmentRow {
  variantId: string;
  sku: string;
  productName: string;
  stockUomCode: string;
  locationId: string;
  locationName: string;
  onHand: string;
  available: string;
  onOrder: string;
  dailyVelocity: string;
  daysOfCover: string | null;
  leadTimeDays: number;
  reorderPoint: string;
  reorderPointSource: "computed" | "manual";
  suggestedQty: string;
  preferredSupplierId: string | null;
  preferredSupplierName: string | null;
  supplierSource: "preferred" | "last_purchase" | "none";
  lastCost: string | null;
  urgency: "out_of_stock" | "below_point" | "approaching" | "ok";
}

interface DraftPo {
  supplierId: string;
  supplierName: string;
  leadTimeDays: number;
  destinationLocationId: string;
  destinationName: string;
  lines: {
    variantId: string;
    sku: string;
    productName: string;
    stockUomId: string;
    stockUomCode: string;
    suggestedQty: string;
    lastCost: string | null;
    urgency: ReplenishmentRow["urgency"];
  }[];
}

const URGENCY: Record<ReplenishmentRow["urgency"], { tone: "danger" | "warn" | "info" | "success"; label: string }> = {
  out_of_stock: { tone: "danger", label: "Out of stock" },
  below_point: { tone: "warn", label: "Below reorder point" },
  approaching: { tone: "info", label: "Getting low" },
  ok: { tone: "success", label: "Healthy" },
};

/**
 * What to reorder.
 *
 * Nobody types a reorder point. It is worked out per SKU per location from real
 * sales velocity and the supplier's lead time, and a manual override still wins
 * where someone knows better. Quantities already on a purchase order are
 * subtracted, so nothing is ordered twice.
 */
export function Replenishment() {
  const { can, activeLocation } = useSessionContext();
  const [locationId, setLocationId] = useState(activeLocation?.id ?? "");
  const [windowDays, setWindowDays] = useState(90);
  const [coverDays, setCoverDays] = useState(30);
  const [safetyDays, setSafetyDays] = useState(7);
  const [includeHealthy, setIncludeHealthy] = useState(false);

  const params = { locationId: locationId || undefined, windowDays, coverDays, safetyDays };

  const locations = useApi<Location[]>(["locations"], "/locations");
  const plan = useApi<ReplenishmentRow[]>(["insights", "replenishment"], "/insights/replenishment", {
    ...params,
    includeHealthy,
  });
  const drafts = useApi<{ drafts: DraftPo[]; unassigned: ReplenishmentRow[] }>(
    ["insights", "replenishment-drafts"],
    "/insights/replenishment/drafts",
    params,
    { enabled: can("po:write") },
  );

  const needsOrdering = (plan.data ?? []).filter((r) => r.urgency !== "ok");

  return (
    <>
      <PageHead
        title="What to reorder"
        subtitle="Worked out from what actually sold — no reorder points to maintain by hand"
      />

      <div className="filters">
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
        <Field label="Sales history" help="Averaged over this window.">
          <select value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))}>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={180}>Last 6 months</option>
            <option value={365}>Last year</option>
          </select>
        </Field>
        <Field label="Order should last" help="How long the delivery must cover.">
          <select value={coverDays} onChange={(e) => setCoverDays(Number(e.target.value))}>
            <option value={14}>2 weeks</option>
            <option value={30}>1 month</option>
            <option value={60}>2 months</option>
            <option value={90}>3 months</option>
          </select>
        </Field>
        <Field label="Safety buffer" help="On top of the supplier's lead time.">
          <select value={safetyDays} onChange={(e) => setSafetyDays(Number(e.target.value))}>
            <option value={0}>None</option>
            <option value={3}>3 days</option>
            <option value={7}>1 week</option>
            <option value={14}>2 weeks</option>
          </select>
        </Field>
        <Field label=" ">
          <label className="row small">
            <input
              type="checkbox"
              checked={includeHealthy}
              onChange={(e) => setIncludeHealthy(e.target.checked)}
            />
            Show items that are fine
          </label>
        </Field>
      </div>

      {can("po:write") && (drafts.data?.drafts.length ?? 0) > 0 ? (
        <Card
          title="Ready to order"
          actions={<span className="small muted">Grouped by supplier — review, then raise</span>}
        >
          <div className="grid cols-2">
            {(drafts.data?.drafts ?? []).map((draft) => (
              <DraftCard key={`${draft.supplierId}:${draft.destinationLocationId}`} draft={draft} />
            ))}
          </div>
          {(drafts.data?.unassigned.length ?? 0) > 0 ? (
            <p className="small muted mt">
              {drafts.data!.unassigned.length} item(s) need ordering but have never been bought from
              anyone, so no supplier could be inferred. They are listed below.
            </p>
          ) : null}
        </Card>
      ) : null}

      <Card
        title={`Replenishment plan${needsOrdering.length ? ` — ${needsOrdering.length} need attention` : ""}`}
        flush
      >
        <QueryState
          query={plan}
          empty={
            <Empty
              title="Nothing needs ordering"
              hint="Every item is above its reorder point. Tick “show items that are fine” to see them all."
            />
          }
        >
          <Table
            head={
              <tr>
                <th>Item</th>
                <th>Location</th>
                <th className="num">Available</th>
                <th className="num">On order</th>
                <th className="num">Sells/day</th>
                <th className="num">Cover</th>
                <th className="num">Reorder at</th>
                <th className="num">Order</th>
                <th>Supplier</th>
                <th>Status</th>
              </tr>
            }
          >
            {(plan.data ?? []).map((row) => (
              <tr key={`${row.variantId}-${row.locationId}`}>
                <td>
                  {row.sku}
                  <span className="sub">{row.productName}</span>
                </td>
                <td className="small">{row.locationName}</td>
                <td className="num">
                  {qty(row.available)} <span className="muted small">{row.stockUomCode}</span>
                </td>
                <td className="num muted">
                  {Number(row.onOrder) > 0 ? qty(row.onOrder) : "—"}
                </td>
                <td className="num muted">{qty(row.dailyVelocity)}</td>
                <td className="num">
                  {row.daysOfCover === null ? (
                    <span className="muted">not selling</span>
                  ) : (
                    <span
                      style={{
                        color:
                          Number(row.daysOfCover) < row.leadTimeDays ? "var(--danger)" : undefined,
                      }}
                    >
                      {qty(row.daysOfCover)} d
                    </span>
                  )}
                </td>
                <td className="num">
                  {qty(row.reorderPoint)}
                  <span className="sub">
                    {row.reorderPointSource === "computed" ? "computed" : "set by hand"}
                  </span>
                </td>
                <td className="num">
                  {Number(row.suggestedQty) > 0 ? (
                    <strong>{qty(row.suggestedQty)}</strong>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td className="small">
                  {row.preferredSupplierName ?? <span className="muted">unknown</span>}
                  {row.supplierSource === "last_purchase" ? (
                    <span className="sub">from last purchase</span>
                  ) : null}
                </td>
                <td>
                  <Badge tone={URGENCY[row.urgency].tone}>{URGENCY[row.urgency].label}</Badge>
                </td>
              </tr>
            ))}
          </Table>
        </QueryState>

        <div className="card-body">
          <p className="small muted">
            Reorder point = average daily sales × (supplier lead time + safety buffer). The
            suggested quantity also covers the period above, less anything already on order.
          </p>
        </div>
      </Card>
    </>
  );
}

/**
 * One supplier's draft, raised as a real purchase order on confirmation.
 *
 * The buyer edits quantities and costs here rather than composing an order from
 * a blank form — which is where most of the data entry in purchasing goes.
 */
function DraftCard({ draft }: { draft: DraftPo }) {
  const navigate = useNavigate();
  const [lines, setLines] = useState(
    draft.lines.map((line) => ({
      ...line,
      qty: line.suggestedQty,
      cost: line.lastCost ?? "0",
      include: true,
    })),
  );

  const create = useApiMutation<Record<string, unknown>, { id: string }>("/purchase-orders", {
    method: "POST",
    idempotent: true,
    invalidate: [["purchase-orders"], ["insights"]],
    onSuccess: (result) => navigate(`/purchase-orders/${result.id}`),
  });

  const included = lines.filter((l) => l.include && Number(l.qty) > 0);
  const total = sumMoney(included.map((l) => multiplyMoney(l.cost, l.qty)));

  function raise() {
    create.mutate({
      supplierId: draft.supplierId,
      destinationLocationId: draft.destinationLocationId,
      notes: `Raised from the replenishment plan for ${draft.destinationName}.`,
      lines: included.map((line) => ({
        variantId: line.variantId,
        // The suggested quantity is in the product's own stock unit, so the
        // order is raised in that unit. Converting to a case or a kilo here
        // would mean inventing a pack size the plan never used.
        orderUomId: line.stockUomId,
        orderQty: line.qty,
        unitCost: line.cost,
      })),
    });
  }

  return (
    <Card
      title={draft.supplierName}
      actions={<Badge tone="info">{draft.destinationName}</Badge>}
    >
      <ErrorBanner error={create.error} />

      <Table
        head={
          <tr>
            <th />
            <th>Item</th>
            <th className="num">Qty</th>
            <th className="num">Cost</th>
          </tr>
        }
      >
        {lines.map((line, index) => (
          <tr key={line.variantId}>
            <td>
              <input
                type="checkbox"
                checked={line.include}
                aria-label={`Include ${line.sku}`}
                onChange={(e) =>
                  setLines((c) =>
                    c.map((l, i) => (i === index ? { ...l, include: e.target.checked } : l)),
                  )
                }
              />
            </td>
            <td>
              {line.sku}
              <span className="sub">
                <Badge tone={URGENCY[line.urgency].tone}>{URGENCY[line.urgency].label}</Badge>
              </span>
            </td>
            <td>
              <input
                className="num"
                inputMode="decimal"
                value={line.qty}
                onChange={(e) =>
                  setLines((c) => c.map((l, i) => (i === index ? { ...l, qty: e.target.value } : l)))
                }
              />
            </td>
            <td>
              <input
                className="num"
                inputMode="decimal"
                value={line.cost}
                onChange={(e) =>
                  setLines((c) =>
                    c.map((l, i) => (i === index ? { ...l, cost: e.target.value } : l)),
                  )
                }
              />
            </td>
          </tr>
        ))}
      </Table>

      <div className="spread mt">
        <strong className="num">{money(total)}</strong>
        <button
          type="button"
          className="primary"
          disabled={included.length === 0 || create.isPending}
          onClick={raise}
        >
          {create.isPending ? "Raising..." : `Raise order (${included.length} lines)`}
        </button>
      </div>
      <p className="small muted mt">
        Lead time {draft.leadTimeDays} days. Saved as a draft — it still needs approving before it
        goes to the supplier.
      </p>
    </Card>
  );
}
