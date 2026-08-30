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
  SelectField,
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
  const [editing, setEditing] = useState(false);
  const [addingSku, setAddingSku] = useState(false);
  const [barcoding, setBarcoding] = useState<ProductVariantDetail | null>(null);
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
          <>
            <Badge tone={item.status === "active" ? "success" : "neutral"}>
              {humanise(item.status)}
            </Badge>
            {can("catalog:write") ? (
              <>
                <button type="button" onClick={() => setEditing(true)}>
                  Edit product
                </button>
                <button type="button" className="primary" onClick={() => setAddingSku(true)}>
                  Add SKU
                </button>
              </>
            ) : null}
          </>
        }
      />

      <div className="grid cols-4 mb">
        <Card>
          <div className="stat">
            <div className="label">Stock unit</div>
            <div className="value text">
              {item.stockUomCode}
            </div>
            <div className="hint">{item.isDivisible ? "Sold in fractions" : "Whole units only"}</div>
          </div>
        </Card>
        <Card>
          <div className="stat">
            <div className="label">Kind</div>
            <div className="value text">
              {humanise(item.productType)}
            </div>
          </div>
        </Card>
        <Card>
          <div className="stat">
            <div className="label">Expiry</div>
            <div className="value text">
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
            <div className="value text">
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
                  <div key={barcode.id} className="mono">
                    {barcode.barcode}
                    {barcode.isPrimary ? <span className="muted"> · primary</span> : null}
                  </div>
                ))}
                {/*
                  * An item with nothing to scan cannot be sold at the counter
                  * without searching for it by name, so this is a problem
                  * rather than a blank — and the fix is one click away.
                  */}
                {(variant.barcodes ?? []).length === 0 ? (
                  can("catalog:write") ? (
                    <button type="button" className="sm" onClick={() => setBarcoding(variant)}>
                      Add a barcode
                    </button>
                  ) : (
                    <Badge tone="warn">None</Badge>
                  )
                ) : can("catalog:write") ? (
                  <button type="button" className="ghost sm" onClick={() => setBarcoding(variant)}>
                    Manage
                  </button>
                ) : null}
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

      {editing ? (
        <EditProduct item={item} onClose={() => setEditing(false)} />
      ) : null}

      {addingSku ? (
        <AddSku item={item} onClose={() => setAddingSku(false)} />
      ) : null}

      {barcoding ? (
        <BarcodeDialog variant={barcoding} onClose={() => setBarcoding(null)} />
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

/**
 * Barcodes for one SKU.
 *
 * The moment this exists for is receiving a product for the first time: the
 * goods are on the bench, the packet is in your hand, and the barcode printed
 * on it is the only source that is certainly right. Guessing one from a
 * supplier catalogue before the goods arrive is how the wrong code gets stored
 * and every scan afterwards finds nothing.
 *
 * For anything that will never have a printed code — unbranded, loose, repacked
 * — the shop mints its own instead, and it goes on the counter sheet.
 */
function BarcodeDialog({ variant, onClose }: { variant: ProductVariantDetail; onClose: () => void }) {
  const [value, setValue] = useState("");
  /** The row being corrected, and what it is being corrected to. */
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);

  const add = useApiMutation<{ barcode: string; isPrimary: boolean }, unknown>(
    `/catalog/variants/${variant.id}/barcodes`,
    { invalidate: [["catalog", "product"]], onSuccess: () => setValue("") },
  );

  const generate = useApiMutation<undefined, { barcode: string }>(
    `/catalog/variants/${variant.id}/barcodes/generate`,
    { method: "POST", invalidate: [["catalog", "product"]] },
  );

  const update = useApiMutation<{ id: string; barcode?: string; isPrimary?: boolean }, unknown>(
    (body) => `/catalog/variants/${variant.id}/barcodes/${body.id}`,
    { method: "PATCH", invalidate: [["catalog", "product"]], onSuccess: () => setEditing(null) },
  );

  const remove = useApiMutation<{ id: string }, unknown>(
    (body) => `/catalog/variants/${variant.id}/barcodes/${body.id}`,
    { method: "DELETE", invalidate: [["catalog", "product"]] },
  );

  const existing = variant.barcodes ?? [];

  return (
    <Modal
      title={`Barcodes · ${variant.sku}`}
      onClose={onClose}
      footer={
        <button type="button" onClick={onClose}>
          Done
        </button>
      }
    >
      <ErrorBanner error={add.error ?? generate.error ?? remove.error ?? update.error} />

      {existing.length > 0 ? (
        <Table head={<tr><th>Barcode</th><th>Type</th><th /></tr>}>
          {existing.map((b) => (
            <tr key={b.id}>
              <td className="mono">
                {editing?.id === b.id ? (
                  /*
                   * Corrected in place rather than deleted and re-added. A
                   * mistyped digit is one wrong character, and making someone
                   * remove the row first invites them to leave the item with no
                   * barcode at all if they are interrupted halfway.
                   */
                  <input
                    autoFocus
                    className="mono"
                    value={editing.value}
                    onChange={(event) => setEditing({ id: b.id, value: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && editing.value.trim()) {
                        update.mutate({ id: b.id, barcode: editing.value.trim() });
                      }
                      if (event.key === "Escape") setEditing(null);
                    }}
                  />
                ) : (
                  <>
                    {b.barcode}
                    {b.isPrimary ? <span className="sub">primary</span> : null}
                  </>
                )}
              </td>
              <td className="small muted">{b.type}</td>
              <td className="right">
                <div className="btn-row end">
                  {editing?.id === b.id ? (
                    <>
                      <button
                        type="button"
                        className="primary sm"
                        disabled={!editing.value.trim() || update.isPending}
                        onClick={() => update.mutate({ id: b.id, barcode: editing.value.trim() })}
                      >
                        Save
                      </button>
                      <button type="button" className="ghost sm" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="ghost sm"
                        onClick={() => setEditing({ id: b.id, value: b.barcode })}
                      >
                        Edit
                      </button>
                      {!b.isPrimary ? (
                        <button
                          type="button"
                          className="ghost sm"
                          disabled={update.isPending}
                          onClick={() => update.mutate({ id: b.id, isPrimary: true })}
                          title="The counter sheet prints the primary code"
                        >
                          Make primary
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="ghost sm danger"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate({ id: b.id })}
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <div className="alert warn">
          <div>
            <strong>Nothing to scan.</strong> This item can only be found by searching for
            it by name at the counter, which is slow with a queue waiting.
          </div>
        </div>
      )}

      <h3>Scan the packet</h3>
      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (value.trim()) add.mutate({ barcode: value.trim(), isPrimary: existing.length === 0 });
        }}
      >
        <Field label="Barcode">
          {/*
            * autoFocus so a scanner, which types and then presses Enter, works
            * without anyone touching the mouse. Receiving is done standing up.
            */}
          <input
            autoFocus
            className="mono"
            value={value}
            placeholder="Scan or type"
            onChange={(event) => setValue(event.target.value)}
          />
        </Field>
        <button type="submit" className="primary" disabled={!value.trim() || add.isPending}>
          Add
        </button>
      </form>

      <p className="hint mt">
        No barcode on the packet? Make one — it prints on the counter sheet, and the till
        reads it exactly like a manufacturer code, offline included.
      </p>
      <button
        type="button"
        disabled={generate.isPending}
        onClick={() => generate.mutate(undefined)}
      >
        Create one for this item
      </button>
    </Modal>
  );
}

/**
 * Correct a product.
 *
 * Deliberately narrow. Three things are NOT here, and each absence is a
 * decision rather than an omission:
 *
 *   The stock unit. Every ledger entry for this product is denominated in it,
 *   so changing it would restate history — a hundred grams recorded last month
 *   would silently become a hundred kilograms. It is fixed at creation.
 *
 *   The code. It is the identifier suppliers and purchase orders refer to.
 *
 *   Price, which lives behind its own permission on each SKU: deciding what
 *   something sells for is a different call from correcting its description,
 *   and the people trusted with one are not automatically trusted with the
 *   other.
 */
function EditProduct({ item, onClose }: { item: ProductDetail; onClose: () => void }) {
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description ?? "");
  const [categoryId, setCategoryId] = useState(item.categoryId);
  const [brandId, setBrandId] = useState(item.brandId ?? "");
  const [status, setStatus] = useState(item.status);
  const [isDivisible, setIsDivisible] = useState(item.isDivisible);

  const categories = useApi<{ id: string; name: string; path: string; depth: number }[]>(
    ["catalog", "categories"],
    "/catalog/categories",
  );
  const brands = useApi<{ id: string; name: string }[]>(["catalog", "brands"], "/catalog/brands");

  const save = useApiMutation<Record<string, unknown>, unknown>(
    `/catalog/products/${item.id}`,
    { method: "PATCH", invalidate: [["catalog"]], onSuccess: onClose },
  );

  const archive = useApiMutation<undefined, unknown>(`/catalog/products/${item.id}`, {
    method: "DELETE",
    invalidate: [["catalog"]],
    onSuccess: onClose,
  });

  return (
    <Modal
      title={`Edit ${item.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={!name.trim() || save.isPending}
            onClick={() =>
              save.mutate({
                name: name.trim(),
                description: description.trim() || undefined,
                categoryId,
                // Explicit null clears the brand. Omitting it would mean "leave
                // it alone", which is a different intention.
                brandId: brandId || null,
                status,
                isDivisible,
              })
            }
          >
            Save
          </button>
        </>
      }
    >
      <ErrorBanner error={save.error ?? archive.error} />

      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />

      <Field label="Description">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>

      <div className="grid cols-2">
        <SelectField
          label="Category"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          {(categories.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {"\u00A0".repeat(c.depth * 2)}
              {c.name}
            </option>
          ))}
        </SelectField>

        <SelectField label="Brand" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
          <option value="">No brand</option>
          {(brands.data ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </SelectField>
      </div>

      <SelectField
        label="Status"
        value={status}
        onChange={(e) => setStatus(e.target.value as typeof status)}
        help="Discontinued keeps existing stock sellable but hides it when adding to documents"
      >
        <option value="draft">Draft</option>
        <option value="active">Active</option>
        <option value="discontinued">Discontinued</option>
      </SelectField>

      <label className="check mt">
        <input
          type="checkbox"
          checked={isDivisible}
          onChange={(e) => setIsDivisible(e.target.checked)}
        />
        Sold in fractions
      </label>
      <p className="hint">
        {/*
          * The server refuses to turn this off while fractional stock exists,
          * so saying so up front turns a rejected save into an expected one.
          */}
        Turning this off is refused while any fractional stock is still on hand.
      </p>

      <div className="alert info mt">
        <div>
          The stock unit (<strong>{item.stockUomCode}</strong>) and the code (
          <strong className="mono">{item.code}</strong>) cannot be changed. Every ledger entry is
          recorded in that unit, so changing it would restate history rather than correct it.
        </div>
      </div>

      <hr />

      <h3>Take out of use</h3>
      <p className="hint">
        Refused while any stock remains. An archived product disappears from search, and stock
        nobody can find is worse than a tidy catalogue is good.
      </p>
      <button
        type="button"
        className="danger"
        disabled={archive.isPending}
        onClick={() => archive.mutate(undefined)}
      >
        Archive this product
      </button>
    </Modal>
  );
}

/**
 * Another SKU under the same product.
 *
 * A product is the thing; a SKU is the version you actually stock and sell —
 * 500 g and 1 kg of the same atta, or the red and blue of the same shirt. They
 * share a name, a category, a stock unit and a set of attributes, and differ in
 * price, barcode and how much is on the shelf.
 *
 * Everything except the distinguishing name is optional, because the useful
 * moment to add one is while you are looking at the product and thinking "there
 * is also a large size" — not after assembling a full specification.
 */
function AddSku({ item, onClose }: { item: ProductDetail; onClose: () => void }) {
  const [variantName, setVariantName] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [mrp, setMrp] = useState("");
  const [barcode, setBarcode] = useState("");
  const [reorderPoint, setReorderPoint] = useState("");
  /** Stay open for the next one — sizes and colours arrive in runs. */
  const [addAnother, setAddAnother] = useState(true);
  const [added, setAdded] = useState<string[]>([]);

  const create = useApiMutation<Record<string, unknown>, unknown>(
    `/catalog/products/${item.id}/variants`,
    {
      invalidate: [["catalog"]],
      onSuccess: () => {
        setAdded((current) => [...current, variantName || sku || "SKU"]);
        if (!addAnother) {
          onClose();
          return;
        }
        // Keep the price, which is usually the same across sizes; clear what
        // must differ, so the next one cannot silently inherit a barcode.
        setVariantName("");
        setSku("");
        setBarcode("");
      },
    },
  );

  return (
    <Modal
      title={`Add a SKU to ${item.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose}>
            {added.length > 0 ? "Done" : "Cancel"}
          </button>
          <button
            type="button"
            className="primary"
            disabled={create.isPending}
            onClick={() =>
              create.mutate({
                variantName: variantName.trim() || undefined,
                sku: sku.trim() || undefined,
                price: price.trim() || undefined,
                mrp: mrp.trim() || undefined,
                reorderPoint: reorderPoint.trim() || undefined,
                barcodes: barcode.trim()
                  ? [{ barcode: barcode.trim(), isPrimary: true }]
                  : undefined,
              })
            }
          >
            Add
          </button>
        </>
      }
    >
      <ErrorBanner error={create.error} />

      {added.length > 0 ? (
        <div className="alert success">
          <div>
            Added {added.length}: {added.join(", ")}
          </div>
        </div>
      ) : null}

      <div className="grid cols-2">
        <TextField
          label="Variant name"
          value={variantName}
          placeholder="1 kg, Red / L"
          onChange={(e) => setVariantName(e.target.value)}
          help="What tells this one apart"
        />
        <TextField
          label="SKU code"
          className="mono"
          value={sku}
          placeholder="Leave blank to generate"
          onChange={(e) => setSku(e.target.value)}
          help={`Generated from ${item.code} if empty`}
        />
      </div>

      <div className="grid cols-2">
        <TextField
          label={`Price per ${item.stockUomCode}`}
          className="num"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <TextField
          label="MRP"
          className="num"
          inputMode="decimal"
          value={mrp}
          onChange={(e) => setMrp(e.target.value)}
        />
      </div>

      {/*
        * Optional, and it should be. A product being stocked for the first time
        * has not arrived yet, so nobody has seen the packet — the barcode is
        * captured at receiving, or generated if it will never have one.
        */}
      <TextField
        label="Barcode"
        className="mono"
        value={barcode}
        placeholder="Scan it, or leave blank"
        onChange={(e) => setBarcode(e.target.value)}
        help="Leave blank if the goods have not arrived yet — scan it when they do"
      />

      <TextField
        label={`Reorder point (${item.stockUomCode})`}
        className="num"
        inputMode="decimal"
        value={reorderPoint}
        onChange={(e) => setReorderPoint(e.target.value)}
        help="Optional. Replenishment works it out from sales if left blank."
      />

      <label className="check mt">
        <input
          type="checkbox"
          checked={addAnother}
          onChange={(e) => setAddAnother(e.target.checked)}
        />
        Keep this open for the next SKU
      </label>
    </Modal>
  );
}
