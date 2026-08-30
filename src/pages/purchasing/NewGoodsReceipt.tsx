import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApi, useApiMutation } from "../../lib/hooks";
import {
  Card,
  ErrorBanner,
  Field,
  Loading,
  PageHead,
  Table,
  TextField,
} from "../../components/ui";
import { money, multiplyMoney, qty, sumMoney, toDateInput } from "../../lib/format";
import type { PurchaseOrderDetail } from "../../lib/types";
import { ReceiveScan } from "./ReceiveScan";

interface ReceiptLine {
  purchaseOrderLineId: string;
  variantId: string;
  sku: string;
  variantName: string | null;
  receiptUomId: string;
  receiptUomCode: string;
  outstanding: string;
  receiptQty: string;
  unitCost: string;
  rejectedQty: string;
  rejectionReason: string;
  supplierBatchNo: string;
  manufacturedOn: string;
  expiresOn: string;
  /** Only products flagged `trackExpiry` demand a date. */
  requiresExpiry: boolean;
  /** Serial-tracked goods need one number per accepted unit. */
  requiresSerials: boolean;
  serials: string;
  include: boolean;
}

/**
 * Record what actually arrived.
 *
 * Pre-filled with the OUTSTANDING quantity per line rather than the ordered
 * quantity, because a second delivery against the same order should not
 * re-suggest what already came. Every line is editable: short deliveries,
 * over-deliveries within tolerance and damaged units are all normal.
 *
 * Expiry is only asked for where the product is set to track it. For hardware
 * and electronics the batch is created silently with no expiry, which is why
 * this screen stays a quantity form for most goods.
 */
