import { Link2 } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { useApiMutation } from "../lib/hooks";
import { useSessionContext } from "../lib/session";
import { money } from "../lib/format";
import type { VariantSearchResult } from "../lib/types";
import { ErrorBanner, Modal } from "./ui";

/**
 * Attach a barcode that resolves to nothing.
 *
 * Two situations produce one, and they look identical to whoever is holding the
 * scanner:
 *
 *   A product arriving for the first time. It was created before anyone had
 *   seen the packet, so the code on it could not have been entered in advance.
 *
 *   A supplier changing the code on something already stocked — new packaging,
 *   a regional variant, a new pack size. The item is familiar and the number is
 *   not.
 *
 * The second is why this ADDS a barcode and never replaces one. Old packets are
 * still on the shelf with the old code printed on them, and they have to keep
 * scanning until the last one is sold. A variant may hold as many codes as
 * reality requires; retiring the old one is a separate decision for when the
 * old stock is gone, and it belongs on the product page rather than at a till.
 */
export function LinkBarcode({
  barcode,
  onLinked,
  onClose,
}: {
  barcode: string;
  onLinked: (variant: VariantSearchResult) => void;
  onClose: () => void;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<VariantSearchResult[]>([]);
  const [chosen, setChosen] = useState<VariantSearchResult | null>(null);
  const [error, setError] = useState<unknown>(null);

  const link = useApiMutation<{ variantId: string; barcode: string }, unknown>(
    (body) => `/catalog/variants/${body.variantId}/barcodes`,
    { invalidate: [["catalog"]] },
  );

  async function search(value: string) {
    setTerm(value);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    try {
      setResults(
        await api<VariantSearchResult[]>("/catalog/variants/search", {
          query: { q: value.trim(), limit: 10 },
        }),
      );
    } catch (err) {
      setError(err);
    }
  }

  async function attach() {
    if (!chosen) return;
    try {
      /*
       * Never primary. The item may already carry a manufacturer code that the
       * counter sheet prints, and quietly promoting a newly seen number over it
       * would change what gets printed for reasons nobody asked for.
       */
      await link.mutateAsync({ variantId: chosen.variantId, barcode });
      onLinked(chosen);
    } catch (err) {
      setError(err);
    }
  }

  return (
    <Modal
      title="Link this barcode"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={!chosen || link.isPending}
            onClick={() => void attach()}
          >
            <Link2 size={14} aria-hidden />
            Link to {chosen ? chosen.sku : "…"}
          </button>
        </>
      }
    >
      <ErrorBanner error={error ?? link.error} />

      <div className="alert info">
        <div>
          <strong className="mono">{barcode}</strong> is not linked to anything yet.
          <span className="sub">
            Either this product has just arrived for the first time, or its packaging has
            changed. Search for the item it belongs to.
          </span>
        </div>
      </div>

      <label className="field">
        <span>Which item is this?</span>
        <input
          autoFocus
          value={term}
          placeholder="Name or SKU"
          onChange={(event) => void search(event.target.value)}
        />
      </label>

      {results.length > 0 ? (
        <div className="search-results mt">
          {results.map((variant) => (
            <button
              type="button"
              key={variant.variantId}
              className={chosen?.variantId === variant.variantId ? "active" : ""}
              onClick={() => setChosen(variant)}
            >
              <div className="spread">
                <span>
                  <strong>{variant.sku}</strong>
                  <span className="sub">
                    {variant.productName}
                    {variant.variantName ? ` · ${variant.variantName}` : ""}
                  </span>
                </span>
                <span className="nowrap muted small">
                  {variant.price ? money(variant.price) : "no price"} / {variant.stockUomCode}
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : null}

      <p className="hint mt">
        This <strong>adds</strong> a code rather than replacing one. Anything already on the
        shelf with the old barcode keeps scanning — retire it from the product page once that
        stock is gone.
      </p>
    </Modal>
  );
}

/**
 * Whether a failed search was a SCAN rather than typing.
 *
 * Offering to link "atta" would be nonsense. A run of digits long enough to be
 * a real barcode almost certainly came from a scanner, and that is the only
 * case where linking is the right suggestion.
 */
export function looksScanned(term: string): boolean {
  return /^\d{8,14}$/.test(term.trim());
}

/** Whether this user may link one at all. */
export function useCanLinkBarcode(): boolean {
  const { can } = useSessionContext();
  return can("catalog:write");
}
