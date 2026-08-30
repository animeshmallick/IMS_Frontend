import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { useApi, useApiList, useApiMutation } from "../../lib/hooks";
import { useSessionContext } from "../../lib/session";
import {
  Badge,
  Card,
  ConfirmButton,
  Empty,
  ErrorBanner,
  Field,
  Modal,
  PageHead,
  Pager,
  QueryState,
  Table,
  TextField,
} from "../../components/ui";
import { VariantPicker } from "../../components/VariantPicker";
import { api } from "../../lib/api";
import { date, humanise, money, multiplyMoney, qty, statusTone, sumMoney } from "../../lib/format";
import type { Location, Supplier, VariantSearchResult } from "../../lib/types";

interface ReturnListItem {
  id: string;
  returnNumber: string;
  status: string;
  supplierName: string;
  locationName: string;
  reason: string;
  expectedCreditValue: string;
  creditedValue: string | null;
  postedAt: string | null;
  createdAt: string;
}

interface ReturnLine {
  id: string;
  sku: string;
  variantName: string | null;
  batchCode: string;
  expiresOn: string | null;
  qtyBase: string;
  unitCost: string;
  lineValue: string;
  reason: string | null;
}

interface ReturnDetail extends ReturnListItem {
  supplierId: string;
  locationId: string;
  creditNoteReference: string | null;
  creditedAt: string | null;
  carrierReference: string | null;
  createdBy: string;
  approvedBy: string | null;
  rejectedReason: string | null;
  notes: string | null;
  lines: ReturnLine[];
}

interface OutstandingCredit {
  supplierId: string;
  supplierName: string;
  returns: number;
  expectedCredit: string;
  oldestPostedAt: string;
}

/**
 * Goods going back to a supplier.
 *
 * Deliberately not a stock write-off. A write-off says "we lost this" and lands
 * in your shrinkage report; a supplier return says "this was never fit to sell
 * and they owe us for it". Conflating the two makes shrinkage blame the shop for
 * its suppliers' quality problems, and quietly forgets money owed.
 */
