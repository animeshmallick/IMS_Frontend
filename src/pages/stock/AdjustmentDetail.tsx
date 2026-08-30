import { useState } from "react";
import { useParams } from "react-router-dom";
import { useApi, useApiMutation } from "../../lib/hooks";
import { useSessionContext } from "../../lib/session";
import {
  Badge,
  Card,
  ConfirmButton,
  ErrorBanner,
  Loading,
  PageHead,
  Table,
} from "../../components/ui";
import { date, dateTime, humanise, money, qty, statusTone } from "../../lib/format";

interface AdjustmentLine {
  id: string;
  variantId: string;
  sku: string;
  variantName: string | null;
  batchId: string | null;
  batchCode: string | null;
  expiresOn: string | null;
  qtyDelta: string;
  costImpact: string;
  notes: string | null;
}

interface AdjustmentDetail {
  id: string;
  adjustmentNumber: string;
  status: "draft" | "pending_approval" | "approved" | "posted" | "rejected" | "cancelled";
  reason: string;
  locationId: string;
  locationName: string;
  totalCostImpact: string;
  createdBy: string;
  submittedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  postedAt: string | null;
  rejectedReason: string | null;
  notes: string | null;
  createdAt: string;
  lines: AdjustmentLine[];
}

/**
 * One adjustment, through raise → approve → post.
 *
 * The approve button is shown to anyone holding the permission, but the server
 * still refuses if they are the person who raised it — the segregation is
 * enforced by a database constraint rather than by this screen remembering to
 * check. Hiding the button here is a courtesy, not the control.
 */
export function AdjustmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can, session } = useSessionContext();
  const [reason, setReason] = useState("");

  const adjustment = useApi<AdjustmentDetail>(["adjustments", id], `/stock-adjustments/${id}`);

  const options = {
    method: "POST" as const,
    idempotent: true,
    invalidate: [["adjustments"], ["stock"]],
  };
  type Body = Record<string, unknown> | undefined;

  const submit = useApiMutation<Body, unknown>(`/stock-adjustments/${id}/submit`, options);
  const approve = useApiMutation<Body, unknown>(`/stock-adjustments/${id}/approve`, options);
  const reject = useApiMutation<Body, unknown>(`/stock-adjustments/${id}/reject`, options);
  const post = useApiMutation<Body, unknown>(`/stock-adjustments/${id}/post`, options);
  const cancel = useApiMutation<Body, unknown>(`/stock-adjustments/${id}/cancel`, options);

  if (adjustment.isPending) return <Loading />;
  if (adjustment.isError) return <ErrorBanner error={adjustment.error} />;
  const doc = adjustment.data!;

  const raisedByMe = doc.createdBy === session.user.id;

  return (
    <>
      <PageHead
        title={doc.adjustmentNumber}
        subtitle={
          <>
            {doc.locationName} · {humanise(doc.reason)}
          </>
        }
        actions={
          <>
            <Badge tone={statusTone(doc.status)}>{humanise(doc.status)}</Badge>

            {doc.status === "draft" && can("stock:adjust") ? (
              <ConfirmButton
                label="Submit for approval"
                message="Send this to a manager to approve."
                onConfirm={() => submit.mutateAsync(undefined)}
              />
            ) : null}

            {doc.status === "pending_approval" && can("stock:adjust_approve") && !raisedByMe ? (
              <>
                <ConfirmButton
                  label="Approve"
                  message="Approve this adjustment. It can then be posted, which moves the stock."
                  onConfirm={() => approve.mutateAsync(undefined)}
                />
                <ConfirmButton
                  danger
                  label="Reject"
                  message="Send this back rejected."
                  onConfirm={() => reject.mutateAsync({ reason: reason || "Rejected" })}
                >
                  <input
                    placeholder="Reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </ConfirmButton>
              </>
            ) : null}

            {doc.status === "approved" && can("stock:adjust_approve") ? (
              <ConfirmButton
                danger
                label="Post adjustment"
                title="Post and move the stock?"
                confirmLabel="Post"
                message="Write-offs go to scrap and found stock comes from variance. This is written to the ledger and cannot be undone except by a further adjustment."
                onConfirm={() => post.mutateAsync(undefined)}
              />
            ) : null}

            {["draft", "pending_approval"].includes(doc.status) && can("stock:adjust") ? (
              <ConfirmButton
                danger
                label="Cancel"
                message="Cancel this adjustment."
                onConfirm={() => cancel.mutateAsync({ reason: reason || "Cancelled" })}
              />
            ) : null}
          </>
        }
      />

      <ErrorBanner
        error={submit.error ?? approve.error ?? reject.error ?? post.error ?? cancel.error}
      />

      {doc.status === "pending_approval" && raisedByMe ? (
        <div className="alert warn">
          You raised this adjustment, so you cannot approve it. Someone holding the approval
          permission has to sign it off — that separation is what makes a write-off visible rather
          than absorbable.
        </div>
      ) : null}

      {doc.rejectedReason ? (
        <div className="alert error">Rejected: {doc.rejectedReason}</div>
      ) : null}

      <div className="grid cols-4 mb">
        <Card>
          <div className="stat">
            <div className="label">Cost impact</div>
            <div className="value">{money(doc.totalCostImpact)}</div>
          </div>
        </Card>
        <Card>
          <div className="stat">
            <div className="label">Raised</div>
            <div className="value text sm">
              {dateTime(doc.createdAt)}
            </div>
          </div>
        </Card>
        <Card>
          <div className="stat">
            <div className="label">Approved</div>
            <div className="value text sm">
              {doc.approvedAt ? dateTime(doc.approvedAt) : "Not yet"}
            </div>
          </div>
        </Card>
        <Card>
          <div className="stat">
            <div className="label">Posted</div>
            <div className="value text sm">
              {doc.postedAt ? dateTime(doc.postedAt) : "Not yet"}
            </div>
          </div>
        </Card>
      </div>

      <Card title="Lines" flush>
        <Table
          head={
            <tr>
              <th>Item</th>
              <th>Batch</th>
              <th className="num">Change</th>
              <th className="num">Cost impact</th>
              <th>Note</th>
            </tr>
          }
        >
          {doc.lines.map((line) => {
            const delta = Number(line.qtyDelta);
            return (
              <tr key={line.id}>
                <td>
                  {line.sku}
                  {line.variantName ? <span className="sub">{line.variantName}</span> : null}
                </td>
                <td className="small">
                  {line.batchCode ?? <span className="muted">new batch</span>}
                  {line.expiresOn ? <span className="sub">expires {date(line.expiresOn)}</span> : null}
                </td>
                <td className="num">
                  <strong className={delta < 0 ? "text-danger" : "text-success"}>
                    {delta > 0 ? "+" : ""}
                    {qty(line.qtyDelta)}
                  </strong>
                </td>
                <td className="num">{money(line.costImpact)}</td>
                <td className="small">{line.notes ?? "—"}</td>
              </tr>
            );
          })}
        </Table>
      </Card>

      {doc.notes ? (
        <Card title="Notes">
          <p>{doc.notes}</p>
        </Card>
      ) : null}
    </>
  );
}
