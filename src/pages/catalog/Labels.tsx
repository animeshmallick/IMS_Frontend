import JsBarcode from "jsbarcode";
import { Printer, Scale } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { VariantPicker } from "../../components/VariantPicker";
import { Card, ErrorBanner, Field, PageHead } from "../../components/ui";
import { api } from "../../lib/api";
import { useSessionContext } from "../../lib/session";
import { money } from "../../lib/format";

/**
 * Print labels for goods with no fixed pack.
 *
 * The flow is deliberately the shape of the physical job: pick the item once,
 * then weigh–print, weigh–print, weigh–print. Bags come one after another and
 * the item rarely changes between them, so anything that resets to the top
 * after each label would double the work.
 *
 * The label carries the weight INSIDE the barcode, so the till reads a quantity
 * rather than the operator keying one. That is the whole point: the number on
 * the bag and the number in the ledger become the same number, and nobody has
 * to type a decimal at a counter with a queue at it.
 */

interface LabelTarget {
  variantId: string;
  sku: string;
  productName: string;
  variantName: string | null;
  plu: number;
  stockUomCode: string;
  isDivisible: boolean;
  trackExpiry: boolean;
  price: string | null;
  mrp: string | null;
}

interface LabelData extends LabelTarget {
  barcode: string;
}

/** How the weight is typed, per stock unit. Grams are the base for mass. */
const UNIT_TO_GRAMS: Record<string, number> = { g: 1, kg: 1000, mg: 0.001 };

export function Labels() {
  const { can } = useSessionContext();
  const [target, setTarget] = useState<LabelTarget | null>(null);
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState("kg");
  const [copies, setCopies] = useState(1);
  const [label, setLabel] = useState<LabelData | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const amountRef = useRef<HTMLInputElement>(null);

  async function pick(variantId: string) {
    setError(null);
    setLabel(null);
    try {
      const data = await api<LabelTarget>(`/catalog/variants/${variantId}/label`, {
        method: "POST",
      });
      setTarget(data);
      // Straight to the weight box: the item is chosen once, the weight many times.
      setTimeout(() => amountRef.current?.focus(), 0);
    } catch (err) {
      setError(err);
    }
  }

  const grams = (() => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.round(value * (UNIT_TO_GRAMS[unit] ?? 1));
  })();

  const linePrice =
    target?.price && grams > 0 ? (Number(target.price) * grams).toFixed(2) : null;

  async function makeLabel() {
    if (!target || grams <= 0) return;
    setError(null);
    setBusy(true);
    try {
      /*
       * The digits are built on the server, not here. It is the one piece of
       * arithmetic that can silently sell three kilos as three hundred grams,
       * and it belongs next to its tests rather than duplicated in a browser.
       */
      const data = await api<LabelData>(`/catalog/variants/${target.variantId}/label/barcode`, {
        method: "POST",
        body: { kind: "weight", value: grams },
      });
      setLabel(data);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (!can("catalog:read")) {
    return <ErrorBanner error={new Error("You do not have access to the catalogue.")} />;
  }

  return (
    <>
      <PageHead
        title="Print labels"
        subtitle="Barcode labels for loose and own-packed goods, with the weight inside the code"
      />

      <ErrorBanner error={error} />

      <div className="grid cols-2">
        <div>
          <Card title="1 · Choose the item">
            <VariantPicker
              autoFocus
              onPick={(variant) => void pick(variant.variantId)}
              placeholder="Search by name or SKU"
            />

            {target ? (
              <div className="picked mt">
                <div>
                  <strong className="mono">{target.sku}</strong>
                  <span className="sub">
                    {target.productName}
                    {target.variantName ? ` · ${target.variantName}` : ""}
                  </span>
                </div>
                <div className="right small">
                  <span className="badge accent">PLU {target.plu}</span>
                  <span className="sub">
                    {target.price ? `${money(target.price)}/${target.stockUomCode}` : "No price set"}
                  </span>
                </div>
              </div>
            ) : null}

            {target && !target.isDivisible ? (
              <div className="alert warn mt">
                <div>
                  <strong>{target.sku} is not sold loose.</strong> Labels here embed a weight, so
                  they only make sense for divisible goods. For a fixed pack, add an ordinary
                  barcode on the product instead.
                </div>
              </div>
            ) : null}

            {target && !target.price ? (
              <div className="alert warn mt">
                <div>
                  <strong>No selling price.</strong> The label will still scan and post the right
                  quantity, but the till cannot price it. Set a price before selling.
                </div>
              </div>
            ) : null}
          </Card>

          {target ? (
            <Card title="2 · Weigh" className="mt">
              <form
                className="inline-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void makeLabel();
                }}
              >
                <Field label="Weight">
                  <div className="input-icon">
                    <Scale size={14} aria-hidden />
                    <input
                      ref={amountRef}
                      className="num"
                      inputMode="decimal"
                      value={amount}
                      placeholder="0.000"
                      onChange={(event) => setAmount(event.target.value)}
                    />
                  </div>
                </Field>

                <Field label="Unit">
                  <select value={unit} onChange={(event) => setUnit(event.target.value)}>
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                  </select>
                </Field>

                <Field label="Copies">
                  <input
                    className="num"
                    type="number"
                    min={1}
                    max={20}
                    value={copies}
                    onChange={(event) => setCopies(Number(event.target.value) || 1)}
                  />
                </Field>

                <button type="submit" className="primary" disabled={grams <= 0 || busy}>
                  Make label
                </button>
              </form>

              {grams > 0 ? (
                <p className="hint mt">
                  {grams.toLocaleString()} g
                  {linePrice ? (
                    <>
                      {" "}
                      · sells for <strong>{money(linePrice)}</strong> at today's price
                    </>
                  ) : null}
                </p>
              ) : null}
            </Card>
          ) : null}
        </div>

        {label ? (
          <div>
            <Card
              title="3 · Print"
              actions={
                <button type="button" className="primary" onClick={() => window.print()}>
                  <Printer size={14} aria-hidden />
                  Print {copies > 1 ? `${copies} labels` : "label"}
                </button>
              }
            >
              <p className="hint mb">
                Printed at 50 × 25 mm. Set the printer to that size with scaling off — “fit to
                page” stretches the bars and a stretched barcode does not scan.
              </p>
              <div className="label-preview">
                <LabelSheet label={label} grams={grams} copies={copies} />
              </div>
            </Card>
          </div>
        ) : null}
      </div>

      {/* Only the labels reach the printer; everything else is hidden by the
          print stylesheet. */}
      {label ? (
        <div className="print-only label-sheet">
          <LabelSheet label={label} grams={grams} copies={copies} />
        </div>
      ) : null}
    </>
  );
}

