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
      /*
       * No SKUs. Not an empty one — none at all.
       *
       * The API no longer requires a variant, so this screen creates the
       * PRODUCT and stops. Every SKU the product ever has, including its first,
       * is created through the "Add a SKU" dialog on the product page, so there
       * is exactly one form for the job and the first SKU is shaped like every
       * one after it.
       *
       * `insertVariant` numbers from the count that already exists, so the
       * first one added still takes the product code as its SKU — the same
       * value this screen used to produce.
       */
    });
  }

  return (
    <>
      <PageHead
        title="New product"
        subtitle="What the thing is and how it is counted — its SKUs come next"
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

      {/*
        * Says where the rest of the job happens.
        *
        * This screen used to carry a "First SKU" panel whose fields did not
        * match the "Add a SKU" dialog — different labels, no variant name, and
        * two fields that appeared nowhere else. Two forms for one concept meant
        * the first SKU of a product was always shaped slightly differently from
        * every SKU added after it. There is one SKU form now, and it is not
        * this one; without a line saying so, the screen would look like it had
        * simply lost a section.
        */}
      <div className="alert info">
        <div>
          <strong>SKUs come next</strong>
          <div className="hint">
            This creates the product only. On the next screen, add the SKUs it is actually stocked
            and sold in — one for a plain item, or one per size or colour. The first takes the
            product code as its SKU.
          </div>
        </div>
      </div>

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

    </>
  );
}
