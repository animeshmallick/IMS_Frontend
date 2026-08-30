import { useState } from "react";
import { useParams } from "react-router-dom";
import { useApi, useApiMutation } from "../../lib/hooks";
import { useSessionContext } from "../../lib/session";
import { useUnits } from "../../lib/use-units";
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
import { date, dateTime, humanise, qty, statusTone } from "../../lib/format";
import type { TransferDetail, VariantSearchResult } from "../../lib/types";
import { VariantPicker } from "../../components/VariantPicker";

/**
 * One transfer, through its two legs.
 *
 * Dispatch puts the stock into `transit`; receipt takes it out. A short receipt
 * therefore leaves a real balance sitting in transit, and the only honest way to
 * clear it is `close-shortage`, which writes the difference off to scrap. That
 * is gated on approving adjustments rather than on receiving, because it
 * recognises a stock LOSS — the person who unloads the van does not get to sign
 * off that the missing units are gone.
 */
/**
 * Amend a transfer that has not been dispatched.
 *
 * Edited as a REQUEST, not as the stored lines.
 *
 * The lines on the record are per-batch allocations: asking for 100 of a SKU
 * can produce three lines if the allocator had to draw on three batches, and
 * which batches those are is FEFO's decision rather than the user's. So the
 * dialog aggregates them back into one row per SKU, and the server re-allocates
 * from scratch when it saves. Editing the stored rows directly would mean
 * hand-picking batches, which is neither what the user meant nor safe.
 */
