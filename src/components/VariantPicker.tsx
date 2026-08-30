import { useState } from "react";
import { api } from "../lib/api";
import { useApi } from "../lib/hooks";
import { useDebounced } from "./ui";
import { LinkBarcode, looksScanned, useCanLinkBarcode } from "./LinkBarcode";
import { money } from "../lib/format";
import type { ScannedLabel, VariantSearchResult } from "../lib/types";

/**
 * Find a SKU by name, code or barcode.
 *
 * The search endpoint resolves an exact barcode first and flags it, so a scan
 * lands on one row instead of appearing partway down a fuzzy list. That matters
 * at a till: the scanner types faster than a person and ends with Enter, and
 * anything less than an exact-match shortcut turns a scan into a menu.
 */
export function VariantPicker({
  onPick,
  onLabelScan,
  placeholder = "Search by name, SKU or barcode",
  autoFocus,
  showPrice = true,
}: {
  onPick: (variant: VariantSearchResult) => void;
  /**
   * Called instead of `onPick` when the scan was an in-store weight label.
   *
   * Optional, so every other caller is unchanged: a purchase order line has no
   * use for an embedded quantity, and should keep resolving scans the ordinary
   * way.
   */
  onLabelScan?: (label: ScannedLabel) => void;
  placeholder?: string;
  autoFocus?: boolean;
  showPrice?: boolean;
}) {
  const [term, setTerm] = useState("");
  const [linking, setLinking] = useState<string | null>(null);
  const canLink = useCanLinkBarcode();
  const debounced = useDebounced(term);

  const results = useApi<VariantSearchResult[]>(
    ["catalog", "variant-search"],
    "/catalog/variants/search",
    { q: debounced, limit: 15 },
    { enabled: debounced.trim().length > 0 },
  );

  function pick(variant: VariantSearchResult) {
    onPick(variant);
    setTerm("");
  }

  /*
   * Try the in-store label first, and only if the digits could plausibly be
   * one: thirteen of them, starting with the restricted-distribution prefix
   * and a kind we issue. The cheap local test keeps an ordinary barcode from
   * costing an extra round trip on every single scan at a busy till.
   *
   * The server is still the authority — it verifies the check digit and finds
   * the SKU. A 204 means "not ours", and the caller falls through to the
   * ordinary search, which is what makes one scan work for both kinds of code.
   */
  async function tryLabel(raw: string): Promise<boolean> {
    if (!onLabelScan) return false;
    if (!/^2[01]\d{11}$/.test(raw)) return false;

    try {
      const label = await api<ScannedLabel | null>("/catalog/labels/scan", {
        query: { barcode: raw },
      });
      if (!label) return false;
      onLabelScan(label);
      setTerm("");
      return true;
    } catch {
      /*
       * A label whose PLU no longer exists throws. Returning false lets the
       * ordinary search run and report nothing found, which is a better answer
       * for a cashier holding a real bag than an error box with no next step.
       */
      return false;
    }
  }

  return (
    <div>
      <input
        value={term}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(event) => setTerm(event.target.value)}
        onKeyDown={(event) => {
          // A scanner ends its transmission with Enter. If the term resolved to
          // an exact barcode there is nothing to choose between, so take it.
          if (event.key !== "Enter") return;
          event.preventDefault();

          void (async () => {
            if (await tryLabel(term.trim())) return;
            const rows = results.data ?? [];
            const exact =
              rows.find((r) => r.exactBarcode) ?? (rows.length === 1 ? rows[0] : undefined);
            if (exact) pick(exact);
          })();
        }}
      />

      {debounced.trim() && (results.data?.length ?? 0) > 0 ? (
        <div className="search-results">
          {(results.data ?? []).map((variant) => (
            <button type="button" key={variant.variantId} onClick={() => pick(variant)}>
              <div className="spread">
                <span>
                  <strong>{variant.sku}</strong>
                  {variant.exactBarcode ? " · scanned" : ""}
                  <span className="sub">
                    {variant.productName}
                    {variant.variantName ? ` · ${variant.variantName}` : ""}
                  </span>
                </span>
                {showPrice ? (
                  <span className="nowrap muted small">
                    {variant.price ? money(variant.price) : "no price"} / {variant.stockUomCode}
                  </span>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      ) : null}

      {debounced.trim() && results.isFetched && (results.data?.length ?? 0) === 0 ? (
        looksScanned(debounced) ? (
          /*
           * A scanned code that resolves to nothing is either a first arrival
           * or changed packaging — both fixable in seconds by someone with the
           * permission. Saying only "nothing matches" leaves a cashier stuck
           * with a customer in front of them.
           */
          <div className="alert warn mt">
            <div className="grow">
              <strong className="mono">{debounced}</strong> is not linked to any item.
              <span className="sub">
                {canLink
                  ? "New product, or the packaging changed. Link it and carry on."
                  : "New product, or the packaging changed. A manager can link it from this screen."}
              </span>
            </div>
            {canLink ? (
              <button type="button" className="sm" onClick={() => setLinking(debounced)}>
                Link it
              </button>
            ) : null}
          </div>
        ) : (
          <p className="small muted mt">Nothing matches “{debounced}”.</p>
        )
      ) : null}

      {linking ? (
        <LinkBarcode
          barcode={linking}
          onClose={() => setLinking(null)}
          onLinked={(variant) => {
            setLinking(null);
            // Straight into the cart: the customer is still standing there, and
            // making them re-scan after fixing it is a second interruption.
            pick(variant);
          }}
        />
      ) : null}
    </div>
  );
}
