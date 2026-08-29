import { useState } from "react";
import { useApi } from "../lib/hooks";
import { useDebounced } from "./ui";
import { money } from "../lib/format";
import type { VariantSearchResult } from "../lib/types";

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
  placeholder = "Search by name, SKU or barcode",
  autoFocus,
  showPrice = true,
}: {
  onPick: (variant: VariantSearchResult) => void;
  placeholder?: string;
  autoFocus?: boolean;
  showPrice?: boolean;
}) {
  const [term, setTerm] = useState("");
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
          const rows = results.data ?? [];
          const exact = rows.find((r) => r.exactBarcode) ?? (rows.length === 1 ? rows[0] : undefined);
          if (exact) pick(exact);
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
        <p className="small muted mt">Nothing matches “{debounced}”.</p>
      ) : null}
    </div>
  );
}
