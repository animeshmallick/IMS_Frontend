import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi, useApiMutation } from "../../lib/hooks";
import { useSessionContext } from "../../lib/session";
import {
  Card,
  ErrorBanner,
  Field,
  PageHead,
  Table,
  TextField,
  SelectField,
} from "../../components/ui";
import { VariantPicker } from "../../components/VariantPicker";
import { money, multiplyMoney, sumMoney } from "../../lib/format";
import type { Location, Supplier, Uom, VariantSearchResult } from "../../lib/types";

interface DraftLine {
  variantId: string;
  sku: string;
  productName: string;
  stockUomCode: string;
  orderUomId: string;
  orderQty: string;
  unitCost: string;
}

/**
 * Raise a purchase order.
 *
 * Lines are built up over time — the user described adding items across a few
 * days before placing the order — so this saves as a DRAFT. Nothing is
 * committed to a supplier until it is submitted, approved and placed, and a
 * draft can be edited freely in between.
 *
 * The order UoM is per line and defaults to the stock unit: you buy bolts by the
 * box and atta by the kilo, but stock is held in pieces and grams. The
 * conversion is applied once, by the server, and snapshotted on the line.
 */
export function NewPurchaseOrder() {
  const navigate = useNavigate();
  const { activeLocation } = useSessionContext();

  const [supplierId, setSupplierId] = useState("");
  const [destinationLocationId, setDestinationLocationId] = useState(activeLocation?.id ?? "");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);

  const suppliers = useApi<{ items?: Supplier[] } | Supplier[]>(
    ["partners", "suppliers"],
    "/partners/suppliers",
    { limit: 100 },
  );
  const supplierList = Array.isArray(suppliers.data)
    ? suppliers.data
    : (suppliers.data?.items ?? []);

  const locations = useApi<Location[]>(["locations"], "/locations");
  const uoms = useApi<Uom[]>(["catalog", "uoms"], "/catalog/uoms");

  const create = useApiMutation<Record<string, unknown>, { id: string }>("/purchase-orders", {
    method: "POST",
    idempotent: true,
    invalidate: [["purchase-orders"]],
    onSuccess: (result) => navigate(`/purchase-orders/${result.id}`),
  });

  function addVariant(variant: VariantSearchResult) {
    if (lines.some((line) => line.variantId === variant.variantId)) return;

    const stockUom = (uoms.data ?? []).find((u) => u.code === variant.stockUomCode);

    setLines((current) => [
      ...current,
      {
        variantId: variant.variantId,
        sku: variant.sku,
        productName: variant.productName,
        stockUomCode: variant.stockUomCode,
        orderUomId: stockUom?.id ?? "",
        orderQty: "1",
        unitCost: "0",
      },
    ]);
  }

  function patchLine(index: number, patch: Partial<DraftLine>) {
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  }

  const subtotal = sumMoney(lines.map((l) => multiplyMoney(l.unitCost, l.orderQty)));

  const ready =
    supplierId &&
    destinationLocationId &&
    lines.length > 0 &&
    lines.every((l) => l.orderUomId && Number(l.orderQty) > 0);

  function submit() {
    create.mutate({
      supplierId,
      destinationLocationId,
      expectedDate: expectedDate || undefined,
      notes: notes || undefined,
      lines: lines.map((line) => ({
        variantId: line.variantId,
        orderUomId: line.orderUomId,
        orderQty: line.orderQty,
        unitCost: line.unitCost,
      })),
    });
  }

  return (
    <>
      <PageHead
        title="New purchase order"
        subtitle="Saved as a draft — you can keep adding items before it is submitted"
        actions={
          <>
            <button type="button" onClick={() => navigate("/purchase-orders")}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              disabled={!ready || create.isPending}
              onClick={submit}
            >
              {create.isPending ? "Saving..." : "Save draft"}
            </button>
          </>
        }
      />

      <ErrorBanner error={create.error} />

      <div className="grid cols-2">
        <Card title="Order details">
          <SelectField
            label="Supplier"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
          >
            <option value="">Choose a supplier</option>
            {supplierList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Deliver to"
            help="Where the stock will physically arrive."
            value={destinationLocationId}
            onChange={(e) => setDestinationLocationId(e.target.value)}
          >
            <option value="">Choose a location</option>
            {(locations.data ?? [])
              .filter((l) => l.isPhysical && !l.isSystem && l.allowsReceipts)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </SelectField>

          <TextField
            label="Expected delivery"
            type="date"
            value={expectedDate}
            onChange={(e) => setExpectedDate(e.target.value)}
          />

          <Field label="Notes">
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </Card>

        <Card title="Add items">
          <VariantPicker onPick={addVariant} placeholder="Search a product to add" />
          <p className="small muted mt">
            Choose the unit you are BUYING in — a box, a case, a kilo. Stock is held in the
            product's own unit and the conversion is applied for you.
          </p>
        </Card>
      </div>

      <Card
        title={`Order lines (${lines.length})`}
        actions={<strong className="num">{money(subtotal)}</strong>}
        flush
      >
        {lines.length === 0 ? (
          <p className="empty">No items yet. Search above to add the first one.</p>
        ) : (
          <Table
            head={
              <tr>
                <th>Item</th>
                <th className="w-date">Order unit</th>
                <th className="num w-qty">
                  Quantity
                </th>
                <th className="num w-money">
                  Unit cost
                </th>
                <th className="num">Line total</th>
                <th />
              </tr>
            }
          >
            {lines.map((line, index) => (
              <tr key={line.variantId}>
                <td>
                  {line.sku}
                  <span className="sub">{line.productName}</span>
                </td>
                <td>
                  <select
                    value={line.orderUomId}
                    onChange={(e) => patchLine(index, { orderUomId: e.target.value })}
                  >
                    {(uoms.data ?? []).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.code} — {u.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    className="num"
                    inputMode="decimal"
                    value={line.orderQty}
                    onChange={(e) => patchLine(index, { orderQty: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="num"
                    inputMode="decimal"
                    value={line.unitCost}
                    onChange={(e) => patchLine(index, { unitCost: e.target.value })}
                  />
                </td>
                <td className="num">{money(multiplyMoney(line.unitCost, line.orderQty))}</td>
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
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
