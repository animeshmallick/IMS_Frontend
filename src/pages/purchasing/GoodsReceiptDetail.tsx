import { Link, useParams } from "react-router-dom";
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
export function GoodsReceiptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSessionContext();
  const [reason, setReason] = useState("");

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
          This is still a draft — no stock has moved yet. Check the quantities and costs, then post it.
        </div>
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
