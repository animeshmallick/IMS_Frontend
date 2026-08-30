/**
 * Reading in-store weight labels without the server.
 *
 * This mirrors `backend/src/shared/weighed-barcode.ts`. Duplicating logic across
 * repositories is normally a mistake, and it is worth saying why it is not one
 * here: the layout is printed onto physical labels that go out of the shop and
 * come back weeks later. It cannot be changed without invalidating every label
 * already stuck to a bag, so it is frozen by the paper, not by convention. A
 * format that cannot drift cannot drift out of sync.
 *
 * Only DECODE lives here. Building a barcode stays on the server, next to its
 * tests, because that is the direction where a wrong digit is expensive — it
 * would print three hundred grams onto a three kilo bag. Reading a bad code
 * fails safe: the till simply does not recognise it.
 *
 *     2  K  IIIII  VVVVV  C
 *        │  │      │      check digit
 *        │  │      grams (or paise)
 *        │  item code
 *        kind: 0 weight, 1 price
 */

export interface DecodedLabel {
  kind: "weight" | "price";
  plu: number;
  /** Grams for a weight label, paise for a price label. */
  value: number;
}

/** Cheap test for "could this be one of ours" — used before doing real work. */
export function looksLikeInStoreLabel(barcode: string): boolean {
  return /^2[01]\d{11}$/.test(barcode.trim());
}

function checkDigit(twelve: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    // i is 0-indexed, so an even i is an ODD position: weight 1, else 3.
    sum += Number(twelve[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return String((10 - (sum % 10)) % 10);
}

/**
 * Decode, or null if this is not one of ours.
 *
 * Null rather than a throw, and null for a damaged label too. Every scan at the
 * till comes through here, so an ordinary manufacturer barcode arriving is the
 * normal case rather than an error — and a label with a broken check digit must
 * fall through to the ordinary lookup rather than have a quantity invented for
 * it. Finding nothing is recoverable; guessing at a weight is not.
 */
export function decodeInStoreLabel(barcode: string): DecodedLabel | null {
  const digits = barcode.trim();
  if (!/^\d{13}$/.test(digits)) return null;
  if (digits[0] !== "2") return null;

  const kindDigit = digits[1];
  const kind = kindDigit === "0" ? "weight" : kindDigit === "1" ? "price" : null;
  if (!kind) return null;

  if (checkDigit(digits.slice(0, 12)) !== digits[12]) return null;

  const plu = Number(digits.slice(2, 7));
  if (plu < 1) return null;

  return { kind, plu, value: Number(digits.slice(7, 12)) };
}

/**
 * Grams to a stock quantity string.
 *
 * The decimal point is moved in text rather than by dividing. Quantities are
 * decimal STRINGS throughout this system and must never become floats: a
 * quantity that passes through a float stops summing to zero in the ledger.
 */
export function gramsToQty(grams: number): string {
  return `${Math.round(grams)}.0000`;
}
