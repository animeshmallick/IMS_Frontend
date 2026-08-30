import { useApi } from "./hooks";
import type { Uom } from "./types";
import { displayQty, formatQty } from "./units";

/**
 * The unit table, and the formatters that read it.
 *
 * Fetched once and held for the session. Units change about as often as the
 * shop changes what business it is in, so a long stale time is right — and it
 * means a table of two hundred stock lines does not each ask how many grams are
 * in a kilogram.
 *
 * Everything the app displays flows through here, so adding a unit on the
 * Units screen changes what the whole application shows without a deploy.
 */
export function useUnits() {
  const query = useApi<Uom[]>(["catalog", "uoms"], "/catalog/uoms", undefined, {
    staleTime: 30 * 60_000,
  });

  const units = query.data;

  return {
    units,
    loading: query.isPending,

    /** "1.25 kg" — the quantity in the unit a person would say. */
    format: (qty: string | number | null | undefined, stockUomCode: string | null | undefined) =>
      formatQty(qty, stockUomCode, units),

    /**
     * Quantity and unit price together, converted by the same factor.
     *
     * They have to move together. "2 kg × ₹0.045" is arithmetic no customer
     * will accept, however correct the total underneath it happens to be.
     */
    line: (
      qty: string | number | null | undefined,
      stockUomCode: string | null | undefined,
      unitPrice?: string | number | null,
    ) => displayQty(qty, stockUomCode, units, { unitPrice }),
  };
}
