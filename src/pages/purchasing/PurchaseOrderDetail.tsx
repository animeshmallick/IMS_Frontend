import { Link, useNavigate, useParams } from "react-router-dom";
import { useApi, useApiMutation } from "../../lib/hooks";
import { useSessionContext } from "../../lib/session";
import {
  Badge,
  Card,
  ConfirmButton,
  ErrorBanner,
  Loading,
  Modal,
  PageHead,
  Table,
} from "../../components/ui";
import {
  date,
  dateTime,
  humanise,
  money,
  multiplyMoney,
  qty,
  statusTone,
  sumMoney,
} from "../../lib/format";
import type { PurchaseOrderDetail, VariantSearchResult } from "../../lib/types";
import { VariantPicker } from "../../components/VariantPicker";
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
/**
 * Edit the lines of an order that has not been sent yet.
 *
 * A purchase order is built up over time — items get remembered after the
 * draft is saved — and until now the only way to add one was to cancel the
 * order and key the whole thing again. The API replaces the line set wholesale,
 * so this edits a local copy and submits all of it.
 *
 * Existing lines keep the unit they were raised in. Changing a line's pack size
 * is rare and is the same thing as removing it and adding it back, whereas
 * offering the choice here would mean fetching every line's configured units
 * one request at a time.
 */
/**
 * The statuses whose lines may still change — everything before the order is
 * sent to the supplier. Mirrors the server, which is the authority.
 */
const EDITABLE_STATUSES = ["draft", "pending_approval", "approved"];

