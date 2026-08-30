import { Link, useParams } from "react-router-dom";
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
  TextField,
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
import type { GoodsReceiptDetail } from "../../lib/types";
import { useState } from "react";

/**
 * A single delivery.
 *
 * Posting is the moment stock becomes real: batches are created, the ledger is
 * written and the purchase order's received quantities move. Before that, this
 * is only paperwork and can be corrected freely. After it, the only way back is
 * a reversal, which is why the button asks.
 */
/**
 * Correct a delivery that has not been posted.
 *
 * Keyed from a paper note with the goods still on the bench, so a misread
 * quantity or a cost that turns out to be wrong is routine. The only remedy
 * used to be cancelling the whole receipt and re-entering it.
 *
 * Lines are sent back in full — the API replaces them wholesale, matching how a
 * purchase order is edited.
 */
function EditReceipt({
  receipt,
  onClose,
  onDone,
}: {
  receipt: GoodsReceiptDetail;
  onClose: () => void;
  onDone: () => void;
}) {
  interface Row {
    variantId: string;
    sku: string;
    purchaseOrderLineId: string | null;
    receiptUomId: string;
    receiptQty: string;
    unitCost: string;
    units: { uomId: string; uomCode: string; factorToStockUom: string }[];
    stockUomId: string;
    stockUomCode: string;
  }

  const [invoiceNo, setInvoiceNo] = useState(receipt.supplierInvoiceNo ?? "");
  const [freight, setFreight] = useState(receipt.freightCharges ?? "0");
  const [rows, setRows] = useState<Row[]>(() =>
    receipt.lines.map((line) => ({
      variantId: line.variantId,
      sku: line.sku,
      purchaseOrderLineId: line.purchaseOrderLineId,
      receiptUomId: line.receiptUomId,
      receiptQty: line.receiptQty,
      unitCost: line.unitCost,
      units: [
        { uomId: line.stockUomId, uomCode: line.stockUomCode, factorToStockUom: "1" },
        ...(line.orderUnits ?? []).map((u) => ({
          uomId: u.uomId,
          uomCode: u.uomCode,
          factorToStockUom: u.factorToStockUom,
        })),
      ],
      stockUomId: line.stockUomId,
      stockUomCode: line.stockUomCode,
    })),
  );

  const save = useApiMutation<Record<string, unknown>, unknown>(
    `/goods-receipts/${receipt.id}`,
    { method: "PUT", invalidate: [["goods-receipts"], ["purchase-orders"]], onSuccess: onDone },
  );

  function patch(index: number, next: Partial<Row>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...next } : row)));
  }

  const goods = sumMoney(rows.map((row) => multiplyMoney(row.unitCost, row.receiptQty)));
  const valid = rows.length > 0 && rows.every((row) => Number(row.receiptQty) > 0);

  return (
    <Modal
      wide
      title={`Edit ${receipt.grnNumber}`}
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
                // Empty clears the field rather than leaving it as it was.
                supplierInvoiceNo: invoiceNo.trim() || null,
                freightCharges: freight.trim() || "0",
                lines: rows.map((row) => ({
                  purchaseOrderLineId: row.purchaseOrderLineId ?? undefined,
                  variantId: row.variantId,
                  receiptUomId: row.receiptUomId,
                  receiptQty: row.receiptQty,
                  unitCost: row.unitCost,
                })),
              })
            }
          >
            Save changes
          </button>
        </>
      }
    >
      <ErrorBanner error={save.error} />

      <div className="grid cols-2">
        <TextField
          label="Supplier invoice no."
          value={invoiceNo}
          onChange={(e) => setInvoiceNo(e.target.value)}
          help="Often arrives after the goods do."
        />
        <TextField
          label="Freight charges"
          className="num"
          inputMode="decimal"
          value={freight}
          onChange={(e) => setFreight(e.target.value)}
          help="Spread across the lines by value to give each its landed cost."
        />
      </div>

      <Table
        head={
          <tr>
            <th>Item</th>
            <th className="num">Quantity</th>
            <th>Unit</th>
            <th className="num">Unit cost</th>
            <th className="num">Line total</th>
          </tr>
        }
      >
        {rows.map((row, index) => (
          <tr key={row.variantId}>
            <td>{row.sku}</td>
            <td className="num">
              <input
                className="num"
                inputMode="decimal"
                style={{ width: "6rem" }}
                value={row.receiptQty}
                onChange={(e) => patch(index, { receiptQty: e.target.value })}
              />
            </td>
            <td>
              <select
                value={row.receiptUomId}
                onChange={(e) => patch(index, { receiptUomId: e.target.value })}
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
            <td className="num">{money(multiplyMoney(row.unitCost, row.receiptQty))}</td>
          </tr>
        ))}
      </Table>

      <div className="spread mt">
        <strong>Goods value</strong>
        <strong>{money(goods)}</strong>
      </div>

      {/*
        * Batches, expiry dates and serials are keyed on the receiving screen and
        * are not repeated here: they are per-batch detail rather than
        * corrections to the document, and re-entering them in a summary table
        * is how a serial list gets truncated.
        */}
      <p className="hint mt">
        Batch codes, expiry dates and serial numbers are kept as recorded. To change those, cancel
        this draft and receive it again.
      </p>
    </Modal>
  );
}

