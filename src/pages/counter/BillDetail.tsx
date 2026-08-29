import { useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { useApi, useApiMutation } from "../../lib/hooks";
import { useSessionContext } from "../../lib/session";
import {
  Badge,
  Card,
  ErrorBanner,
  Field,
  Loading,
  Modal,
  PageHead,
  Table,
} from "../../components/ui";
import { date, dateTime, humanise, money, qty } from "../../lib/format";
import type { PaymentMethod, ReturnableLine, SalesOrder } from "../../lib/types";

/**
 * One bill: the customer's receipt, and the place a return starts from.
 *
 * The receipt block is styled for a 76 mm thermal roll and everything else is
 * hidden when printing, so "Print receipt" produces a receipt rather than a
 * screenshot of an admin page.
 */
export function BillDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const { can } = useSessionContext();
  const [returning, setReturning] = useState(false);

  const order = useApi<SalesOrder>(["counter", "order", id], `/counter/orders/${id}`);

  if (order.isPending) return <Loading />;
  if (order.isError) return <ErrorBanner error={order.error} />;
  const bill = order.data!;

  const justPlaced = params.get("justPlaced") === "1";
  const cash = bill.payments.find((p) => p.method === "cash");

  return (
    <>
      <div className="no-print">
        <PageHead
          title={bill.orderNumber ?? "Bill"}
          subtitle={
            <>
              {bill.locationName} · {dateTime(bill.placedAt)}
              {bill.customerName ? ` · ${bill.customerName}` : ""}
            </>
          }
          actions={
            <>
              <button type="button" className="primary" onClick={() => window.print()}>
                Print receipt
              </button>
              {can("sale:return") && bill.status === "placed" ? (
                <button type="button" onClick={() => setReturning(true)}>
                  Process return
                </button>
              ) : null}
              <Link className="btn" to="/counter">
                New sale
              </Link>
            </>
          }
        />

        {justPlaced ? (
          <div className="alert success">
            Bill placed.
            {cash && Number(cash.changeGiven) > 0 ? (
              <> Give <strong>{money(cash.changeGiven)}</strong> change.</>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ------------------------------------------------------- the receipt */}
      <Card>
        <div className="receipt">
          <div className="center">
            <strong>{bill.locationName}</strong>
            <br />
            <span className="small">Tax invoice not applicable</span>
          </div>
          <hr />
          <div className="spread small">
            <span>{bill.orderNumber}</span>
            <span>{dateTime(bill.placedAt)}</span>
          </div>
          {bill.customerName ? <div className="small">Customer: {bill.customerName}</div> : null}
          <hr />

          <table>
            <tbody>
              {bill.lines.map((line) => (
                <tr key={line.id}>
                  <td>
                    {line.productName}
                    <br />
                    <span className="muted">
                      {qty(line.saleQty)} {line.saleUomCode} × {money(line.unitPrice)}
                    </span>
                  </td>
                  <td className="num">{money(line.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <hr />
          <div className="spread">
            <span>Subtotal</span>
            <span className="num">{money(bill.subtotal)}</span>
          </div>
          {Number(bill.discountAmount) > 0 ? (
            <div className="spread">
              <span>Discount</span>
              <span className="num">−{money(bill.discountAmount)}</span>
            </div>
          ) : null}
          {Number(bill.roundingAdjustment) !== 0 ? (
            <div className="spread">
              <span>Rounding</span>
              <span className="num">{money(bill.roundingAdjustment)}</span>
            </div>
          ) : null}
          <div className="spread">
            <strong>Total</strong>
            <strong className="num">{money(bill.total)}</strong>
          </div>
          <hr />
          {bill.payments.map((payment) => (
            <div className="spread small" key={payment.id}>
              <span>{humanise(payment.method)}</span>
              <span className="num">{money(payment.amount)}</span>
            </div>
          ))}
          {cash && Number(cash.changeGiven) > 0 ? (
            <div className="spread small">
              <span>Change</span>
              <span className="num">{money(cash.changeGiven)}</span>
            </div>
          ) : null}
          <hr />
          <div className="center small">Thank you — goods once sold are exchangeable with this bill</div>
        </div>
      </Card>

      {/* ------------------------------------------------- internal detail */}
      <div className="no-print">
        <Card title="Lines and batches" flush>
          <Table
            head={
              <tr>
                <th>Item</th>
                <th className="num">Qty</th>
                <th className="num">Price</th>
                <th className="num">Total</th>
                <th>Batch supplied</th>
                {can("report:financial") ? <th className="num">Cost</th> : null}
                {can("report:financial") ? <th className="num">Margin</th> : null}
              </tr>
            }
          >
            {bill.lines.map((line) => (
              <tr key={line.id}>
                <td>
                  {line.sku}
                  <span className="sub">{line.productName}</span>
                </td>
                <td className="num">
                  {qty(line.saleQty)} <span className="muted small">{line.saleUomCode}</span>
                  {Number(line.returnedQtyBase) > 0 ? (
                    <span className="sub">
                      <Badge tone="warn">{qty(line.returnedQtyBase)} returned</Badge>
                    </span>
                  ) : null}
                </td>
                <td className="num">{money(line.unitPrice)}</td>
                <td className="num">{money(line.lineTotal)}</td>
                <td className="small">
                  {line.allocations.map((allocation) => (
                    <div key={allocation.batchId}>
                      {allocation.batchCode}
                      {allocation.expiresOn ? ` · ${date(allocation.expiresOn)}` : ""}
                      {allocation.wasManual ? " · overridden" : ""}
                    </div>
                  ))}
                </td>
                {can("report:financial") ? <td className="num muted">{money(line.lineCost)}</td> : null}
                {can("report:financial") ? (
                  <td className="num">
                    {money(Number(line.lineTotal) - Number(line.lineCost))}
                  </td>
                ) : null}
              </tr>
            ))}
          </Table>
        </Card>
      </div>

      {returning ? (
        <ReturnModal
          bill={bill}
          onClose={() => setReturning(false)}
          onDone={() => {
            setReturning(false);
            void order.refetch();
          }}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ returns */

/**
 * A return goes back to the BATCH it came from.
 *
 * Restocking into a fresher lot would attach the wrong expiry to physical stock
 * going back on a shelf, so the batch is fixed by the original allocation and is
 * not the operator's choice. Damaged goods are booked to scrap rather than back
 * into sellable stock.
 */
function ReturnModal({
  bill,
  onClose,
  onDone,
}: {
  bill: SalesOrder;
  onClose: () => void;
  onDone: () => void;
}) {
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [conditions, setConditions] = useState<Record<string, "sellable" | "damaged">>({});
  const [reason, setReason] = useState("");
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>("cash");

  const returnable = useApi<ReturnableLine[]>(
    ["counter", "returnable", bill.id],
    `/counter/orders/${bill.id}/returnable`,
  );

  const create = useApiMutation<Record<string, unknown>, unknown>("/counter/returns", {
    method: "POST",
    idempotent: true,
    invalidate: [["counter"], ["stock"], ["reports"]],
    onSuccess: onDone,
  });

  const lines = (returnable.data ?? []).filter(
    (line) => Number(quantities[keyOf(line)] ?? 0) > 0,
  );

  function keyOf(line: ReturnableLine) {
    return `${line.salesOrderLineId}:${line.batchId}`;
  }

  return (
    <Modal
      title="Process a return"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={lines.length === 0 || reason.trim().length < 3 || create.isPending}
            onClick={() =>
              create.mutate({
                originalOrderId: bill.id,
                reason,
                refundMethod,
                lines: lines.map((line) => ({
                  salesOrderLineId: line.salesOrderLineId,
                  qtyBase: quantities[keyOf(line)]!,
                  batchId: line.batchId,
                  condition: conditions[keyOf(line)] ?? "sellable",
                })),
              })
            }
          >
            {create.isPending ? "Refunding..." : "Refund"}
          </button>
        </>
      }
    >
      <ErrorBanner error={create.error} />

      {returnable.isPending ? (
        <Loading />
      ) : (
        <Table
          head={
            <tr>
              <th>Item</th>
              <th className="num">Returnable</th>
              <th className="num">Return qty</th>
              <th>Condition</th>
            </tr>
          }
        >
          {(returnable.data ?? []).map((line) => (
            <tr key={keyOf(line)}>
              <td>
                {line.sku}
                <span className="sub">{line.batchCode}</span>
              </td>
              <td className="num">{qty(line.returnableQtyBase)}</td>
              <td>
                <input
                  className="num"
                  inputMode="decimal"
                  value={quantities[keyOf(line)] ?? ""}
                  placeholder="0"
                  onChange={(e) =>
                    setQuantities((current) => ({ ...current, [keyOf(line)]: e.target.value }))
                  }
                />
              </td>
              <td>
                <select
                  value={conditions[keyOf(line)] ?? "sellable"}
                  onChange={(e) =>
                    setConditions((current) => ({
                      ...current,
                      [keyOf(line)]: e.target.value as "sellable" | "damaged",
                    }))
                  }
                >
                  <option value="sellable">Back on the shelf</option>
                  <option value="damaged">Damaged — write off</option>
                </select>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <div className="inline-form mt">
        <Field label="Refund method">
          <select
            value={refundMethod}
            onChange={(e) => setRefundMethod(e.target.value as PaymentMethod)}
          >
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="card">Card</option>
            <option value="store_credit">Store credit</option>
          </select>
        </Field>
        <Field label="Reason">
          <input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>

      <p className="small muted mt">
        The refund is proportional to what the customer actually paid for the line, so a discounted
        item does not refund more than it earned.
      </p>
    </Modal>
  );
}