function EditTransfer({
  doc,
  onClose,
  onDone,
}: {
  doc: TransferDetail;
  onClose: () => void;
  onDone: () => void;
}) {
  interface Row {
    variantId: string;
    sku: string;
    variantName: string | null;
    stockUomId: string;
    stockUomCode: string;
    qty: string;
  }

  const [rows, setRows] = useState<Row[]>(() => {
    // One row per SKU, summing whatever batches it was allocated across.
    const byVariant = new Map<string, Row>();
    for (const line of doc.lines) {
      const found = byVariant.get(line.variantId);
      if (found) {
        found.qty = String(Number(found.qty) + Number(line.requestedQty));
      } else {
        byVariant.set(line.variantId, {
          variantId: line.variantId,
          sku: line.sku,
          variantName: line.variantName,
          stockUomId: line.stockUomId,
          stockUomCode: line.stockUomCode,
          qty: String(Number(line.requestedQty)),
        });
      }
    }
    return [...byVariant.values()];
  });

  const save = useApiMutation<Record<string, unknown>, unknown>(
    `/stock-transfers/${doc.id}`,
    { method: "PUT", invalidate: [["transfers"], ["stock"]], onSuccess: onDone },
  );

  function add(variant: VariantSearchResult) {
    // The allocator refuses a SKU twice on one transfer, so adding one that is
    // already here edits the existing row rather than making a second.
    if (rows.some((row) => row.variantId === variant.variantId)) return;
    setRows((current) => [
      ...current,
      {
        variantId: variant.variantId,
        sku: variant.sku,
        variantName: variant.variantName,
        stockUomId: variant.stockUomId,
        stockUomCode: variant.stockUomCode,
        qty: "1",
      },
    ]);
  }

  const valid = rows.length > 0 && rows.every((row) => Number(row.qty) > 0);

  return (
    <Modal
      wide
      title={`Edit ${doc.transferNumber}`}
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
                fromLocationId: doc.fromLocationId,
                toLocationId: doc.toLocationId,
                lines: rows.map((row) => ({
                  variantId: row.variantId,
                  requestUomId: row.stockUomId,
                  requestQty: row.qty,
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

      {/*
        * Said before the edit, not after it fails.
        *
        * Saving releases the stock this transfer is holding and reserves it
        * again from scratch, so a SKU someone else has since taken can come
        * back as "insufficient stock" on a line that was fine a minute ago.
        * The transfer keeps what it had if that happens — the whole save is one
        * transaction — but the refusal is much less alarming when it was
        * expected.
        */}
      <div className="alert info">
        Saving re-reserves the stock for this transfer. If something has been sold or moved in the
        meantime, a line may no longer be available — nothing is changed if that happens.
      </div>

      <Table
        head={
          <tr>
            <th>Item</th>
            <th className="num">Quantity</th>
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
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <input
                  className="num"
                  inputMode="decimal"
                  style={{ width: "7rem" }}
                  value={row.qty}
                  onChange={(e) =>
                    setRows((current) =>
                      current.map((r, i) => (i === index ? { ...r, qty: e.target.value } : r)),
                    )
                  }
                />
                <span className="muted small">{row.stockUomCode}</span>
              </div>
            </td>
            <td>
              <button
                type="button"
                className="sm subtle-danger"
                onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
              >
                Remove
              </button>
            </td>
          </tr>
        ))}
      </Table>

      {rows.length === 0 ? (
        <div className="alert warn">
          A transfer needs at least one line. Add one below, or cancel to leave it unchanged.
        </div>
      ) : null}

      <hr />

      <VariantPicker onPick={add} placeholder="Search a product to add" />

      <p className="hint mt">
        Quantities are in each product&rsquo;s stock unit. Which batches are sent is decided when
        you save, oldest first.
      </p>
    </Modal>
  );
}

export function TransferDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSessionContext();
  const units = useUnits();
  const [received, setReceived] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [editing, setEditing] = useState(false);

  const transfer = useApi<TransferDetail>(["transfers", id], `/stock-transfers/${id}`);

  const options = {
    method: "POST" as const,
    idempotent: true,
    invalidate: [["transfers"], ["stock"]],
  };
  type Body = Record<string, unknown> | undefined;

  const dispatch = useApiMutation<Body, unknown>(`/stock-transfers/${id}/dispatch`, options);
  const receive = useApiMutation<Body, unknown>(`/stock-transfers/${id}/receive`, options);
  const closeShort = useApiMutation<Body, unknown>(
    `/stock-transfers/${id}/close-shortage`,
    options,
  );
  const cancel = useApiMutation<Body, unknown>(`/stock-transfers/${id}/cancel`, options);

  if (transfer.isPending) return <Loading />;
  if (transfer.isError) return <ErrorBanner error={transfer.error} />;
  const doc = transfer.data!;

  const canDispatch = doc.status === "draft" && can("stock:transfer");
  const canReceive =
    ["dispatched", "partially_received"].includes(doc.status) && can("stock:receive_transfer");

  const outstanding = doc.lines.reduce(
    (sum, line) => sum + (Number(line.dispatchedQty) - Number(line.receivedQty)),
    0,
  );

  return (
    <>
      <PageHead
        title={doc.transferNumber}
        subtitle={
          <>
            {doc.fromName} → {doc.toName}
            {doc.carrierReference ? ` · ${doc.carrierReference}` : ""}
          </>
        }
        actions={
          <>
            <Badge tone={statusTone(doc.status)}>{humanise(doc.status)}</Badge>

            {/*
              * Amendable until it is dispatched. After that the stock has
              * physically left and sits in transit, so the document describes a
              * van already on the road.
              */}
            {doc.status === "draft" && can("stock:transfer") ? (
              <button type="button" onClick={() => setEditing(true)}>
                Edit transfer
              </button>
            ) : null}

            {canDispatch ? (
              <ConfirmButton
                label="Dispatch"
                title="Dispatch this transfer?"
                confirmLabel="Dispatch"
                message="The stock leaves the source now and sits in transit until it is received at the other end."
                onConfirm={() => dispatch.mutateAsync({ lines: [] })}
              />
            ) : null}

            {canReceive ? (
              <ConfirmButton
                label="Receive all"
                title="Receive everything dispatched?"
                confirmLabel="Receive in full"
                message="Records that every dispatched unit arrived. If anything is missing, enter the quantities line by line instead."
                onConfirm={() =>
                  receive.mutateAsync({
                    lines: doc.lines
                      .filter((line) => Number(line.dispatchedQty) > Number(line.receivedQty))
                      .map((line) => ({
                        lineId: line.id,
                        receivedQty: String(
                          Number(line.dispatchedQty) - Number(line.receivedQty),
                        ),
                      })),
                  })
                }
              />
            ) : null}

            {doc.status === "partially_received" && outstanding > 0 && can("stock:adjust_approve") ? (
              <ConfirmButton
                danger
                label="Close shortage"
                title="Write off the missing stock?"
                confirmLabel="Write off"
                message="The units still in transit are written off to scrap as a stock loss. This is not a receipt — it recognises that they are gone."
                onConfirm={() => closeShort.mutateAsync({ reason: reason || "Shortage on arrival" })}
              >
                <input
                  placeholder="What happened to the missing stock?"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </ConfirmButton>
            ) : null}

            {doc.status === "draft" && can("stock:transfer") ? (
              <ConfirmButton
                danger
                label="Cancel"
                message="Cancel this transfer and release the reserved stock back to the source."
                onConfirm={() => cancel.mutateAsync({ reason: reason || "Cancelled" })}
              />
            ) : null}
          </>
        }
      />

      <ErrorBanner
        error={dispatch.error ?? receive.error ?? closeShort.error ?? cancel.error}
      />

      {doc.status === "draft" ? (
        <div className="alert warn">
          Stock is reserved at {doc.fromName} but has not moved. It cannot be sold at the counter
          while this transfer is open.
        </div>
      ) : null}

      {editing ? (
        <EditTransfer
          doc={doc}
          onClose={() => setEditing(false)}
          onDone={() => {
            setEditing(false);
            void transfer.refetch();
          }}
        />
      ) : null}

      {outstanding > 0 && doc.status !== "draft" ? (
        <div className="alert warn">
          {qty(String(outstanding))} units are still in transit — dispatched but not yet received.
        </div>
      ) : null}

      <div className="grid cols-4 mb">
        <Card>
          <div className="stat">
            <div className="label">Dispatched</div>
            <div className="value text sm">
              {doc.dispatchedAt ? dateTime(doc.dispatchedAt) : "Not yet"}
            </div>
          </div>
        </Card>
        <Card>
          <div className="stat">
            <div className="label">Received</div>
            <div className="value text sm">
              {doc.receivedAt ? dateTime(doc.receivedAt) : "Not yet"}
            </div>
          </div>
        </Card>
        <Card>
          <div className="stat">
            <div className="label">Lines</div>
            <div className="value">{doc.lines.length}</div>
          </div>
        </Card>
        <Card>
          <div className="stat">
            <div className="label">In transit</div>
            <div className="value">{qty(String(outstanding))}</div>
          </div>
        </Card>
      </div>

      <Card title="Items" flush>
        <Table
          head={
            <tr>
              <th>Item</th>
              <th>Batch</th>
              <th className="num">Requested</th>
              <th className="num">Dispatched</th>
              <th className="num">Received</th>
              {canReceive ? <th className="num">Receiving now</th> : null}
            </tr>
          }
        >
          {doc.lines.map((line) => {
            const pending = Number(line.dispatchedQty) - Number(line.receivedQty);
            return (
              <tr key={line.id}>
                <td>
                  {line.sku}
                  {line.variantName ? <span className="sub">{line.variantName}</span> : null}
                </td>
                <td className="small">
                  {line.batchCode ?? <span className="muted">chosen at dispatch</span>}
                  {line.expiresOn ? <span className="sub">expires {date(line.expiresOn)}</span> : null}
                </td>
                <td className="num">{units.format(line.requestedQty, line.stockUomCode)}</td>
                <td className="num">{units.format(line.dispatchedQty, line.stockUomCode)}</td>
                <td className="num">
                  {units.format(line.receivedQty, line.stockUomCode)}
                  {pending > 0 && doc.status !== "draft" ? (
                    <span className="sub">
                      <Badge tone="warn">{qty(String(pending))} outstanding</Badge>
                    </span>
                  ) : null}
                </td>
                {canReceive ? (
                  <td>
                    <input
                      className="num"
                      inputMode="decimal"
                      placeholder={String(pending)}
                      value={received[line.id] ?? ""}
                      onChange={(e) =>
                        setReceived((current) => ({ ...current, [line.id]: e.target.value }))
                      }
                    />
                  </td>
                ) : null}
              </tr>
            );
          })}
        </Table>

        {canReceive ? (
          <div className="card-body">
            <button
              type="button"
              className="primary"
              disabled={
                receive.isPending ||
                !Object.values(received).some((value) => Number(value) > 0)
              }
              onClick={() =>
                receive.mutate({
                  lines: Object.entries(received)
                    .filter(([, value]) => Number(value) > 0)
                    .map(([lineId, receivedQty]) => ({ lineId, receivedQty })),
                })
              }
            >
              {receive.isPending ? "Receiving..." : "Receive entered quantities"}
            </button>
            <p className="small muted mt">
              Enter what actually came off the vehicle. Anything short stays in transit until it is
              either received later or written off.
            </p>
          </div>
        ) : null}
      </Card>
    </>
  );
}
