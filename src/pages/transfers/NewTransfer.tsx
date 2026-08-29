import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi, useApiMutation } from "../../lib/hooks";
import { useSessionContext } from "../../lib/session";
import { Card, ErrorBanner, Field, PageHead, SelectField, Table } from "../../components/ui";
import { VariantPicker } from "../../components/VariantPicker";
import { qty } from "../../lib/format";
import type { Location, StockBalance, Uom, VariantSearchResult } from "../../lib/types";

interface DraftLine {
  variantId: string;
  sku: string;
  productName: string;
  stockUomCode: string;
  requestUomId: string;
  requestQty: string;
}

/**
 * Request a stock movement between two locations.
 *
 * Raising the request RESERVES stock at the source immediately, so the units on
 * a pick list cannot be sold at the counter before the picker reaches them. FEFO
 * chooses the batches, which means stores receive the stock that needs selling
 * first without anyone having to think about it.
 */
export function NewTransfer() {
  const navigate = useNavigate();
  const { activeLocation } = useSessionContext();

  const [fromLocationId, setFromLocationId] = useState(activeLocation?.id ?? "");
  const [toLocationId, setToLocationId] = useState("");
  const [notes, setNotes] = useState("");
  const [carrierReference, setCarrier] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);

  const locations = useApi<Location[]>(["locations"], "/locations");
  const uoms = useApi<Uom[]>(["catalog", "uoms"], "/catalog/uoms");

  // Availability at the SOURCE, so the picker can see what is actually there
  // before promising it.
  const available = useApi<{ items: StockBalance[] } | StockBalance[]>(
    ["stock", "balances", fromLocationId],
    "/stock/balances",
    { locationId: fromLocationId, limit: 200 },
    { enabled: Boolean(fromLocationId) },
  );
  const balances = Array.isArray(available.data)
    ? available.data
    : (available.data?.items ?? []);

  const create = useApiMutation<Record<string, unknown>, { id: string }>("/stock-transfers", {
    method: "POST",
    idempotent: true,
    invalidate: [["transfers"], ["stock"]],
    onSuccess: (result) => navigate(`/transfers/${result.id}`),
  });

  function addVariant(variant: VariantSearchResult) {
    if (lines.some((l) => l.variantId === variant.variantId)) return;
    const stockUom = (uoms.data ?? []).find((u) => u.code === variant.stockUomCode);
    setLines((current) => [
      ...current,
      {
        variantId: variant.variantId,
        sku: variant.sku,
        productName: variant.productName,
        stockUomCode: variant.stockUomCode,
        requestUomId: stockUom?.id ?? "",
        requestQty: "1",
      },
    ]);
  }

  const physical = (locations.data ?? []).filter((l) => l.isPhysical && !l.isSystem && l.isActive);

  const ready =
    fromLocationId &&
    toLocationId &&
    fromLocationId !== toLocationId &&
    lines.length > 0 &&
    lines.every((l) => l.requestUomId && Number(l.requestQty) > 0);

  function availabilityFor(variantId: string): string | undefined {
    return balances.find((b) => b.variantId === variantId)?.available;
  }

  return (
    <>
      <PageHead
        title="New stock transfer"
        subtitle="Stock is reserved at the source as soon as this is raised"
        actions={
          <>
            <button type="button" onClick={() => navigate("/transfers")}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              disabled={!ready || create.isPending}
              onClick={() =>
                create.mutate({
                  fromLocationId,
                  toLocationId,
                  carrierReference: carrierReference || undefined,
                  notes: notes || undefined,
                  lines: lines.map((l) => ({
                    variantId: l.variantId,
                    requestUomId: l.requestUomId,
                    requestQty: l.requestQty,
                  })),
                })
              }
            >
              {create.isPending ? "Raising..." : "Raise transfer"}
            </button>
          </>
        }
      />

      <ErrorBanner error={create.error} />

      <div className="grid cols-2">
        <Card title="Route">
          <SelectField
            label="Move from"
            value={fromLocationId}
            onChange={(e) => {
              setFromLocationId(e.target.value);
              setLines([]);
            }}
          >
            <option value="">Choose a source</option>
            {physical.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Move to"
            value={toLocationId}
            onChange={(e) => setToLocationId(e.target.value)}
          >
            <option value="">Choose a destination</option>
            {physical
              .filter((l) => l.id !== fromLocationId)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </SelectField>

          <Field label="Carrier reference" help="Vehicle number or courier docket, if any.">
            <input value={carrierReference} onChange={(e) => setCarrier(e.target.value)} />
          </Field>

          <Field label="Notes">
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </Card>

        <Card title="Add items">
          {fromLocationId ? (
            <>
              <VariantPicker
                onPick={addVariant}
                showPrice={false}
                placeholder="Search a product to move"
              />
              <p className="small muted mt">
                Batches are chosen automatically, earliest expiry first, so the destination gets the
                stock that needs selling soonest.
              </p>
            </>
          ) : (
            <p className="muted">Choose a source location first.</p>
          )}
        </Card>
      </div>

      <Card title={`Items to move (${lines.length})`} flush>
        {lines.length === 0 ? (
          <p className="empty">No items yet.</p>
        ) : (
          <Table
            head={
              <tr>
                <th>Item</th>
                <th className="num">Available at source</th>
                <th style={{ width: "9rem" }}>Unit</th>
                <th className="num" style={{ width: "7rem" }}>
                  Quantity
                </th>
                <th />
              </tr>
            }
          >
            {lines.map((line, index) => {
              const stock = availabilityFor(line.variantId);
              const requestedBase = Number(line.requestQty);
              const short = stock !== undefined && requestedBase > Number(stock);

              return (
                <tr key={line.variantId}>
                  <td>
                    {line.sku}
                    <span className="sub">{line.productName}</span>
                  </td>
                  <td className="num">
                    {stock === undefined ? (
                      <span className="muted">—</span>
                    ) : (
                      <span style={{ color: short ? "var(--danger)" : undefined }}>
                        {qty(stock)} {line.stockUomCode}
                      </span>
                    )}
                  </td>
                  <td>
                    <select
                      value={line.requestUomId}
                      onChange={(e) =>
                        setLines((c) =>
                          c.map((l, i) =>
                            i === index ? { ...l, requestUomId: e.target.value } : l,
                          ),
                        )
                      }
                    >
                      {(uoms.data ?? []).map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.code}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="num"
                      inputMode="decimal"
                      value={line.requestQty}
                      onChange={(e) =>
                        setLines((c) =>
                          c.map((l, i) => (i === index ? { ...l, requestQty: e.target.value } : l)),
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
      </Card>
    </>
  );
}