export function NewGoodsReceipt() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const purchaseOrderId = params.get("purchaseOrderId") ?? "";

  const po = useApi<PurchaseOrderDetail>(
    ["purchase-orders", purchaseOrderId],
    `/purchase-orders/${purchaseOrderId}`,
    undefined,
    { enabled: Boolean(purchaseOrderId) },
  );

  const [lines, setLines] = useState<ReceiptLine[]>([]);
  /** The line a scan just landed on, so it can be picked out of a long list. */
  const [scanned, setScanned] = useState<string | null>(null);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(toDateInput(new Date()));
  const [deliveryNote, setDeliveryNote] = useState("");
  const [freight, setFreight] = useState("0");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const order = po.data;
    if (!order || lines.length > 0) return;

    setLines(
      order.lines
        .map((line) => {
          const outstandingBase = Number(line.orderQtyBase) - Number(line.receivedQtyBase);
          const outstandingInOrderUom = outstandingBase / Number(line.uomFactor);
          return {
            purchaseOrderLineId: line.id,
            variantId: line.variantId,
            sku: line.sku,
            variantName: line.variantName,
            receiptUomId: line.orderUomId,
            receiptUomCode: line.orderUomCode,
            outstanding: String(Math.max(0, outstandingInOrderUom)),
            receiptQty: outstandingInOrderUom > 0 ? String(outstandingInOrderUom) : "0",
            unitCost: line.unitCost,
            rejectedQty: "0",
            rejectionReason: "",
            supplierBatchNo: "",
            manufacturedOn: "",
            expiresOn: "",
            requiresExpiry: line.trackExpiry,
            requiresSerials: line.trackSerial,
            serials: "",
            include: outstandingInOrderUom > 0,
          };
        })
        .filter((line) => Number(line.outstanding) > 0 || line.include),
    );
  }, [po.data, lines.length]);

  const create = useApiMutation<Record<string, unknown>, { id: string }>("/goods-receipts", {
    method: "POST",
    idempotent: true,
    invalidate: [["goods-receipts"], ["purchase-orders"], ["stock"]],
    onSuccess: (result) => navigate(`/goods-receipts/${result.id}`),
  });

  function patch(index: number, changes: Partial<ReceiptLine>) {
    setLines((current) => current.map((l, i) => (i === index ? { ...l, ...changes } : l)));
  }

  /** One serial per line in the box; blank lines are ignored. */
  const parseSerials = (raw: string) =>
    raw
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);

  const included = lines.filter((l) => l.include && Number(l.receiptQty) > 0);
  const total = sumMoney(included.map((l) => multiplyMoney(l.unitCost, l.receiptQty)));

  const missingExpiry = included.filter(
    (l) => l.requiresExpiry && !l.expiresOn && !l.manufacturedOn,
  );

  const acceptedFor = (line: ReceiptLine) =>
    Math.max(0, Number(line.receiptQty) - Number(line.rejectedQty || 0));

  const missingSerials = included.filter(
    (l) => l.requiresSerials && parseSerials(l.serials).length !== acceptedFor(l),
  );

  const ready =
    included.length > 0 && missingExpiry.length === 0 && missingSerials.length === 0;

  function submit() {
    if (!po.data) return;
    create.mutate({
      purchaseOrderId: po.data.id,
      locationId: po.data.destinationLocationId,
      supplierInvoiceNo: invoiceNo || undefined,
      supplierInvoiceDate: invoiceDate || undefined,
      deliveryNoteNo: deliveryNote || undefined,
      freightCharges: Number(freight) > 0 ? freight : undefined,
      notes: notes || undefined,
      lines: included.map((line) => ({
        purchaseOrderLineId: line.purchaseOrderLineId,
        variantId: line.variantId,
        receiptUomId: line.receiptUomId,
        receiptQty: line.receiptQty,
        unitCost: line.unitCost,
        rejectedQty: Number(line.rejectedQty) > 0 ? line.rejectedQty : undefined,
        rejectionReason: Number(line.rejectedQty) > 0 ? line.rejectionReason : undefined,
        supplierBatchNo: line.supplierBatchNo || undefined,
        manufacturedOn: line.manufacturedOn || undefined,
        expiresOn: line.expiresOn || undefined,
        serials: line.requiresSerials ? parseSerials(line.serials) : undefined,
      })),
    });
  }

  if (!purchaseOrderId) {
    return (
      <div className="empty">
        <h3>Choose a purchase order first</h3>
        <p>A delivery is always recorded against the order it fulfils.</p>
      </div>
    );
  }

  if (po.isPending) return <Loading />;
  if (po.isError) return <ErrorBanner error={po.error} />;

  return (
    <>
      <PageHead
        title="Record delivery"
        subtitle={`Against ${po.data!.poNumber} · ${po.data!.supplierName} · arriving at ${po.data!.destinationName}`}
        actions={
          <>
            <button type="button" onClick={() => navigate(`/purchase-orders/${purchaseOrderId}`)}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              disabled={!ready || create.isPending}
              onClick={submit}
            >
              {create.isPending ? "Saving..." : "Save receipt"}
            </button>
          </>
        }
      />

      <ErrorBanner error={create.error} />

      {missingSerials.length > 0 ? (
        <div className="alert warn">
          {missingSerials
            .map(
              (l) =>
                `${l.sku}: ${parseSerials(l.serials).length} of ${acceptedFor(l)} serial numbers`,
            )
            .join("; ")}
          . Serial-tracked goods need one number per unit — that is what makes a warranty
          claim answerable later.
        </div>
      ) : null}

      {missingExpiry.length > 0 ? (
        <div className="alert warn">
          {missingExpiry.map((l) => l.sku).join(", ")} needs an expiry date (or a manufacture date,
          if the product has a shelf life set).
        </div>
      ) : null}

      <Card title="Supplier paperwork">
        <div className="grid cols-4">
          <TextField
            label="Supplier invoice no."
            value={invoiceNo}
            onChange={(e) => setInvoiceNo(e.target.value)}
          />
          <TextField
            label="Invoice date"
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
          />
          <TextField
            label="Delivery note no."
            value={deliveryNote}
            onChange={(e) => setDeliveryNote(e.target.value)}
          />
          <TextField
            label="Freight charges"
            help="Spread across the lines as landed cost."
            inputMode="decimal"
            value={freight}
            onChange={(e) => setFreight(e.target.value)}
          />
        </div>
      </Card>

      <Card
        title="What arrived"
        actions={<strong className="num">{money(total)}</strong>}
        flush
      >
        {/*
          * Receiving is where a barcode is first seen. A product bought for the
          * first time was created before anyone had the packet in hand, so the
          * code on it cannot have been entered in advance — this is the only
          * moment it can be captured without guessing.
          */}
        <ReceiveScan
          lines={lines.map((l) => ({
            purchaseOrderLineId: l.purchaseOrderLineId,
            variantId: l.variantId,
            sku: l.sku,
            variantName: l.variantName,
          }))}
          onMatch={(id) => {
            setScanned(id);
            // A scan means the goods are in front of you, so include the line
            // rather than making it a second click.
            setLines((current) =>
              current.map((l) =>
                l.purchaseOrderLineId === id ? { ...l, include: true } : l,
              ),
            );
            document
              .querySelector(`[data-line="${id}"]`)
              ?.scrollIntoView({ block: "center", behavior: "smooth" });
          }}
          onLinked={() => void po.refetch()}
        />

        <Table
          head={
            <tr>
              <th className="w-tick" />
              <th>Item</th>
              <th className="num">Outstanding</th>
              <th className="num w-qty">
                Received
              </th>
              <th className="num w-qty">
                Rejected
              </th>
              <th className="num w-money">
                Unit cost
              </th>
              <th className="w-wide">Batch &amp; expiry</th>
            </tr>
          }
        >
          {lines.map((line, index) => (
            <tr
              key={line.purchaseOrderLineId}
              data-line={line.purchaseOrderLineId}
              className={scanned === line.purchaseOrderLineId ? "success" : ""}
            >
              <td>
                <input
                  type="checkbox"
                  checked={line.include}
                  onChange={(e) => patch(index, { include: e.target.checked })}
                  aria-label={`Include ${line.sku}`}
                />
              </td>
              <td>
                {line.sku}
                {line.variantName ? <span className="sub">{line.variantName}</span> : null}
              </td>
              <td className="num muted">
                {qty(line.outstanding)} {line.receiptUomCode}
              </td>
              <td>
                <input
                  className="num"
                  inputMode="decimal"
                  disabled={!line.include}
                  value={line.receiptQty}
                  onChange={(e) => patch(index, { receiptQty: e.target.value })}
                />
              </td>
              <td>
                <input
                  className="num"
                  inputMode="decimal"
                  disabled={!line.include}
                  value={line.rejectedQty}
                  onChange={(e) => patch(index, { rejectedQty: e.target.value })}
                />
                {Number(line.rejectedQty) > 0 ? (
                  <input
                    placeholder="Why rejected?"
                    value={line.rejectionReason}
                    onChange={(e) => patch(index, { rejectionReason: e.target.value })}
                  />
                ) : null}
              </td>
              <td>
                <input
                  className="num"
                  inputMode="decimal"
                  disabled={!line.include}
                  value={line.unitCost}
                  onChange={(e) => patch(index, { unitCost: e.target.value })}
                />
              </td>
              <td>
                <input
                  placeholder="Supplier batch no. (optional)"
                  disabled={!line.include}
                  value={line.supplierBatchNo}
                  onChange={(e) => patch(index, { supplierBatchNo: e.target.value })}
                />
                {line.requiresExpiry ? (
                  <>
                    <Field label="Expires on">
                      <input
                        type="date"
                        disabled={!line.include}
                        value={line.expiresOn}
                        onChange={(e) => patch(index, { expiresOn: e.target.value })}
                      />
                    </Field>
                    <Field label="Manufactured on">
                      <input
                        type="date"
                        disabled={!line.include}
                        value={line.manufacturedOn}
                        onChange={(e) => patch(index, { manufacturedOn: e.target.value })}
                      />
                    </Field>
                  </>
                ) : (
                  <span className="small muted">No expiry tracked</span>
                )}

                {/* Serial-tracked goods: one number per unit, captured while
                    unpacking. This is the only moment the numbers are in front
                    of anyone, so it is the only moment they can be captured. */}
                {line.requiresSerials ? (
                  <Field
                    label={`Serial numbers (${parseSerials(line.serials).length} of ${acceptedFor(line)})`}
                    help="One per line, or scan them one after another."
                    error={
                      line.include && parseSerials(line.serials).length !== acceptedFor(line)
                        ? `Needs ${acceptedFor(line)}`
                        : undefined
                    }
                  >
                    <textarea
                      rows={Math.min(6, Math.max(2, acceptedFor(line)))}
                      disabled={!line.include}
                      value={line.serials}
                      placeholder={"SN-0001\nSN-0002"}
                      onChange={(e) => patch(index, { serials: e.target.value })}
                    />
                  </Field>
                ) : null}
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card title="Notes">
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <p className="small muted mt">
          The receipt is saved as a draft. Stock does not move until you POST it on the next screen —
          that separation is what lets you check the paperwork before committing.
        </p>
      </Card>
    </>
  );
}