export function GoodsReceiptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSessionContext();
  const [reason, setReason] = useState("");
  const [editing, setEditing] = useState(false);

  const grn = useApi<GoodsReceiptDetail>(["goods-receipts", id], `/goods-receipts/${id}`);

  const options = {
    method: "POST" as const,
    idempotent: true,
    invalidate: [["goods-receipts"], ["purchase-orders"], ["stock"]],
  };
  const post = useApiMutation<undefined, unknown>(`/goods-receipts/${id}/post`, options);
  const cancel = useApiMutation<Record<string, unknown>, unknown>(
    `/goods-receipts/${id}/cancel`,
    options,
  );

  if (grn.isPending) return <Loading />;
  if (grn.isError) return <ErrorBanner error={grn.error} />;
  const receipt = grn.data!;

  const goodsValue = receipt.lines.reduce(
    (sum, line) =>
      sum + (Number(line.receiptQtyBase) - Number(line.rejectedQtyBase)) * Number(line.landedUnitCost),
    0,
  );

  return (
    <>
      <PageHead
        title={receipt.grnNumber}
        subtitle={
          <>
            Against <Link to={`/purchase-orders/${receipt.purchaseOrderId}`}>{receipt.poNumber}</Link>
            {" · "}
            {receipt.locationName}
          </>
        }
        actions={
          <>
            <Badge tone={statusTone(receipt.status)}>{humanise(receipt.status)}</Badge>

            {/*
              * Amendable while it is a draft, because a delivery is keyed from
              * a paper note with the pallet still on the bench and a misread
              * quantity is normal. Once posted it has created batches and moved
              * stock, and the remedy is a reversal rather than an edit.
              */}
            {receipt.status === "draft" && can("grn:write") ? (
              <button type="button" onClick={() => setEditing(true)}>
                Edit delivery
              </button>
            ) : null}

            {receipt.status === "draft" && can("grn:post") ? (
              <ConfirmButton
                label="Post receipt"
                title="Post this delivery?"
                confirmLabel="Post and move stock"
                message="This creates a batch for every line and adds the stock to this location. It cannot be undone except by a reversal."
                onConfirm={() => post.mutateAsync(undefined)}
              />
            ) : null}

            {receipt.status === "posted" && can("grn:cancel") ? (
              <ConfirmButton
                danger
                label="Reverse receipt"
                title="Reverse this posted receipt?"
                confirmLabel="Reverse"
                message="A mirror-image movement is posted, taking the stock back out. The original entries stay visible in the ledger."
                onConfirm={() => cancel.mutateAsync({ reason: reason || "Reversed" })}
              >
                <input
                  placeholder="Why is it being reversed?"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </ConfirmButton>
            ) : null}
          </>
        }
      />

      <ErrorBanner error={post.error ?? cancel.error} />

      {receipt.status === "draft" ? (
        <div className="alert warn">
          This is still a draft — no stock has moved yet. Check the quantities and costs, correct
          anything that is wrong, then post it.
        </div>
      ) : null}

      {editing ? (
        <EditReceipt
          receipt={receipt}
          onClose={() => setEditing(false)}
          onDone={() => {
            setEditing(false);
            void grn.refetch();
          }}
        />
      ) : null}

      <div className="grid cols-4 mb">
        <Card>
          <div className="stat">
            <div className="label">Goods value</div>
            <div className="value">{money(goodsValue)}</div>
            <div className="hint">At landed cost</div>
          </div>
        </Card>
        <Card>
          <div className="stat">
            <div className="label">Freight</div>
            <div className="value">{money(receipt.freightCharges)}</div>
            <div className="hint">Spread across the lines</div>
          </div>
        </Card>
        <Card>
          <div className="stat">
            <div className="label">Supplier invoice</div>
            <div className="value text sm">
              {receipt.supplierInvoiceNo ?? "—"}
            </div>
            <div className="hint">{date(receipt.supplierInvoiceDate)}</div>
          </div>
        </Card>
        <Card>
          <div className="stat">
            <div className="label">Posted</div>
            <div className="value text sm">
              {receipt.postedAt ? dateTime(receipt.postedAt) : "Not yet"}
            </div>
          </div>
        </Card>
      </div>

      <Card title="Lines" flush>
        <Table
          head={
            <tr>
              <th>Item</th>
              <th className="num">Received</th>
              <th className="num">Rejected</th>
              <th className="num">Into stock</th>
              <th className="num">Unit cost</th>
              <th className="num">Landed cost</th>
              <th>Batch</th>
            </tr>
          }
        >
          {receipt.lines.map((line) => {
            const accepted = Number(line.receiptQtyBase) - Number(line.rejectedQtyBase);
            return (
              <tr key={line.id}>
                <td>
                  {line.sku}
                  {line.variantName ? <span className="sub">{line.variantName}</span> : null}
                </td>
                <td className="num">
                  {qty(line.receiptQty)} <span className="muted small">{line.receiptUomCode}</span>
                </td>
                <td className="num">
                  {Number(line.rejectedQtyBase) > 0 ? (
                    <>
                      <Badge tone="danger">{qty(line.rejectedQtyBase)}</Badge>
                      <span className="sub">{line.rejectionReason}</span>
                    </>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td className="num">
                  <strong>{qty(String(accepted))}</strong>
                </td>
                <td className="num muted">{money(line.unitCost)}</td>
                <td className="num">{money(line.landedUnitCost)}</td>
                <td className="small">
                  {line.batchCode ?? <span className="muted">created on posting</span>}
                  {line.supplierBatchNo ? (
                    <span className="sub">supplier: {line.supplierBatchNo}</span>
                  ) : null}
                  {line.expiresOn ? <span className="sub">expires {date(line.expiresOn)}</span> : null}
                </td>
              </tr>
            );
          })}
        </Table>
      </Card>

      {receipt.notes ? (
        <Card title="Notes">
          <p>{receipt.notes}</p>
        </Card>
      ) : null}
    </>
  );
}