function EditLines({
  order,
  onClose,
  onDone,
}: {
  order: PurchaseOrderDetail;
  onClose: () => void;
  onDone: () => void;
}) {
  interface Row {
    variantId: string;
    sku: string;
    variantName: string | null;
    orderUomId: string;
    orderQty: string;
    unitCost: string;
    /** Already delivered against this line, in base units. */
    receivedQtyBase: string;
    /** What this SKU may be ordered in: its stock unit, then its pack sizes. */
    units: { uomId: string; uomCode: string; factorToStockUom: string }[];
    stockUomId: string;
    stockUomCode: string;
  }

  /*
   * The stock unit always leads, then the configured pack sizes.
   *
   * The stock unit needs no conversion row — the server treats a document in it
   * as a 1:1 — so it is prepended rather than expected in the list.
   */
  const unitsFor = (
    stockUomId: string,
    stockUomCode: string,
    conversions: { uomId: string; uomCode: string; factorToStockUom: string }[],
  ) => [
    { uomId: stockUomId, uomCode: stockUomCode, factorToStockUom: "1" },
    ...conversions.map((c) => ({
      uomId: c.uomId,
      uomCode: c.uomCode,
      factorToStockUom: c.factorToStockUom,
    })),
  ];

  const [rows, setRows] = useState<Row[]>(() =>
    order.lines.map((line) => ({
      variantId: line.variantId,
      sku: line.sku,
      variantName: line.variantName,
      orderUomId: line.orderUomId,
      orderQty: line.orderQty,
      unitCost: line.unitCost,
      receivedQtyBase: line.receivedQtyBase,
      units: unitsFor(line.stockUomId, line.stockUomCode, line.orderUnits ?? []),
      stockUomId: line.stockUomId,
      stockUomCode: line.stockUomCode,
    })),
  );

  const save = useApiMutation<{ lines: unknown[] }, unknown>(
    `/purchase-orders/${order.id}/lines`,
    // PUT: the endpoint replaces the whole line set rather than appending.
    { method: "PUT", invalidate: [["purchase-orders"]], onSuccess: onDone },
  );

  function patch(index: number, next: Partial<Row>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...next } : row)));
  }

  function add(variant: VariantSearchResult) {
    if (rows.some((row) => row.variantId === variant.variantId)) return;
    setRows((current) => [
      ...current,
      {
        variantId: variant.variantId,
        sku: variant.sku,
        variantName: variant.variantName,
        // Defaults to the stock unit; the dropdown offers the pack sizes.
        orderUomId: variant.stockUomId,
        orderQty: "1",
        unitCost: "0",
        receivedQtyBase: "0",
        units: unitsFor(variant.stockUomId, variant.stockUomCode, variant.orderUnits ?? []),
        stockUomId: variant.stockUomId,
        stockUomCode: variant.stockUomCode,
      },
    ]);
  }

  const subtotal = sumMoney(rows.map((row) => multiplyMoney(row.unitCost, row.orderQty)));
  const valid = rows.length > 0 && rows.every((row) => Number(row.orderQty) > 0);

  return (
    <Modal
      wide
      title={`Edit lines — ${order.poNumber}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={save.isPending}>
            Cancel
          </button>
          <button
            type="button"
            className={save.isPending ? "primary busy" : "primary"}
            disabled={!valid || save.isPending}
            onClick={() =>
              save.mutate({
                lines: rows.map((row) => ({
                  variantId: row.variantId,
                  orderUomId: row.orderUomId,
                  orderQty: row.orderQty,
                  unitCost: row.unitCost,
                })),
              })
            }
          >
            Save lines
          </button>
        </>
      }
    >
      <ErrorBanner error={save.error} />

      {/*
        * Re-approval is a consequence worth stating before the edit, not after.
        * The server voids the approval on save; somebody who did not expect
        * that would otherwise find the order back in the approver's queue with
        * no explanation.
        */}
      {order.status === "approved" ? (
        <div className="alert warn">
          This order has been approved. Changing its lines voids that approval and sends it back
          for approval again.
        </div>
      ) : null}

      <Table
        head={
          <tr>
            <th>Item</th>
            <th className="num">Quantity</th>
            <th>Unit</th>
            <th className="num">Unit cost</th>
            <th className="num">Line total</th>
            <th />
          </tr>
        }
      >
        {rows.map((row, index) => (
          <tr key={row.variantId}>
            <td>
              {row.sku}
              {row.variantName ? <span className="sub">{row.variantName}</span> : null}
            </td>
            <td className="num">
              <input
                className="num"
                inputMode="decimal"
                style={{ width: "6rem" }}
                value={row.orderQty}
                onChange={(e) => patch(index, { orderQty: e.target.value })}
              />
            </td>
            {/*
              * The unit is editable, on existing lines as much as new ones — a
              * line raised in pieces because no pack size existed yet should not
              * have to be removed and re-added once one does. Only the units
              * this SKU actually has a conversion for: anything else is refused
              * by the server, and the factor is shown because it is what is
              * being chosen.
              */}
            <td>
              <select
                value={row.orderUomId}
                onChange={(e) => patch(index, { orderUomId: e.target.value })}
              >
                {row.units.map((unit) => (
                  <option key={unit.uomId} value={unit.uomId}>
                    {unit.uomCode}
                    {unit.uomId === row.stockUomId
                      ? " (stock unit)"
                      : ` (${qty(unit.factorToStockUom)} ${row.stockUomCode})`}
                  </option>
                ))}
              </select>
            </td>
            <td className="num">
              <input
                className="num"
                inputMode="decimal"
                style={{ width: "7rem" }}
                value={row.unitCost}
                onChange={(e) => patch(index, { unitCost: e.target.value })}
              />
            </td>
            <td className="num">{money(multiplyMoney(row.unitCost, row.orderQty))}</td>
            <td>
              {/*
                * A line with stock already delivered against it cannot be
                * removed: the receipt references it, and dropping the line
                * would leave goods on the shelf that no order accounts for.
                */}
              {Number(row.receivedQtyBase) > 0 ? (
                <Badge tone="info">Delivered</Badge>
              ) : (
                <button
                  type="button"
                  className="sm subtle-danger"
                  onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                >
                  Remove
                </button>
              )}
            </td>
          </tr>
        ))}
      </Table>

      {rows.length === 0 ? (
        <div className="alert warn">
          An order needs at least one line. Add one below, or cancel to leave it unchanged.
        </div>
      ) : null}

      <div className="spread mt">
        <strong>Subtotal</strong>
        <strong>{money(subtotal)}</strong>
      </div>

      <hr />

      <VariantPicker onPick={add} placeholder="Search a product to add" />
    </Modal>
  );
}

export function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = useSessionContext();
  const [reason, setReason] = useState("");
  const [editingLines, setEditingLines] = useState(false);

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

            {/*
              * Editable until the order is SENT, not merely while it is a
              * draft. Everything before "ordered" is still internal: nothing
              * has reached the supplier, and a buyer who remembers a second
              * item should not have to cancel and re-key the order.
              */}
            {EDITABLE_STATUSES.includes(order.status) && can("po:write") ? (
              <button type="button" onClick={() => setEditingLines(true)}>
                Edit lines
              </button>
            ) : null}

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
            <div className="value text">
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
            <div className="value text">
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

      {editingLines ? (
        <EditLines
          order={order}
          onClose={() => setEditingLines(false)}
          onDone={() => {
            setEditingLines(false);
            void po.refetch();
          }}
        />
      ) : null}

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
