import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi, useApiMutation } from "../../lib/hooks";
import { useSessionContext } from "../../lib/session";
import { Card, ErrorBanner, Field, PageHead, SelectField, Table } from "../../components/ui";
import { VariantPicker } from "../../components/VariantPicker";
import { api } from "../../lib/api";
import { date, money, qty } from "../../lib/format";
import type { AdjustmentReason, Location, VariantSearchResult } from "../../lib/types";

interface VariantBatch {
  locationId: string;
  locationName: string;
  batchId: string;
  batchCode: string;
  expiresOn: string | null;
  unitCost: string;
  onHand: string;
  available: string;
}

interface DraftLine {
  variantId: string;
  sku: string;
  productName: string;
  batchId: string;
  batchCode: string;
  available: string;
  unitCost: string;
  /** Signed: negative writes stock off, positive books it in. */
  qtyDelta: string;
  notes: string;
}

const REASONS: { value: AdjustmentReason; label: string; direction: "out" | "in" }[] = [
  { value: "damaged", label: "Damaged", direction: "out" },
  { value: "lost", label: "Lost", direction: "out" },
  { value: "expired", label: "Expired", direction: "out" },
  { value: "theft", label: "Theft", direction: "out" },
  { value: "sample", label: "Given as a sample", direction: "out" },
  { value: "internal_use", label: "Used internally", direction: "out" },
  { value: "found", label: "Found — stock nobody recorded", direction: "in" },
  { value: "correction", label: "Correction", direction: "out" },
];

/**
 * Raise a stock adjustment.
 *
 * The reason is not a note — it is what the shrinkage report groups by, because
 * damage, theft and expiry are three different problems with three different
 * fixes. Direction follows the SIGN of the quantity: negative goes to scrap,
 * positive comes from variance, and the reason picked here sets the default so
 * nobody has to think about the convention.
 */
