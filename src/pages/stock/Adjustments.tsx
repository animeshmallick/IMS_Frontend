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
export function Adjustments() {
  const navigate = useNavigate();
  const { can } = useSessionContext();
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 25;

  const adjustments = useApiList<AdjustmentListItem>(["adjustments"], "/stock-adjustments", {
    status: status || undefined,
    reason: reason || undefined,
    limit,
    offset,
  });

  const awaitingApproval = (adjustments.data?.items ?? []).filter(
    (a) => a.status === "pending_approval",
  ).length;

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

      <div className="filters">
        <Field label="Status">
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All statuses</option>
            {["draft", "pending_approval", "approved", "posted", "rejected", "cancelled"].map((s) => (
              <option key={s} value={s}>
                {humanise(s)}
              </option>
            ))}
          </select>
        </Field>

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
