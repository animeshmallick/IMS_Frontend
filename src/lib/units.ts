import type { Uom } from "./types";

/**
 * Showing quantities in the unit a person would actually say.
 *
 * Stock is STORED in the base unit of its dimension — grams, millilitres,
 * millimetres — and that never changes. It is what keeps the ledger exact: a
 * quantity that never leaves the base unit never picks up a rounding error, and
 * `SUM(qty_delta)` still lands on zero. Everything here is display only, and
 * nothing in this file is ever written back.
 *
 * What it fixes is that "157500 g" is technically correct and useless. Nobody
 * running a shop thinks in grams above about a kilo, and a column of six-figure
 * gram counts cannot be scanned for the one line that is wrong.
 *
 * The rule is the one people use by hand: show the largest unit that leaves a
 * number of at least 1.
 *
 *     2000 g   ->  2 kg
 *     1250 g   ->  1.25 kg
 *      250 g   ->  250 g       (0.25 kg reads worse)
 *        7 g   ->  7 g
 *     1500 mm  ->  1.5 m
 */

/**
 * Count is excluded, deliberately.
 *
 * Two reasons. `box`, `case` and `strip` all carry a factor of 1 in the unit
 * table, because a box of bolts is a hundred and a box of bulbs is not — the
 * real pack size lives per variant, not per unit. And nobody wants twelve bulbs
 * printed on a bill as "1 dz". Pieces stay pieces.
 */
const CONVERTIBLE = new Set(["mass", "volume", "length", "area"]);

export interface Converted {
  /** The number to print, already rounded for display. */
  value: number;
  /** The unit it is in. */
  code: string;
  /**
   * What one of this unit costs, when a unit price was supplied.
   *
   * Converted by the same factor, and this is not optional dressing: showing
   * "2 kg" beside a per-gram price makes the line read 2 × 0.045 = 90, which is
   * arithmetic no customer will accept. Quantity and price convert together or
   * neither does.
   */
  unitPrice: number | null;
  /** True when a different unit was chosen, for callers that want to say so. */
  converted: boolean;
}

/**
 * Decimal places that will still multiply back.
 *
 * Dividing by 1000 moves the point three places, so three decimals are needed
 * to represent a whole gram exactly in kilograms. Fewer, and 1007 g displays as
 * "1.01 kg" and the line stops reconciling. Capped at four, which is the scale
 * the quantity columns are stored at — there is nothing below it to preserve.
 */
function decimalsFor(factor: number): number {
  if (factor <= 1) return 0;
  return Math.min(4, Math.ceil(Math.log10(factor)));
}

/** Trailing zeros are noise: 2.000 kg is 2 kg. */
function trim(value: number, decimals: number): number {
  return Number(value.toFixed(decimals));
}

/**
 * Choose the unit for a quantity held in `stockUomCode`.
 *
 * `units` is the unit table as the API returns it — so adding a unit through
 * the admin screen changes what the whole app displays, with no code change.
 * An unknown unit, or one whose dimension is not convertible, comes back
 * unchanged rather than guessed at.
 */
export function displayQty(
  qty: string | number | null | undefined,
  stockUomCode: string | null | undefined,
  units: Uom[] | undefined,
  options: { unitPrice?: string | number | null; pin?: string | null } = {},
): Converted {
  const raw = typeof qty === "number" ? qty : Number(qty ?? 0);
  const price =
    options.unitPrice === null || options.unitPrice === undefined || options.unitPrice === ""
      ? null
      : Number(options.unitPrice);

  const unchanged: Converted = {
    value: Number.isFinite(raw) ? raw : 0,
    code: stockUomCode ?? "",
    unitPrice: price,
    converted: false,
  };

  if (!Number.isFinite(raw) || !stockUomCode || !units?.length) return unchanged;

  const stockUnit = units.find((u) => u.code === stockUomCode);
  if (!stockUnit || !CONVERTIBLE.has(stockUnit.dimension)) return unchanged;

  /*
   * Everything is compared in base units, so this works whether or not the
   * stock unit is itself the base — a variant stocked in kilograms converts to
   * quintals by exactly the same path.
   */
  const stockFactor = Number(stockUnit.factorToBase);
  if (!Number.isFinite(stockFactor) || stockFactor <= 0) return unchanged;
  const inBase = raw * stockFactor;

  const candidates = units
    .filter((u) => u.dimension === stockUnit.dimension && Number(u.factorToBase) > 0)
    .sort((a, b) => Number(b.factorToBase) - Number(a.factorToBase));

  const pinned = options.pin ? candidates.find((u) => u.code === options.pin) : undefined;

  /*
   * Only units marked for automatic display are eligible to be CHOSEN. Left
   * unrestricted, "largest unit that leaves at least 1" is arithmetically
   * perfect and practically wrong: 157,500 g of atta becomes "1.575 q", which
   * would get a blank look across a counter. Pinning and the converter are
   * unaffected — this narrows what the app picks by itself, not what exists.
   */
  const automatic = candidates.filter((u) => u.autoDisplay !== false);

  /*
   * Largest unit that leaves at least 1. Zero has no natural unit — it stays in
   * the stock unit, because "0 kg" and "0 g" say the same thing and changing
   * the unit on an empty row makes a column jump around for no reason.
   */
  const chosen =
    pinned ??
    (inBase === 0
      ? stockUnit
      : (automatic.find((u) => Math.abs(inBase) / Number(u.factorToBase) >= 1) ?? stockUnit));

  const factor = Number(chosen.factorToBase);
  const decimals = decimalsFor(factor);
  const value = trim(inBase / factor, decimals);

  return {
    value,
    code: chosen.code,
    // Price is per stock unit, so it scales by how many stock units make one
    // display unit — not by the display unit's factor alone.
    unitPrice: price === null ? null : trim(price * (factor / stockFactor), 4),
    converted: chosen.code !== stockUnit.code,
  };
}

/** Formatted for display: "1.25 kg". */
export function formatQty(
  qty: string | number | null | undefined,
  stockUomCode: string | null | undefined,
  units: Uom[] | undefined,
  options: { pin?: string | null } = {},
): string {
  if (qty === null || qty === undefined || qty === "") return "—";
  const d = displayQty(qty, stockUomCode, units, options);
  const shown = d.value.toLocaleString("en-IN", { maximumFractionDigits: 4 });
  return d.code ? `${shown} ${d.code}` : shown;
}

/**
 * Every unit a quantity can be expressed in — for the converter screen.
 *
 * Sorted largest first, which is how a conversion table is read.
 */
export function convertAll(
  amount: number,
  fromCode: string,
  units: Uom[],
): { code: string; name: string; value: number }[] {
  const from = units.find((u) => u.code === fromCode);
  if (!from) return [];

  const inBase = amount * Number(from.factorToBase);

  return units
    .filter((u) => u.dimension === from.dimension && Number(u.factorToBase) > 0)
    .sort((a, b) => Number(b.factorToBase) - Number(a.factorToBase))
    .map((u) => ({
      code: u.code,
      name: u.name,
      // Not rounded for display here: the converter is a calculator, and a
      // calculator that hides digits is worse than useless.
      value: inBase / Number(u.factorToBase),
    }));
}
