import { useNavigate } from "react-router-dom";
import { useApi, useApiMutation } from "../../lib/hooks";
import { useSessionContext } from "../../lib/session";
import { Badge, Card, Empty, ErrorBanner, QueryState, Table } from "../../components/ui";
import { date, money, qty } from "../../lib/format";

interface CycleRow {
  variantId: string;
  sku: string;
  productName: string;
  abcClass: "A" | "B" | "C";
  valueShare: string;
  onHand: string;
  stockValue: string;
  lastCountedAt: string | null;
  daysSinceCount: number | null;
  cadenceDays: number;
  daysOverdue: number | null;
  reason: "never_counted" | "overdue" | "due_soon";
}

interface Health {
  locationName: string;
  byClass: {
    abcClass: "A" | "B" | "C";
    cadenceDays: number;
    skus: number;
    withinCadence: number;
    overdue: number;
    neverCounted: number;
    stockValue: string;
  }[];
  totalSkus: number;
  totalValue: string;
  valueWithinCadence: string;
  coveragePercent: string;
}

const CLASS_TONE = { A: "danger", B: "warn", C: "neutral" } as const;

const REASON = {
  never_counted: { tone: "danger" as const, label: "Never counted" },
  overdue: { tone: "warn" as const, label: "Overdue" },
  due_soon: { tone: "success" as const, label: "Within cadence" },
};

/**
 * Cycle counting — a few lines every day instead of closing the shop once a year.
 *
 * An annual stock take shuts the shop, is counted badly under time pressure, and
 * finds errors up to twelve months old with no way to trace their cause.
 * Counting twenty lines a day finds the same errors while they are days old and
 * still explicable.
 *
 * ABC classes are worked out from sales value — nobody maintains them by hand.
 */
