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
import { date, dateTime, humanise, qty, statusTone } from "../../lib/format";
import type { TransferDetail } from "../../lib/types";

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
export function TransferDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSessionContext();
  const [received, setReceived] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");

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

      {outstanding > 0 && doc.status !== "draft" ? (
        <div className="alert warn">
          {qty(String(outstanding))} units are still in transit — dispatched but not yet received.
        </div>
      ) : null}

      <div className="grid cols-4 mb">
        <Card>
          <div className="stat">
            <div className="label">Dispatched</div>
            <div className="value" style={{ fontSize: "1rem" }}>
              {doc.dispatchedAt ? dateTime(doc.dispatchedAt) : "Not yet"}
            </div>
          </div>
        </Card>
        <Card>
          <div className="stat">
            <div className="label">Received</div>
            <div className="value" style={{ fontSize: "1rem" }}>
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
                <td className="num">{qty(line.requestedQty)}</td>
                <td className="num">{qty(line.dispatchedQty)}</td>
                <td className="num">
                  {qty(line.receivedQty)}
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