export function NewAdjustment() {
  const navigate = useNavigate();
  const { activeLocation } = useSessionContext();

  const [locationId, setLocationId] = useState(activeLocation?.id ?? "");
  const [reason, setReason] = useState<AdjustmentReason>("damaged");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [picking, setPicking] = useState<{ variant: VariantSearchResult; batches: VariantBatch[] } | null>(
    null,
  );
  const [loadError, setLoadError] = useState<unknown>(null);

  const locations = useApi<Location[]>(["locations"], "/locations");

  const create = useApiMutation<Record<string, unknown>, { id: string }>("/stock-adjustments", {
    method: "POST",
    idempotent: true,
    invalidate: [["adjustments"], ["stock"]],
    onSuccess: (result) => navigate(`/adjustments/${result.id}`),
  });

  const outward = REASONS.find((r) => r.value === reason)?.direction === "out";

  /*
   * A write-off must name the batch the stock is leaving, because cost and
   * expiry live on the batch — "remove 5" is not an instruction the ledger can
   * carry out. So picking a product loads its batches at this location.
   */
  async function pickVariant(variant: VariantSearchResult) {
    setLoadError(null);
    try {
      const stock = await api<{ batches: VariantBatch[] }>(`/stock/variants/${variant.variantId}`);
      const here = stock.batches.filter((b) => b.locationId === locationId);
      if (here.length === 0) {
        setLoadError(
          new Error(`${variant.sku} has no stock at this location, so there is nothing to adjust.`),
        );
        return;
      }
      setPicking({ variant, batches: here });
    } catch (error) {
      setLoadError(error);
    }
  }

  function addLine(variant: VariantSearchResult, batch: VariantBatch) {
    setLines((current) => [
      ...current,
      {
        variantId: variant.variantId,
        sku: variant.sku,
        productName: variant.productName,
        batchId: batch.batchId,
        batchCode: batch.batchCode,
        available: batch.available,
        unitCost: batch.unitCost,
        qtyDelta: outward ? "-1" : "1",
        notes: "",
      },
    ]);
    setPicking(null);
  }

  const ready =
    locationId && lines.length > 0 && lines.every((l) => Number(l.qtyDelta) !== 0);

  return (
    <>
      <PageHead
        title="Raise a stock adjustment"
        subtitle="Saved for approval — someone else has to sign it off before stock moves"
        actions={
          <>
            <button type="button" onClick={() => navigate("/adjustments")}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              disabled={!ready || create.isPending}
              onClick={() =>
                create.mutate({
                  locationId,
                  reason,
                  notes: notes || undefined,
                  lines: lines.map((l) => ({
                    variantId: l.variantId,
                    batchId: l.batchId,
                    qtyDelta: l.qtyDelta,
                    notes: l.notes || undefined,
                  })),
                })
              }
            >
              {create.isPending ? "Saving..." : "Save for approval"}
            </button>
          </>
        }
      />

      <ErrorBanner error={create.error ?? loadError} />

      <div className="grid cols-2">
        <Card title="Why is stock changing?">
          <SelectField
            label="Location"
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
          </SelectField>

          <SelectField
            label="Reason"
            help="This is what the shrinkage report groups by."
            value={reason}
            onChange={(e) => setReason(e.target.value as AdjustmentReason)}
          >
            {REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </SelectField>

          <Field label="Notes">
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </Card>

        <Card title="Add items">
          {locationId ? (
            <VariantPicker
              onPick={(variant) => void pickVariant(variant)}
              showPrice={false}
              placeholder="Search the product being adjusted"
            />
          ) : (
            <p className="muted">Choose a location first.</p>
          )}

          {picking ? (
            <div className="mt">
              <p className="small">
                Which batch of <strong>{picking.variant.sku}</strong>?
              </p>
              <div className="search-results">
                {picking.batches.map((batch) => (
                  <button type="button" key={batch.batchId} onClick={() => addLine(picking.variant, batch)}>
                    <div className="spread">
                      <span>
                        {batch.batchCode}
                        <span className="sub">
                          {batch.expiresOn ? `expires ${date(batch.expiresOn)}` : "no expiry"} ·{" "}
                          {money(batch.unitCost)} each
                        </span>
                      </span>
                      <span className="nowrap small">{qty(batch.available)} available</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      </div>

      <Card title={`Lines (${lines.length})`} flush>
        {lines.length === 0 ? (
          <p className="empty">Nothing added yet.</p>
        ) : (
          <Table
            head={
              <tr>
                <th>Item</th>
                <th>Batch</th>
                <th className="num">Available</th>
                <th className="num w-money">
                  Change
                </th>
                <th className="num">Cost impact</th>
                <th>Note</th>
                <th />
              </tr>
            }
          >
            {lines.map((line, index) => {
              const delta = Number(line.qtyDelta);
              const tooMuch = delta < 0 && Math.abs(delta) > Number(line.available);
              return (
                <tr key={`${line.batchId}-${index}`}>
                  <td>
                    {line.sku}
                    <span className="sub">{line.productName}</span>
                  </td>
                  <td className="small">{line.batchCode}</td>
                  <td className="num muted">{qty(line.available)}</td>
                  <td>
                    <input
                      className="num"
                      inputMode="decimal"
                      value={line.qtyDelta}
                      onChange={(e) =>
                        setLines((c) =>
                          c.map((l, i) => (i === index ? { ...l, qtyDelta: e.target.value } : l)),
                        )
                      }
                    />
                    {tooMuch ? (
                      <span className="err">Only {qty(line.available)} available</span>
                    ) : null}
                  </td>
                  <td className="num">{money(Math.abs(delta) * Number(line.unitCost))}</td>
                  <td>
                    <input
                      value={line.notes}
                      onChange={(e) =>
                        setLines((c) =>
                          c.map((l, i) => (i === index ? { ...l, notes: e.target.value } : l)),
                        )
                      }
                    />
                  </td>
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
        )}
        <div className="card-body">
          <p className="small muted">
            Use a negative number to write stock off and a positive one to book it in. Nothing moves
            until this is approved by someone other than you.
          </p>
        </div>
      </Card>
    </>
  );
}
