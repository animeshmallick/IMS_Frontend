import { describe, expect, it } from "vitest";
import { decodeInStoreLabel, gramsToQty, looksLikeInStoreLabel } from "./weighed-barcode";

/*
 * This decoder is duplicated from the backend on purpose — the layout is
 * printed onto physical labels that leave the shop and come back weeks later,
 * so it cannot change without invalidating every label already stuck to a bag.
 *
 * Duplication that cannot drift still has to be shown not to have drifted, and
 * this is the offline path: when the till has no connection, these functions
 * are the only thing standing between a scanned label and a ledger entry.
 */

/** Build a valid code the way the printer does, so the tests use real input. */
function code(kind: "weight" | "price", plu: number, value: number): string {
  const twelve =
    "2" +
    (kind === "weight" ? "0" : "1") +
    String(plu).padStart(5, "0") +
    String(value).padStart(5, "0");

  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(twelve[i]) * (i % 2 === 0 ? 1 : 3);
  return twelve + String((10 - (sum % 10)) % 10);
}

describe("recognising one of ours", () => {
  it("accepts the shapes we print", () => {
    expect(looksLikeInStoreLabel(code("weight", 42, 1250))).toBe(true);
    expect(looksLikeInStoreLabel(code("price", 42, 1250))).toBe(true);
  });

  /*
   * A cheap local test, so an ordinary barcode does not cost a round trip on
   * every scan at a busy till.
   */
  it("rejects a manufacturer barcode without looking further", () => {
    expect(looksLikeInStoreLabel("5901234123457")).toBe(false);
    expect(looksLikeInStoreLabel("8901234567890")).toBe(false);
    expect(looksLikeInStoreLabel("atta")).toBe(false);
    expect(looksLikeInStoreLabel("")).toBe(false);
  });
});

describe("decoding a weight label", () => {
  it("recovers the item and the weight", () => {
    expect(decodeInStoreLabel(code("weight", 42, 1250))).toEqual({
      kind: "weight",
      plu: 42,
      value: 1250,
    });
  });

  it("round-trips across the whole range", () => {
    for (const plu of [1, 7, 42, 999, 12_345, 99_999]) {
      for (const value of [0, 1, 250, 1250, 99_999]) {
        expect(decodeInStoreLabel(code("weight", plu, value))).toEqual({
          kind: "weight",
          plu,
          value,
        });
      }
    }
  });

  it("keeps price labels distinguishable from weight labels", () => {
    expect(decodeInStoreLabel(code("price", 42, 1250))?.kind).toBe("price");
    expect(decodeInStoreLabel(code("weight", 42, 1250))?.kind).toBe("weight");
  });

  it("tolerates the whitespace a scanner adds", () => {
    expect(decodeInStoreLabel(`  ${code("weight", 7, 500)}\n`)).toEqual({
      kind: "weight",
      plu: 7,
      value: 500,
    });
  });
});

describe("refusing to guess", () => {
  /*
   * The case that matters most. A damaged label must fall through to the
   * ordinary lookup and find nothing — recoverable. Inventing a weight is not:
   * the sale completes, the stock moves, and the figure is simply wrong.
   */
  it("returns null when the check digit does not match", () => {
    const good = code("weight", 42, 1250);
    const damaged = good.slice(0, 12) + (good[12] === "0" ? "1" : "0");
    expect(decodeInStoreLabel(damaged)).toBeNull();
  });

  it("returns null rather than throwing, so an ordinary scan is not an error", () => {
    expect(decodeInStoreLabel("5901234123457")).toBeNull();
    expect(decodeInStoreLabel("")).toBeNull();
    expect(decodeInStoreLabel("2001234")).toBeNull();
    expect(decodeInStoreLabel("20012345678901")).toBeNull();
    expect(decodeInStoreLabel("2001234abc789")).toBeNull();
  });

  /*
   * Kind digit 2 is a fixed item barcode. It must NOT decode here — it belongs
   * to the ordinary lookup, which is what makes one scan handle both.
   */
  it("does not read a fixed item barcode as a weight label", () => {
    const twelve = "22" + "00042" + "00000";
    let sum = 0;
    for (let i = 0; i < 12; i += 1) sum += Number(twelve[i]) * (i % 2 === 0 ? 1 : 3);
    expect(decodeInStoreLabel(twelve + String((10 - (sum % 10)) % 10))).toBeNull();
  });

  it("returns null for PLU zero, which is never assigned", () => {
    expect(decodeInStoreLabel(code("weight", 0, 1250))).toBeNull();
  });
});

describe("grams to a stock quantity", () => {
  /*
   * Quantities are decimal STRINGS throughout, and must never become floats: a
   * quantity that passes through a float stops summing to zero in the ledger.
   */
  it("produces a string at the stored scale", () => {
    expect(gramsToQty(1250)).toBe("1250.0000");
    expect(gramsToQty(0)).toBe("0.0000");
    expect(gramsToQty(99_999)).toBe("99999.0000");
  });
});