export function CycleCountPanel() {
  const navigate = useNavigate();
  const { can, activeLocation } = useSessionContext();
  const locationId = activeLocation?.id;

  const due = useApi<CycleRow[]>(
    ["counts", "cycle-due", locationId],
    "/stock-counts/cycle/due",
    { locationId: locationId!, includeNotDue: true },
    { enabled: Boolean(locationId) },
  );

  const health = useApi<Health>(
    ["counts", "cycle-health", locationId],
    "/stock-counts/cycle/health",
    { locationId: locationId! },
    { enabled: Boolean(locationId) },
  );

  const generate = useApiMutation<Record<string, unknown>, { id: string; lineCount: number }>(
    "/stock-counts/cycle/generate",
    {
      method: "POST",
      idempotent: true,
      invalidate: [["counts"]],
      onSuccess: (result) => navigate(`/counts/${result.id}`),
    },
  );

  if (!locationId) {
    return (
      <Card title="Cycle counting">
        <Empty
          title="No working location"
          hint="Choose the store or warehouse you are counting at."
        />
      </Card>
    );
  }

  const needsCounting = (due.data ?? []).filter((row) => row.reason !== "due_soon");
  const coverage = Number(health.data?.coveragePercent ?? 0);

  return (
    <>
      {health.data ? (
        <div className="grid cols-4 mb">
          <Card>
            <div className="stat">
              <div className="label">Stock verified</div>
              <div className="value">{health.data.coveragePercent}%</div>
              <div className="hint">
                {/* By VALUE, not line count: counting a hundred cheap items
                    while the expensive ones go unchecked looks like progress
                    and is not. */}
                of stock <em>value</em> counted within its cadence
              </div>
            </div>
          </Card>
          <Card>
            <div className="stat">
              <div className="label">Due today</div>
              <div className="value">{needsCounting.length}</div>
              <div className="hint">
                {needsCounting.filter((r) => r.reason === "never_counted").length} never counted
              </div>
            </div>
          </Card>
          <Card>
            <div className="stat">
              <div className="label">SKUs held here</div>
              <div className="value">{health.data.totalSkus}</div>
            </div>
          </Card>
          {can("report:financial") ? (
            <Card>
              <div className="stat">
                <div className="label">Stock value</div>
                <div className="value">{money(health.data.totalValue)}</div>
                <div className="hint">{money(health.data.valueWithinCadence)} verified</div>
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}

      {coverage < 50 && health.data ? (
        <div className="alert warn">
          Less than half your stock value has been verified within its cadence. Counting a handful
          of lines a day closes that gap without ever shutting the shop.
        </div>
      ) : null}

      <ErrorBanner error={generate.error} />

      <Card
        title="What to count today"
        actions={
          can("stock:count") ? (
            <button
              type="button"
              className="primary"
              disabled={needsCounting.length === 0 || generate.isPending}
              onClick={() => generate.mutate({ locationId, windowDays: 90 })}
            >
              {generate.isPending ? "Preparing..." : "Generate today's sheet"}
            </button>
          ) : null
        }
        flush
      >
        <QueryState
          query={due}
          empty={<Empty title="Nothing held here" hint="There is no stock at this location." />}
        >
          <Table
            head={
              <tr>
                <th>Item</th>
                <th>Class</th>
                <th className="num">Share of sales</th>
                <th className="num">On hand</th>
                {can("report:financial") ? <th className="num">Value</th> : null}
                <th>Last counted</th>
                <th>Status</th>
              </tr>
            }
          >
            {(due.data ?? []).map((row) => (
              <tr key={row.variantId}>
                <td>
                  {row.sku}
                  <span className="sub">{row.productName}</span>
                </td>
                <td>
                  <Badge tone={CLASS_TONE[row.abcClass]}>{row.abcClass}</Badge>
                  <span className="sub">every {row.cadenceDays}d</span>
                </td>
                <td className="num muted">{row.valueShare}%</td>
                <td className="num">{qty(row.onHand)}</td>
                {can("report:financial") ? (
                  <td className="num">{money(row.stockValue)}</td>
                ) : null}
                <td className="small">
                  {row.lastCountedAt ? (
                    <>
                      {date(row.lastCountedAt)}
                      <span className="sub">{row.daysSinceCount} days ago</span>
                    </>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  <Badge tone={REASON[row.reason].tone}>{REASON[row.reason].label}</Badge>
                  {row.daysOverdue !== null && row.daysOverdue > 0 ? (
                    <span className="sub">{row.daysOverdue}d over</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </Table>
        </QueryState>

        <div className="card-body">
          <p className="small muted">
            Classes come from each item's share of sales value, worked out automatically —
            <strong> A</strong> is the fast-moving money and is checked most often,
            <strong> C</strong> is the long tail. Items never counted come first, then the most
            overdue, then the highest value at risk.
          </p>
        </div>
      </Card>

      {health.data ? (
        <Card title="Coverage by class" flush>
          <Table
            head={
              <tr>
                <th>Class</th>
                <th className="num">Every</th>
                <th className="num">SKUs</th>
                <th className="num">Within cadence</th>
                <th className="num">Overdue</th>
                <th className="num">Never counted</th>
                {can("report:financial") ? <th className="num">Value</th> : null}
              </tr>
            }
          >
            {health.data.byClass.map((row) => (
              <tr key={row.abcClass}>
                <td>
                  <Badge tone={CLASS_TONE[row.abcClass]}>{row.abcClass}</Badge>
                </td>
                <td className="num muted">{row.cadenceDays}d</td>
                <td className="num">{row.skus}</td>
                <td className="num">{row.withinCadence}</td>
                <td className="num">
                  {row.overdue > 0 ? <Badge tone="warn">{row.overdue}</Badge> : "—"}
                </td>
                <td className="num">
                  {row.neverCounted > 0 ? <Badge tone="danger">{row.neverCounted}</Badge> : "—"}
                </td>
                {can("report:financial") ? (
                  <td className="num">{money(row.stockValue)}</td>
                ) : null}
              </tr>
            ))}
          </Table>
        </Card>
      ) : null}
    </>
  );
}