function LabelSheet({
  label,
  grams,
  copies,
}: {
  label: LabelData;
  grams: number;
  copies: number;
}) {
  return (
    <>
      {Array.from({ length: copies }, (_, i) => (
        <OneLabel key={i} label={label} grams={grams} />
      ))}
    </>
  );
}

/**
 * A single 50 × 25 mm label.
 *
 * Sized in millimetres rather than pixels because it is going onto physical
 * stock, and a label that is nearly the right size peels badly and jams.
 */
function OneLabel({ label, grams }: { label: LabelData; grams: number }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    JsBarcode(svgRef.current, label.barcode, {
      format: "EAN13",
      // Bars must stay crisp: too narrow and a thermal head blurs them into
      // each other, which reads as a check-digit failure at the till.
      width: 1.6,
      height: 38,
      fontSize: 11,
      margin: 0,
      displayValue: true,
      background: "transparent",
    });
  }, [label.barcode]);

  const price = label.price ? (Number(label.price) * grams).toFixed(2) : null;

  return (
    <div className="print-label">
      <div className="print-label-name">
        {label.productName}
        {label.variantName ? ` · ${label.variantName}` : ""}
      </div>
      <div className="print-label-row">
        <span>
          {grams >= 1000 ? `${(grams / 1000).toFixed(3)} kg` : `${grams} g`}
        </span>
        {price ? <strong className="print-label-price">{money(price)}</strong> : null}
      </div>
      <svg ref={svgRef} className="print-label-barcode" />
    </div>
  );
}
