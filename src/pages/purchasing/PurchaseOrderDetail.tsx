import { Link, useNavigate, useParams } from "react-router-dom";
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
import type { PurchaseOrderDetail } from "../../lib/types";
import { useState } from "react";

/**
 * One purchase order, and everything that can be done to it.
 *
 * The action buttons are driven by STATUS as well as permission, because the
 * lifecycle is a state machine the server enforces: a draft can be submitted,
 * an approved order can be placed, and only an ordered one can be received
 * against. Showing an action the current state forbids just produces a 409 the
 * user cannot act on.
 */
export function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = useSessionContext();
  const [reason, setReason] = useState("");

  const po = useApi<PurchaseOrderDetail>(["purchase-orders", id], `/purchase-orders/${id}`);

  // Each transition is its own mutation. They are declared individually rather
  // than built in a loop or helper so the hook order is fixed and obvious.
  const options = {
    method: "POST" as const,
    idempotent: true,
    invalidate: [["purchase-orders"], ["stock"]],
  };
  type Body = Record<string, unknown> | undefined;

  const submit = useApiMutation<Body, unknown>(`/purchase-orders/${id}/submit`, options);
  const approve = useApiMutation<Body, unknown>(`/purchase-orders/${id}/approve`, options);
  const reject = useApiMutation<Body, unknown>(`/purchase-orders/${id}/reject`, options);
  const place = useApiMutation<Body, unknown>(`/purchase-orders/${id}/place`, options);
  const cancel = useApiMutation<Body, unknown>(`/purchase-orders/${id}/cancel`, options);
  const close = useApiMutation<Body, unknown>(`/purchase-orders/${id}/close`, options);

  if (po.isPending) return <Loading />;
  if (po.isError) return <ErrorBanner error={po.error} />;
  const order = po.data!;

  const received = order.lines.every(
    (line) => Number(line.receivedQtyBase) >= Number(line.orderQtyBase),
  );
  const anyReceived = order.lines.some((line) => Number(line.receivedQtyBase) > 0);

  const canReceive =
    can("grn:write") && ["ordered", "partially_received"].includes(order.status);

  return (
    <>
      <PageHead
        title={order.poNumber}
        subtitle={
          <>
            {order.supplierName} → {order.destinationName}
            {order.supplierReference ? ` · supplier ref ${order.supplierReference}` : ""}
          </>
        }
        actions={
          <>
            <Badge tone={statusTone(order.status)}>{humanise(order.status)}</Badge>

            {order.status === "draft" && can("po:submit") ? (
              <ConfirmButton
                label="Submit for approval"
                message="Send this order for approval? You will not be able to edit the lines afterwards."
                onConfirm={() => submit.mutateAsync(undefined)}
              />
            ) : null}

            {order.status === "pending_approval" && can("po:approve") ? (
              <>
                <ConfirmButton
                  label="Approve"
                  message="Approve this purchase order? Whoever raised it cannot be the one to approve it."
                  onConfirm={() => approve.mutateAsync(undefined)}
                />
                <ConfirmButton
                  danger
                  label="Reject"
                  message="Send this back to the buyer as rejected."
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

            {order.status === "approved" && can("po:place") ? (
              <ConfirmButton
                label="Mark as ordered"
                message="Confirm this order has been placed with the supplier."
                onConfirm={() => place.mutateAsync({ supplierReference: reason || undefined })}
              >
                <input
                  placeholder="Supplier reference (optional)"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </ConfirmButton>
            ) : null}

            {canReceive ? (
              <Link className="btn primary" to={`/goods-receipts/new?purchaseOrderId=${order.id}`}>
                Record delivery
              </Link>
            ) : null}

            {order.status === "partially_received" && can("po:close") ? (
              <ConfirmButton
                danger
                label="Short close"
                message="Close this order even though not everything arrived. The outstanding quantity will no longer be expected."
                onConfirm={() => close.mutateAsync({ reason: reason || "Short closed" })}
              >
                <input
                  placeholder="Why is it being closed short?"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </ConfirmButton>
            ) : null}

            {["draft", "pending_approval", "approved", "ordered"].includes(order.status) &&
            can("po:cancel") &&
            !anyReceived ? (
              <ConfirmButton
                danger
                label="Cancel order"
                message="Cancel this purchase order entirely."
                onConfirm={() => cancel.mutateAsync({ reason: reason || "Cancelled" })}
              />
            ) : null}
          </>
        }
      />

      <ErrorBanner
        error={
          submit.error ?? approve.error ?? reject.error ?? place.error ?? cancel.error ?? close.error
        }
      />

      <div className="grid cols-4 mb">
        <Card>
          <div className="stat">
            <div className="label">Order value</div>
            <div className="value">{money(order.total)}</div>
            <div className="hint">
              {money(order.subtotal)} goods
              {Number(order.otherCharges) > 0 ? ` + ${money(order.otherCharges)} charges` : ""}
            </div>
          </div>
        </Card>
        <Card>
          <div className="stat">
            <div className="label">Expected</div>
            <div className="value" style={{ fontSize: "1.1rem" }}>
              {date(order.expectedDate)}
            </div>
          </div>
        </Card>
        <Card>
          <div className="stat">
            <div className="label">Lines received</div>
            <div className="value">
              {order.lines.filter((l) => Number(l.receivedQtyBase) >= Number(l.orderQtyBase)).length}
              <span className="muted"> / {order.lines.length}</span>
            </div>
          </div>
        </Card>
        <Card>
          <div className="stat">
            <div className="label">Approved</div>
            <div className="value" style={{ fontSize: "1.1rem" }}>
              {order.approvedAt ? dateTime(order.approvedAt) : "Not yet"}
            </div>
          </div>
        </Card>
      </div>

      <Card title="Ordered items" flush>
        <Table
          head={
            <tr>
              <th>#</th>
              <th>Item</th>
              <th className="num">Ordered</th>
              <th className="num">Received</th>
              <th className="num">Outstanding</th>
              <th className="num">Unit cost</th>
              <th className="num">Line total</th>
            </tr>
          }
        >
          {order.lines.map((line) => {
            const outstanding = Number(line.orderQtyBase) - Number(line.receivedQtyBase);
            return (
              <tr key={line.id}>
                <td className="muted">{line.lineNo}</td>
                <td>
                  {line.sku}
                  {line.variantName ? <span className="sub">{line.variantName}</span> : null}
                </td>
                <td className="num">
                  {qty(line.orderQty)} <span className="muted small">{line.orderUomCode}</span>
                  {line.uomFactor !== "1.000000" ? (
                    <span className="sub">= {qty(line.orderQtyBase)} base</span>
                  ) : null}
                </td>
                <td className="num">{qty(line.receivedQtyBase)}</td>
                <td className="num">
                  {outstanding > 0 ? (
                    <Badge tone="warn">{qty(String(outstanding))}</Badge>
                  ) : (
                    <Badge tone="success">Complete</Badge>
                  )}
                </td>
                <td className="num">{money(line.unitCost)}</td>
                <td className="num">{money(line.lineSubtotal)}</td>
              </tr>
            );
          })}
        </Table>
      </Card>

      <Card title="Deliveries against this order" flush>
        {order.receipts.length === 0 ? (
          <p className="empty">
            Nothing has been delivered yet.
            {canReceive ? " Use “Record delivery” when the goods arrive." : ""}
          </p>
        ) : (
          <Table
            head={
              <tr>
                <th>Receipt</th>
                <th>Status</th>
                <th>Supplier invoice</th>
                <th>Received</th>
              </tr>
            }
          >
            {order.receipts.map((receipt) => (
              <tr key={receipt.id}>
                <td>
                  <Link to={`/goods-receipts/${receipt.id}`}>{receipt.grnNumber}</Link>
                </td>
                <td>
                  <Badge tone={statusTone(receipt.status)}>{humanise(receipt.status)}</Badge>
                </td>
                <td className="small">{receipt.supplierInvoiceNo ?? "—"}</td>
                <td className="small">{dateTime(receipt.receivedAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {received && order.status !== "closed" ? (
        <p className="small muted mt">
          Every line has been received in full — this order closes itself.
        </p>
      ) : null}

      <p className="mt">
        <button type="button" onClick={() => navigate("/purchase-orders")}>
          Back to purchase orders
        </button>
      </p>
    </>
  );
}
