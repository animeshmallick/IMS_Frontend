import JsBarcode from "jsbarcode";
import { Printer, Wand2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, Empty, ErrorBanner, Field, PageHead, QueryState } from "../../components/ui";
import { useToast } from "../../components/feedback";
import { useApi, useApiMutation } from "../../lib/hooks";
import { useSessionContext } from "../../lib/session";
import { money } from "../../lib/format";
import { useUnits } from "../../lib/use-units";

/**
 * A sheet of barcodes to keep beside the till.
 *
 * Plenty of stock arrives with nothing to scan — unbranded goods, things bought
 * loose by the piece, anything repacked here. Ringing those up means searching
 * by name with a queue waiting, which is slow and is where the wrong item gets
 * picked.
 *
 * So the shop mints a barcode for each of them and prints this page. It goes on
 * the counter, and the cashier scans off the paper. The code is a real EAN-13
 * in the range GS1 reserves for in-store use, so the scanner and the till treat
 * it exactly like any manufacturer barcode — including offline, because the
 * offline till already caches barcodes.
 */

interface SheetRow {
  variantId: string;
  sku: string;
  productName: string;
  variantName: string | null;
  barcode: string;
  internal: boolean;
  price: string | null;
  stockUomCode: string;
  isDivisible: boolean;
}

interface Sheet {
  rows: SheetRow[];
  withoutBarcode: { variantId: string; sku: string; productName: string }[];
}

export function BarcodeSheet() {
  const { can } = useSessionContext();
  const units = useUnits();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [onlyInternal, setOnlyInternal] = useState(false);

  const sheet = useApi<Sheet>(["catalog", "barcode-sheet"], "/catalog/barcodes/sheet");

  const generate = useApiMutation<undefined, { generated: number }>(
    "/catalog/barcodes/generate-missing",
    {
      method: "POST",
      invalidate: [["catalog", "barcode-sheet"], ["catalog", "products"]],
      onSuccess: (result) =>
        toast(
          result.generated > 0
            ? `Created ${result.generated} barcode${result.generated === 1 ? "" : "s"}`
            : "Every item already has a barcode",
          { tone: result.generated > 0 ? "success" : "info" },
        ),
    },
  );

  const rows = useMemo(() => {
    const all = sheet.data?.rows ?? [];
    const term = search.trim().toLowerCase();
    return all.filter((r) => {
      if (onlyInternal && !r.internal) return false;
      if (!term) return true;
      return (
        r.sku.toLowerCase().includes(term) ||
        r.productName.toLowerCase().includes(term) ||
        r.barcode.includes(term)
      );
    });
  }, [sheet.data, search, onlyInternal]);

  const missing = sheet.data?.withoutBarcode ?? [];

  return (
    <>
      <PageHead
        title="Barcode sheet"
        subtitle="Print it, stick it by the counter, and scan off the paper"
        actions={
          <>
            {can("catalog:write") ? (
              <button
                type="button"
                disabled={generate.isPending || missing.length === 0}
                onClick={() => generate.mutate(undefined)}
              >
                <Wand2 size={14} aria-hidden />
                Create {missing.length > 0 ? missing.length : ""} missing
              </button>
            ) : null}
            <button type="button" className="primary" onClick={() => window.print()}>
              <Printer size={14} aria-hidden />
              Print
            </button>
          </>
        }
      />

      <ErrorBanner error={sheet.error ?? generate.error} />

      {/*
       * Items with no barcode are called out rather than quietly left off. They
       * are the entire reason for this page, and a sheet that looks complete
       * while omitting them is worse than one that says what is missing.
       */}
      {missing.length > 0 ? (
        <div className="alert warn no-print">
          <div className="grow">
            <strong>
              {missing.length} item{missing.length === 1 ? " has" : "s have"} no barcode.
            </strong>{" "}
            They cannot be scanned at all until one exists —{" "}
            {missing
              .slice(0, 5)
              .map((m) => m.sku)
              .join(", ")}
            {missing.length > 5 ? ` and ${missing.length - 5} more` : ""}.
          </div>
        </div>
      ) : null}

      <div className="filters no-print">
        <Field label="Search">
          <input
            value={search}
            placeholder="Name, SKU or barcode"
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
        <label className="check">
          <input
            type="checkbox"
            checked={onlyInternal}
            onChange={(e) => setOnlyInternal(e.target.checked)}
          />
          Only ones we made
        </label>
        <span className="hint">
          {rows.length} of {sheet.data?.rows.length ?? 0} shown
        </span>
      </div>

      <Card flush>
        <QueryState
          query={sheet}
          empty={
            <Empty
              title="Nothing to print yet"
              hint="Add some products, then create barcodes for the ones that arrived without."
            />
          }
        >
          {rows.length === 0 ? (
            <Empty title="Nothing matches" hint="Try a different search." />
          ) : (
            <div className="barcode-sheet">
              {rows.map((row) => (
                <SheetCell key={row.variantId} row={row} units={units} />
              ))}
            </div>
          )}
        </QueryState>
      </Card>
    </>
  );
}

function SheetCell({ row, units }: { row: SheetRow; units: ReturnType<typeof useUnits> }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    JsBarcode(svgRef.current, row.barcode, {
      format: "EAN13",
      /*
       * Wide enough bars that an ordinary office printer still produces
       * something a scanner reads. Thin bars blur together on plain paper and
       * fail the check digit, which reads at the till as "this barcode is
       * wrong" rather than "this print is poor".
       */
      width: 1.5,
      height: 34,
      fontSize: 11,
      margin: 2,
      displayValue: true,
      background: "#ffffff",
      lineColor: "#000000",
    });
  }, [row.barcode]);

  const price = row.price
    ? units.line(1, row.stockUomCode, row.price)
    : null;

  return (
    <div className="barcode-cell">
      <div className="barcode-name">
        {row.productName}
        {row.variantName ? ` · ${row.variantName}` : ""}
      </div>
      <div className="barcode-meta">
        <span className="mono">{row.sku}</span>
        {price?.unitPrice ? (
          <strong>
            {money(price.unitPrice)}
            <span className="muted">/{price.code}</span>
          </strong>
        ) : (
          <span className="muted">no price</span>
        )}
      </div>
      <svg ref={svgRef} className="barcode-svg" />
    </div>
  );
}