export function SupplierReturns() {
  const { can } = useSessionContext();
  const [status, setStatus] = useState("");
  const [awaitingCredit, setAwaitingCredit] = useState(false);
  const [offset, setOffset] = useState(0);
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const limit = 25;

  const returns = useApiList<ReturnListItem>(["purchase-returns"], "/purchase-returns", {
    status: status || undefined,
    awaitingCredit: awaitingCredit || undefined,
    limit,
    offset,
  });

  const owed = useApi<OutstandingCredit[]>(
    ["purchase-returns", "outstanding"],
    "/purchase-returns/outstanding-credits",
    undefined,
    { enabled: can("report:financial") },
  );

  const totalOwed = (owed.data ?? []).reduce((sum, row) => sum + Number(row.expectedCredit), 0);

  return (
    <>
      <PageHead
        title="Supplier returns"
        subtitle="Faulty or wrong goods going back to the wholesaler — and the credit they owe you for it"
        actions={
          can("purchase_return:write") ? (
            <button type="button" className="primary" onClick={() => setCreating(true)}>
              New return
            </button>
          ) : null
        }
      />

      {can("report:financial") && totalOwed > 0 ? (
        <Card title="Credit your suppliers still owe" flush>
          <Table
            head={
              <tr>
                <th>Supplier</th>
                <th className="num">Returns</th>
                <th className="num">Owed</th>
                <th>Oldest</th>
              </tr>
            }
          >
            {(owed.data ?? []).map((row) => (
              <tr key={row.supplierId}>
                <td>{row.supplierName}</td>
                <td className="num">{row.returns}</td>
                <td className="num">
                  <strong>{money(row.expectedCredit)}</strong>
                </td>
                <td className="small muted">{date(row.oldestPostedAt)}</td>
              </tr>
            ))}
          </Table>
          <div className="card-body">
            <p className="small muted">
              Goods sent back with no credit note recorded against them. Chase these — a credit
              nobody is tracking is a credit nobody collects.
            </p>
          </div>
        </Card>
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
            {["draft", "posted", "rejected", "cancelled"].map((s) => (
              <option key={s} value={s}>
                {humanise(s)}
              </option>
            ))}
          </select>
        </Field>
        <label className="check">
            <input
              type="checkbox"
              checked={awaitingCredit}
              onChange={(e) => {
                setAwaitingCredit(e.target.checked);
                setOffset(0);
              }}
            />
            Only those awaiting a credit note
          </label>
      </div>

      <Card flush>
        <QueryState
          query={{ ...returns, data: returns.data?.items }}
          empty={
            <Empty
              icon={<RotateCcw size={14} aria-hidden />}
              title="No supplier returns"
              hint="Nothing has been sent back to a wholesaler."
            />
          }
        >
          <Table
            head={
              <tr>
                <th>Number</th>
                <th>Supplier</th>
                <th>Reason</th>
                <th>Status</th>
                <th className="num">Expected credit</th>
                <th className="num">Credited</th>
              </tr>
            }
          >
            {(returns.data?.items ?? []).map((row) => {
              const shortfall =
                row.creditedValue !== null
                  ? Number(row.expectedCreditValue) - Number(row.creditedValue)
                  : null;

              return (
                <tr key={row.id} className="clickable" onClick={() => setViewing(row.id)}>
                  <td>
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        setViewing(row.id);
                      }}
                    >
                      {row.returnNumber}
                    </a>
                    <span className="sub">{date(row.createdAt)}</span>
                  </td>
                  <td className="small">
                    {row.supplierName}
                    <span className="sub">{row.locationName}</span>
                  </td>
                  <td className="small">{row.reason}</td>
                  <td>
                    <Badge tone={statusTone(row.status)}>{humanise(row.status)}</Badge>
                  </td>
                  <td className="num">{money(row.expectedCreditValue)}</td>
                  <td className="num">
                    {row.creditedValue === null ? (
                      row.status === "posted" ? (
                        <Badge tone="warn">Awaiting</Badge>
                      ) : (
                        <span className="muted">—</span>
                      )
                    ) : (
                      <>
                        {money(row.creditedValue)}
                        {shortfall !== null && Math.abs(shortfall) > 0.001 ? (
                          <span className="sub">
                            <Badge tone="danger">short {money(shortfall)}</Badge>
                          </span>
                        ) : null}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        </QueryState>

        <div className="card-foot">
          <Pager
            total={returns.data?.total ?? 0}
            limit={limit}
            offset={offset}
            onChange={setOffset}
          />
        </div>
      </Card>

      {creating ? (
        <NewReturnModal
          onClose={() => setCreating(false)}
          onDone={(id) => {
            setCreating(false);
            void returns.refetch();
            setViewing(id);
          }}
        />
      ) : null}

      {viewing ? (
        <ReturnDetailModal
          id={viewing}
          onClose={() => setViewing(null)}
          onChanged={() => {
            void returns.refetch();
            void owed.refetch();
          }}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------- create */

interface DraftLine {
  variantId: string;
  sku: string;
  productName: string;
  batchId: string;
  batchCode: string;
  available: string;
  unitCost: string;
  qtyBase: string;
  reason: string;
}

interface VariantBatch {
  locationId: string;
  batchId: string;
  batchCode: string;
  expiresOn: string | null;
  unitCost: string;
  available: string;
}

function NewReturnModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (id: string) => void;
}) {
  const { activeLocation } = useSessionContext();
  const [supplierId, setSupplierId] = useState("");
  const [locationId, setLocationId] = useState(activeLocation?.id ?? "");
  const [reason, setReason] = useState("");
  const [carrierReference, setCarrier] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [picking, setPicking] = useState<{ variant: VariantSearchResult; batches: VariantBatch[] } | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);

  const suppliers = useApi<{ items?: Supplier[] } | Supplier[]>(
    ["partners", "suppliers"],
    "/partners/suppliers",
    { limit: 100 },
  );
  const supplierList = Array.isArray(suppliers.data) ? suppliers.data : (suppliers.data?.items ?? []);
  const locations = useApi<Location[]>(["locations"], "/locations");

  const create = useApiMutation<Record<string, unknown>, { id: string }>("/purchase-returns", {
    method: "POST",
    idempotent: true,
    invalidate: [["purchase-returns"], ["stock"]],
    onSuccess: (result) => onDone(result.id),
  });

  /*
   * Returning stock needs the BATCH, not just the product: cost lives on the
   * batch, so that is what tells you what the supplier owes.
   */
  async function pickVariant(variant: VariantSearchResult) {
    setLoadError(null);
    try {
      const stock = await api<{ batches: VariantBatch[] }>(`/stock/variants/${variant.variantId}`);
      const here = stock.batches.filter(
        (b) => b.locationId === locationId && Number(b.available) > 0,
      );
      if (here.length === 0) {
        setLoadError(new Error(`${variant.sku} has no stock at this location to send back.`));
        return;
      }
      setPicking({ variant, batches: here });
    } catch (error) {
      setLoadError(error);
    }
  }

  const total = sumMoney(lines.map((l) => multiplyMoney(l.unitCost, l.qtyBase)));
  const ready = supplierId && locationId && reason.trim().length >= 3 && lines.length > 0;

  return (
    <Modal
      title="Send goods back to a supplier"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={!ready || create.isPending}
            onClick={() =>
              create.mutate({
                supplierId,
                locationId,
                reason,
                carrierReference: carrierReference || undefined,
                lines: lines.map((l) => ({
                  variantId: l.variantId,
                  batchId: l.batchId,
                  qtyBase: l.qtyBase,
                  reason: l.reason || undefined,
                })),
              })
            }
          >
            {create.isPending ? "Saving..." : "Raise return"}
          </button>
        </>
      }
    >
      <ErrorBanner error={create.error ?? loadError} />

      <div className="grid cols-2">
        <Field label="Supplier">
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">Choose a supplier</option>
            {supplierList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Sending from">
          <select
            value={locationId}
            onChange={(e) => {
              setLocationId(e.target.value);
              setLines([]);
            }}
          >
            <option value="">Choose a location</option>
            {(locations.data ?? [])
              .filter((l) => l.isPhysical && !l.isSystem)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </select>
        </Field>
      </div>

      <TextField
        label="Why are these going back?"
        help="Appears on the supplier scorecard, so be specific."
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <TextField
        label="Courier or collection reference"
        value={carrierReference}
        onChange={(e) => setCarrier(e.target.value)}
      />

      {locationId ? (
        <>
          <h3 className="mt mb">Add items</h3>
          <VariantPicker
            onPick={(variant) => void pickVariant(variant)}
            showPrice={false}
            placeholder="Search the product going back"
          />
        </>
      ) : null}

      {picking ? (
        <div className="mt">
          <p className="small">
            Which batch of <strong>{picking.variant.sku}</strong>?
          </p>
          <div className="search-results">
            {picking.batches.map((b) => (
              <button
                type="button"
                key={b.batchId}
                onClick={() => {
                  setLines((c) => [
                    ...c,
                    {
                      variantId: picking.variant.variantId,
                      sku: picking.variant.sku,
                      productName: picking.variant.productName,
                      batchId: b.batchId,
                      batchCode: b.batchCode,
                      available: b.available,
                      unitCost: b.unitCost,
                      qtyBase: "1",
                      reason: "",
                    },
                  ]);
                  setPicking(null);
                }}
              >
                <div className="spread">
                  <span>
                    {b.batchCode}
                    <span className="sub">
                      cost {money(b.unitCost)}
                      {b.expiresOn ? ` · expires ${date(b.expiresOn)}` : ""}
                    </span>
                  </span>
                  <span className="nowrap small">{qty(b.available)} available</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {lines.length > 0 ? (
        <>
          <Table
            head={
              <tr>
                <th>Item</th>
                <th className="num">Available</th>
                <th className="num w-qty">
                  Send back
                </th>
                <th className="num">Value</th>
                <th />
              </tr>
            }
          >
            {lines.map((line, index) => {
              const tooMuch = Number(line.qtyBase) > Number(line.available);
              return (
                <tr key={`${line.batchId}-${index}`}>
                  <td>
                    {line.sku}
                    <span className="sub">{line.batchCode}</span>
                  </td>
                  <td className="num muted">{qty(line.available)}</td>
                  <td>
                    <input
                      className="num"
                      inputMode="decimal"
                      value={line.qtyBase}
                      onChange={(e) =>
                        setLines((c) =>
                          c.map((l, i) => (i === index ? { ...l, qtyBase: e.target.value } : l)),
                        )
                      }
                    />
                    {tooMuch ? <span className="err">Only {qty(line.available)} there</span> : null}
                  </td>
                  <td className="num">{money(multiplyMoney(line.unitCost, line.qtyBase))}</td>
                  <td>
                    <button
                      type="button"
                      className="ghost sm"
                      onClick={() => setLines((c) => c.filter((_, i) => i !== index))}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </Table>

          <div className="spread mt">
            <span className="muted small">Credit to claim, at the cost you paid</span>
            <strong className="num">{money(total)}</strong>
          </div>
        </>
      ) : null}

      <p className="small muted mt">
        This is not a write-off. The stock goes back to the supplier and the value becomes a
        credit they owe you — it will not appear in your shrinkage figures.
      </p>
    </Modal>
  );
}

/* ------------------------------------------------------------------- detail */

function ReturnDetailModal({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { can, session } = useSessionContext();
  const [creditValue, setCreditValue] = useState("");
  const [creditRef, setCreditRef] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  const doc = useApi<ReturnDetail>(["purchase-returns", id], `/purchase-returns/${id}`);

  const options = { method: "POST" as const, invalidate: [["purchase-returns"], ["stock"]] };
  const approve = useApiMutation<undefined, unknown>(`/purchase-returns/${id}/approve`, {
    ...options,
    idempotent: true,
    onSuccess: () => {
      void doc.refetch();
      onChanged();
    },
  });
  const reject = useApiMutation<Record<string, unknown>, unknown>(
    `/purchase-returns/${id}/reject`,
    { ...options, onSuccess: () => { void doc.refetch(); onChanged(); } },
  );
  const credit = useApiMutation<Record<string, unknown>, unknown>(
    `/purchase-returns/${id}/credit`,
    { ...options, onSuccess: () => { void doc.refetch(); onChanged(); } },
  );

  const r = doc.data;
  const raisedByMe = r?.createdBy === session.user.id;
  const shortfall =
    r?.creditedValue != null ? Number(r.expectedCreditValue) - Number(r.creditedValue) : null;

  return (
    <Modal title={r?.returnNumber ?? "Supplier return"} onClose={onClose}>
      <QueryState query={doc}>
        {r ? (
          <>
            <ErrorBanner error={approve.error ?? reject.error ?? credit.error} />

            <div className="spread mb">
              <div>
                <strong>{r.supplierName}</strong>
                <span className="sub">
                  from {r.locationName} · {r.reason}
                </span>
              </div>
              <Badge tone={statusTone(r.status)}>{humanise(r.status)}</Badge>
            </div>

            {r.status === "draft" && raisedByMe ? (
              <div className="alert warn">
                You raised this return, so you cannot approve it. Someone else has to send the
                goods back — the same control that applies to a write-off.
              </div>
            ) : null}

            {r.rejectedReason ? (
              <div className="alert error">Rejected: {r.rejectedReason}</div>
            ) : null}

            <Table
              head={
                <tr>
                  <th>Item</th>
                  <th>Batch</th>
                  <th className="num">Qty</th>
                  <th className="num">Unit cost</th>
                  <th className="num">Value</th>
                </tr>
              }
            >
              {r.lines.map((line) => (
                <tr key={line.id}>
                  <td>
                    {line.sku}
                    {line.reason ? <span className="sub">{line.reason}</span> : null}
                  </td>
                  <td className="small">{line.batchCode}</td>
                  <td className="num">{qty(line.qtyBase)}</td>
                  <td className="num muted">{money(line.unitCost)}</td>
                  <td className="num">{money(line.lineValue)}</td>
                </tr>
              ))}
            </Table>

            <div className="spread mt mb">
              <span className="muted small">Credit claimed</span>
              <strong className="num">{money(r.expectedCreditValue)}</strong>
            </div>

            {r.creditedValue !== null ? (
              <div className={shortfall && Math.abs(shortfall) > 0.001 ? "alert warn" : "alert success"}>
                Credited {money(r.creditedValue)}
                {r.creditNoteReference ? ` (note ${r.creditNoteReference})` : ""} on{" "}
                {date(r.creditedAt)}.
                {shortfall && Math.abs(shortfall) > 0.001
                  ? ` That is ${money(shortfall)} short of what was claimed.`
                  : ""}
              </div>
            ) : null}

            {/* ------------------------------------------------------ actions */}
            <div className="btn-row mt">
              {r.status === "draft" && can("purchase_return:approve") && !raisedByMe ? (
                <>
                  <ConfirmButton
                    label="Approve and send back"
                    title="Send these goods back?"
                    confirmLabel="Send back"
                    message="The stock leaves this location now and goes back to the supplier. This is recorded in the ledger and cannot be undone except by receiving it again."
                    onConfirm={() => approve.mutateAsync(undefined)}
                  />
                  <ConfirmButton
                    danger
                    label="Reject"
                    message="Send this back to whoever raised it."
                    onConfirm={() => reject.mutateAsync({ reason: rejectReason || "Rejected" })}
                  >
                    <input
                      placeholder="Reason"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                    />
                  </ConfirmButton>
                </>
              ) : null}
            </div>

            {r.status === "posted" && r.creditedValue === null && can("purchase_return:credit") ? (
              <>
                <h3 className="mt">Record the credit note</h3>
                <div className="inline-form">
                  <Field label="Amount credited">
                    <input
                      className="num"
                      inputMode="decimal"
                      placeholder={r.expectedCreditValue}
                      value={creditValue}
                      onChange={(e) => setCreditValue(e.target.value)}
                    />
                  </Field>
                  <Field label="Credit note reference">
                    <input value={creditRef} onChange={(e) => setCreditRef(e.target.value)} />
                  </Field>
                  <button
                    type="button"
                    className="primary"
                    disabled={!creditValue || credit.isPending}
                    onClick={() =>
                      credit.mutate({
                        creditedValue: creditValue,
                        creditNoteReference: creditRef || undefined,
                      })
                    }
                  >
                    {credit.isPending ? "Saving..." : "Record credit"}
                  </button>
                </div>
                <p className="small muted mt">
                  Enter what the supplier actually credited. If it is less than claimed, the
                  difference is recorded as a shortfall rather than quietly absorbed.
                </p>
              </>
            ) : null}
          </>
        ) : null}
      </QueryState>
    </Modal>
  );
}
