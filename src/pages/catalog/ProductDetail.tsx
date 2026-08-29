import { useState } from "react";
import { useParams } from "react-router-dom";
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
  TextField,
} from "../../components/ui";
import { date, humanise, money, qty } from "../../lib/format";
import type { ProductDetail, ProductVariantDetail, Uom } from "../../lib/types";

/**
 * One product and its SKUs.
 *
 * Price is separate from everything else here, deliberately: `price:write` is
 * its own permission, because deciding what something sells for is a different
 * call from correcting its description, and the people trusted with one are not
 * automatically trusted with the other.
 */
export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSessionContext();
  const [pricing, setPricing] = useState<ProductVariantDetail | null>(null);
  const [converting, setConverting] = useState<ProductVariantDetail | null>(null);

  const product = useApi<ProductDetail>(["catalog", "product", id], `/catalog/products/${id}`);

  if (product.isPending) return <Loading />;
  if (product.isError) return <ErrorBanner error={product.error} />;
  const item = product.data!;

  return (
    <>
      <PageHead
        title={item.name}
        subtitle={
          <>
            {item.code} · {item.categoryPath}
            {item.brandName ? ` · ${item.brandName}` : ""}
          </>
        }
        actions={
          <Badge tone={item.status === "active" ? "success" : "neutral"}>
            {humanise(item.status)}
          </Badge>
        }
      />

      <div className="grid cols-4 mb">
        <Card>
          <div className="stat">
            <div className="label">Stock unit</div>
            <div className="value" style={{ fontSize: "1.2rem" }}>
              {item.stockUomCode}
            </div>
            <div className="hint">{item.isDivisible ? "Sold in fractions" : "Whole units only"}</div>
          </div>
        </Card>
        <Card>
          <div className="stat">
            <div className="label">Kind</div>
            <div className="value" style={{ fontSize: "1.2rem" }}>
              {humanise(item.productType)}
            </div>
          </div>
        </Card>
        <Card>
          <div className="stat">
            <div className="label">Expiry</div>
            <div className="value" style={{ fontSize: "1.2rem" }}>
              {item.trackExpiry ? "Tracked" : "Not tracked"}
            </div>
            <div className="hint">
              {item.trackExpiry ? "Asked for at receiving" : "Receiving asks only for a quantity"}
            </div>
          </div>
        </Card>
        <Card>
          <div className="stat">
            <div className="label">Serials</div>
            <div className="value" style={{ fontSize: "1.2rem" }}>
              {item.trackSerial ? "Tracked" : "Not tracked"}
            </div>
          </div>
        </Card>
      </div>

      <Card title={`SKUs (${item.variants.length})`} flush>
        <Table
          head={
            <tr>
              <th>SKU</th>
              <th>Variant</th>
              <th className="num">Price</th>
              <th className="num">MRP</th>
              <th className="num">Reorder at</th>
              <th>Barcodes</th>
              <th />
            </tr>
          }
        >
          {item.variants.map((variant) => (
            <tr key={variant.id}>
              <td>
                <strong>{variant.sku}</strong>
              </td>
              <td className="small">{variant.variantName ?? "—"}</td>
              <td className="num">
                {variant.currentPrice ? (
                  money(variant.currentPrice)
                ) : (
                  <Badge tone="warn">No price</Badge>
                )}
              </td>
              <td className="num muted">{variant.mrp ? money(variant.mrp) : "—"}</td>
              <td className="num muted">{qty(variant.reorderPoint)}</td>
              <td className="small">
                {(variant.barcodes ?? []).map((barcode) => (
                  <div key={barcode.id}>
                    {barcode.barcode}
                    {barcode.isPrimary ? " · primary" : ""}
                  </div>
                ))}
                {(variant.barcodes ?? []).length === 0 ? <span className="muted">—</span> : null}
              </td>
              <td>
                <div className="btn-row">
                  {can("price:write") ? (
                    <button type="button" className="sm" onClick={() => setPricing(variant)}>
                      Set price
                    </button>
                  ) : null}
                  {can("catalog:write") ? (
                    <button type="button" className="sm" onClick={() => setConverting(variant)}>
                      Units
                    </button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      {item.description ? (
        <Card title="Description">
          <p>{item.description}</p>
        </Card>
      ) : null}

      {pricing ? (
        <PriceModal
          variant={pricing}
          onClose={() => setPricing(null)}
          onDone={() => {
            setPricing(null);
            void product.refetch();
          }}
        />
      ) : null}

      {converting ? (
        <UomModal
          variant={converting}
          stockUomCode={item.stockUomCode}
          onClose={() => setConverting(null)}
          onDone={() => {
            setConverting(null);
            void product.refetch();
          }}
        />
      ) : null}
    </>
  );
}

/**
 * Prices are append-only and effective-dated: the current row is closed and a
 * new one opened, so an old bill can always be re-explained.
 */
function PriceModal({
  variant,
  onClose,
  onDone,
}: {
  variant: ProductVariantDetail;
  onClose: () => void;
  onDone: () => void;
}) {
  const [price, setPrice] = useState(variant.currentPrice ?? "");
  const [mrp, setMrp] = useState(variant.mrp ?? "");
  const [note, setNote] = useState("");

  const history = useApi<{ price: string; mrp: string | null; effectiveFrom: string; effectiveTo: string | null }[]>(
    ["catalog", "prices", variant.id],
    `/catalog/variants/${variant.id}/prices`,
  );

  const save = useApiMutation<Record<string, unknown>, unknown>(
    `/catalog/variants/${variant.id}/price`,
    { method: "PUT", invalidate: [["catalog"]], onSuccess: onDone },
  );

  return (
    <Modal
      title={`Price — ${variant.sku}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={!price || save.isPending}
            onClick={() => save.mutate({ price, mrp: mrp || undefined, note: note || undefined })}
          >
            {save.isPending ? "Saving..." : "Set price"}
          </button>
        </>
      }
    >
      <ErrorBanner error={save.error} />

      <div className="grid cols-2">
        <TextField
          label="Selling price"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <TextField
          label="MRP"
          help="Selling above this is refused at the counter."
          inputMode="decimal"
          value={mrp}
          onChange={(e) => setMrp(e.target.value)}
        />
      </div>
      <TextField label="Note" value={note} onChange={(e) => setNote(e.target.value)} />

      {(history.data?.length ?? 0) > 0 ? (
        <>
          <h3 className="mt mb">Price history</h3>
          <Table
            head={
              <tr>
                <th>From</th>
                <th>To</th>
                <th className="num">Price</th>
                <th className="num">MRP</th>
              </tr>
            }
          >
            {(history.data ?? []).map((row, index) => (
              <tr key={index}>
                <td className="small">{date(row.effectiveFrom)}</td>
                <td className="small">{row.effectiveTo ? date(row.effectiveTo) : "current"}</td>
                <td className="num">{money(row.price)}</td>
                <td className="num muted">{row.mrp ? money(row.mrp) : "—"}</td>
              </tr>
            ))}
          </Table>
        </>
      ) : null}
    </Modal>
  );
}

/**
 * Purchase and sale units.
 *
 * A box of 100 bolts or a 5 kg bag of atta: without a conversion, a purchase
 * order can only be raised in the stock unit, which is not how anyone buys.
 */
function UomModal({
  variant,
  stockUomCode,
  onClose,
  onDone,
}: {
  variant: ProductVariantDetail;
  stockUomCode: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [uomId, setUomId] = useState("");
  const [factor, setFactor] = useState("");
  const [purpose, setPurpose] = useState<"purchase" | "sale" | "both">("both");

  const uoms = useApi<Uom[]>(["catalog", "uoms"], "/catalog/uoms");

  const save = useApiMutation<Record<string, unknown>, unknown>(
    `/catalog/variants/${variant.id}/uom-conversions`,
    { method: "PUT", invalidate: [["catalog"]], onSuccess: onDone },
  );

  return (
    <Modal
      narrow
      title={`Units — ${variant.sku}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={!uomId || !(Number(factor) > 0) || save.isPending}
            onClick={() =>
              save.mutate({
                uomId,
                factorToStockUom: factor,
                purpose,
                isDefaultPurchase: purpose !== "sale",
                isDefaultSale: purpose !== "purchase",
              })
            }
          >
            {save.isPending ? "Saving..." : "Add unit"}
          </button>
        </>
      }
    >
      <ErrorBanner error={save.error} />

      <Field label="Unit">
        <select value={uomId} onChange={(e) => setUomId(e.target.value)}>
          <option value="">Choose a unit</option>
          {(uoms.data ?? [])
            .filter((u) => u.code !== stockUomCode)
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.code} — {u.name}
              </option>
            ))}
        </select>
      </Field>

      <TextField
        label={`How many ${stockUomCode} in one of these?`}
        help={`A box of 100 pieces would be 100. A kilo where stock is in grams is 1000.`}
        inputMode="decimal"
        value={factor}
        onChange={(e) => setFactor(e.target.value)}
      />

      <Field label="Used for">
        <select value={purpose} onChange={(e) => setPurpose(e.target.value as typeof purpose)}>
          <option value="both">Buying and selling</option>
          <option value="purchase">Buying only</option>
          <option value="sale">Selling only</option>
        </select>
      </Field>
    </Modal>
  );
}
