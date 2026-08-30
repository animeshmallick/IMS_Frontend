import { PackageMinus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApiList } from "../../lib/hooks";
import { useSessionContext } from "../../lib/session";
import { Badge, Card, Empty, Field, PageHead, Pager, QueryState, Table } from "../../components/ui";
import { date, humanise, money, statusTone } from "../../lib/format";
import type { AdjustmentListItem } from "../../lib/types";

const REASONS = [
  "damaged",
  "lost",
  "expired",
  "theft",
  "found",
  "correction",
  "sample",
  "internal_use",
];

/**
 * Stock adjustments — write-offs and found stock.
 *
 * The most controlled operation here, because an unapproved write-off path is
 * the easiest way to hide shrinkage: raise it, approve it, and the stock is gone
 * with no counterparty to complain. So raising and approving are different
 * permissions held by different people, and the database refuses to let one
 * person do both.
 */
/**
 * The views that correspond to a decision.
 *
 * "Waiting on you" leads deliberately: an adjustment sitting unapproved is
 * stock the books still claim exists, and this is the one screen where a
 * backlog has an accounting consequence rather than merely an operational one.
 */
const VIEWS: { key: string; label: string; statuses?: string[] }[] = [
  { key: "todo", label: "Awaiting approval", statuses: ["pending_approval"] },
  { key: "open", label: "In progress", statuses: ["draft", "approved"] },
  { key: "done", label: "Posted", statuses: ["posted"] },
  { key: "all", label: "All" },
];

export function Adjustments() {
  const navigate = useNavigate();
  const { can } = useSessionContext();
  const [view, setView] = useState("todo");
  const [reason, setReason] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 25;

  const current = VIEWS.find((v) => v.key === view) ?? VIEWS[3]!;

  const adjustments = useApiList<AdjustmentListItem>(["adjustments", view], "/stock-adjustments", {
    status: current.statuses?.join(",") || undefined,
    reason: reason || undefined,
    limit,
    offset,
  });

  const select = (key: string) => {
    setView(key);
    setOffset(0);
  };

  /*
   * How many are genuinely waiting, not how many are waiting on this page.
   *
   * Counting the rows in hand was near enough when the list was unfiltered and
   * short, but it is a page of at most 25 — so a real backlog of 60 reported
   * itself as 25, and with the "Awaiting approval" view selected it would
   * report the page size back as though it were the answer. A one-row request
   * for the envelope's total costs a query and is actually true.
   */
  const pending = useApiList<AdjustmentListItem>(
    ["adjustments", "pending-count"],
    "/stock-adjustments",
    { status: "pending_approval", limit: 1, offset: 0 },
    { enabled: can("stock:adjust_approve") },
  );
  const awaitingApproval = pending.data?.total ?? 0;

  return (
    <>
      <PageHead
        title="Stock adjustments"
        subtitle="Damage, loss, expiry and found stock — every change needs a reason and a second signature"
        actions={
          can("stock:adjust") ? (
            <Link className="btn primary" to="/adjustments/new">
              Raise adjustment
            </Link>
          ) : null
        }
      />

      {awaitingApproval > 0 && can("stock:adjust_approve") ? (
        <div className="alert warn">
          {awaitingApproval} adjustment{awaitingApproval === 1 ? "" : "s"} waiting for approval.
        </div>
      ) : null}

      <div className="mb">
        <div className="seg" role="tablist" aria-label="Adjustment status">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={view === v.key}
              className={view === v.key ? "active" : ""}
              onClick={() => select(v.key)}
            >
              {v.label}
              {v.key === "todo" && awaitingApproval > 0 ? (
                <span className="count">{awaitingApproval}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div className="filters">
        <Field label="Reason">
          <select
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All reasons</option>
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {humanise(r)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Card flush>
        <QueryState
          query={{ ...adjustments, data: adjustments.data?.items }}
          empty={<Empty icon={<PackageMinus size={14} aria-hidden />} title="No adjustments" hint="Nothing has been written off or found." />}
        >
          <Table
            head={
              <tr>
                <th>Number</th>
                <th>Location</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Raised</th>
                {can("report:financial") ? <th className="num">Cost impact</th> : null}
              </tr>
            }
          >
            {(adjustments.data?.items ?? []).map((row) => (
              <tr
                key={row.id}
                className="clickable"
                onClick={() => navigate(`/adjustments/${row.id}`)}
              >
                <td>
                  <Link to={`/adjustments/${row.id}`}>{row.adjustmentNumber}</Link>
                </td>
                <td className="small">{row.locationName}</td>
                <td>
                  <Badge tone={row.reason === "found" ? "success" : "warn"}>
                    {humanise(row.reason)}
                  </Badge>
                </td>
                <td>
                  <Badge tone={statusTone(row.status)}>{humanise(row.status)}</Badge>
                </td>
                <td className="small">{date(row.createdAt)}</td>
                {can("report:financial") ? (
                  <td className="num">{money(row.totalValue ?? "0")}</td>
                ) : null}
              </tr>
            ))}
          </Table>
        </QueryState>

        <div className="card-foot">
          <Pager
            total={adjustments.data?.total ?? 0}
            limit={limit}
            offset={offset}
            onChange={setOffset}
          />
        </div>
      </Card>
    </>
  );
}
