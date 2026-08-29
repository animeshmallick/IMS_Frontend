import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi, useApiMutation } from "../../lib/hooks";
import {
  Card,
  ErrorBanner,
  Field,
  PageHead,
  SelectField,
  TextField,
} from "../../components/ui";
import type { Brand, Category, ProductType, Uom } from "../../lib/types";

/**
 * Create a product.
 *
 * The two decisions that cannot be undone later are the STOCK UNIT and whether
 * the product is DIVISIBLE, because every quantity ever recorded is expressed in
 * that unit. Choose the smallest sane one: grams for loose grain, millilitres
 * for liquids, pieces for discrete goods.
 *
 * Expiry and serial tracking default to OFF. Turn expiry on for food and
 * medicine; turn serials on for electronics you warranty. Everything else — most
 * hardware and general goods — needs neither, and receiving stays a plain
 * quantity form.
 */
export function NewProduct() {
  const navigate = useNavigate();

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [productType, setProductType] = useState<ProductType>("standard");
  const [stockUomId, setStockUomId] = useState("");
  const [isDivisible, setIsDivisible] = useState(false);
  const [trackExpiry, setTrackExpiry] = useState(false);
  const [trackSerial, setTrackSerial] = useState(false);
  const [description, setDescription] = useState("");

  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [price, setPrice] = useState("");
  const [mrp, setMrp] = useState("");
  const [reorderPoint, setReorderPoint] = useState("");
  const [reorderQty, setReorderQty] = useState("");
  const [shelfLifeDays, setShelfLife] = useState("");

  // Type-specific mandatory fields.
  const [composition, setComposition] = useState("");
  const [drugSchedule, setDrugSchedule] = useState("");

  const categories = useApi<Category[]>(["catalog", "categories"], "/catalog/categories");
  const brands = useApi<Brand[]>(["catalog", "brands"], "/catalog/brands");
  const uoms = useApi<Uom[]>(["catalog", "uoms"], "/catalog/uoms");

  const create = useApiMutation<Record<string, unknown>, { id: string }>("/catalog/products", {
    method: "POST",
    invalidate: [["catalog"]],
    onSuccess: (result) => navigate(`/products/${result.id}`),
  });

  const slugify = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const ready = code && name && categoryId && stockUomId && (productType !== "pharma" || (composition && drugSchedule));

  function submit() {
    create.mutate({
      code,
      name,
      slug: slugify(name),
      description: description || undefined,
      categoryId,
      brandId: brandId || undefined,
      productType,
      stockUomId,
      isDivisible,
      trackExpiry,
      trackSerial,
      status: "active",
      ...(productType === "pharma"
        ? { pharma: { composition, drugSchedule, requiresPrescription: true } }
        : {}),
      variants: [
        {
          sku: sku || undefined,
          shelfLifeDays: shelfLifeDays ? Number(shelfLifeDays) : undefined,
          reorderPoint: reorderPoint || undefined,
          reorderQty: reorderQty || undefined,
          price: price || undefined,
          mrp: mrp || undefined,
          barcodes: barcode ? [{ barcode, isPrimary: true }] : undefined,
        },
      ],
    });
  }

  return (
    <>
      <PageHead
        title="New product"
        subtitle="One product, with its first sellable SKU"
        actions={
          <>
            <button type="button" onClick={() => navigate("/products")}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              disabled={!ready || create.isPending}
              onClick={submit}
            >
              {create.isPending ? "Creating..." : "Create product"}
            </button>
          </>
        }
      />

      <ErrorBanner error={create.error} />

      <div className="grid cols-2">
        <Card title="What is it?">
          <TextField
            label="Product code"
            help="Your own reference, e.g. GRO-ATTA."
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />

          <SelectField
            label="Category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">Choose a category</option>
            {(categories.data ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {"— ".repeat(category.depth)}
                {category.name}
              </option>
            ))}
          </SelectField>

          <SelectField label="Brand" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            <option value="">No brand</option>
            {(brands.data ?? []).map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Kind of product"
            help="Selects which extra mandatory fields apply."
            value={productType}
            onChange={(e) => setProductType(e.target.value as ProductType)}
          >
            <option value="standard">Standard</option>
            <option value="food">Food / grocery</option>
            <option value="pharma">Medicine</option>
            <option value="apparel">Clothing</option>
            <option value="hardware">Hardware</option>
            <option value="electronics">Electronics</option>
          </SelectField>

          <Field label="Description">
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>

          {productType === "pharma" ? (
            <>
              <TextField
                label="Composition"
                value={composition}
                onChange={(e) => setComposition(e.target.value)}
              />
              <TextField
                label="Drug schedule"
                help="A medicine without its schedule is a gap that surfaces at the counter."
                value={drugSchedule}
                onChange={(e) => setDrugSchedule(e.target.value)}
              />
            </>
          ) : null}
        </Card>

        <Card title="How is it counted?">
          <SelectField
            label="Stock unit"
            help="Immutable once stock exists. Pick the smallest sane unit — g for loose grain, pc for discrete goods."
            value={stockUomId}
            onChange={(e) => setStockUomId(e.target.value)}
          >
            <option value="">Choose a unit</option>
            {(uoms.data ?? []).map((uom) => (
              <option key={uom.id} value={uom.id}>
                {uom.code} — {uom.name} ({uom.dimension})
              </option>
            ))}
          </SelectField>

          <Field label="Options">
            <label className="row small">
              <input
                type="checkbox"
                checked={isDivisible}
                onChange={(e) => setIsDivisible(e.target.checked)}
              />
              Can be sold in fractions (loose atta at 0.25 kg — not a hex bolt)
            </label>
            <label className="row small">
              <input
                type="checkbox"
                checked={trackExpiry}
                onChange={(e) => setTrackExpiry(e.target.checked)}
              />
              Track expiry dates (food, medicine)
            </label>
            <label className="row small">
              <input
                type="checkbox"
                checked={trackSerial}
                disabled={isDivisible}
                onChange={(e) => setTrackSerial(e.target.checked)}
              />
              Track serial / IMEI numbers (electronics under warranty)
            </label>
          </Field>

          <p className="small muted">
            Leave both tracking options off for hardware and general goods. Receiving then asks only
            for a quantity — the cost layer behind the scenes still gives you accurate margin.
          </p>
        </Card>
      </div>

      <Card title="First SKU">
        <div className="grid cols-4">
          <TextField
            label="SKU"
            help="Left blank, one is derived from the product code."
            value={sku}
            onChange={(e) => setSku(e.target.value.toUpperCase())}
          />
          <TextField
            label="Barcode"
            help="Scanned at the counter."
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
          />
          <TextField
            label="Selling price"
            help="Per stock unit."
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          <TextField
            label="MRP"
            help="Selling above a recorded MRP is refused."
            inputMode="decimal"
            value={mrp}
            onChange={(e) => setMrp(e.target.value)}
          />
          <TextField
            label="Reorder point"
            inputMode="decimal"
            value={reorderPoint}
            onChange={(e) => setReorderPoint(e.target.value)}
          />
          <TextField
            label="Reorder quantity"
            inputMode="decimal"
            value={reorderQty}
            onChange={(e) => setReorderQty(e.target.value)}
          />
          {trackExpiry ? (
            <TextField
              label="Shelf life (days)"
              help="Lets an expiry be derived when the supplier prints only a manufacture date."
              inputMode="numeric"
              value={shelfLifeDays}
              onChange={(e) => setShelfLife(e.target.value)}
            />
          ) : null}
        </div>
      </Card>
    </>
  );
}
