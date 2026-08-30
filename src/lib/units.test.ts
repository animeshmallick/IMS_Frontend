import { describe, expect, it } from "vitest";
import type { Uom } from "./types";
import { convertAll, displayQty, formatQty } from "./units";

/*
 * Unit display is where a wrong number is least likely to be noticed.
 *
 * The sale completes, the stock moves, the ledger balances — everything is
 * internally consistent. It is only the figure on the screen and the price
 * beside it that are wrong, and by the time anyone works that out the money has
 * changed hands. So the property that matters most is not "does it pick kg", it
 * is "does quantity times price still equal the same money".
 */

const UNITS: Uom[] = [
  { id: "1", code: "mg", name: "Milligram", dimension: "mass", factorToBase: "0.001", isDimensionBase: false, autoDisplay: false },
  { id: "2", code: "g", name: "Gram", dimension: "mass", factorToBase: "1", isDimensionBase: true, autoDisplay: true },
  { id: "3", code: "kg", name: "Kilogram", dimension: "mass", factorToBase: "1000", isDimensionBase: false, autoDisplay: true },
  { id: "4", code: "q", name: "Quintal", dimension: "mass", factorToBase: "100000", isDimensionBase: false, autoDisplay: false },
  { id: "5", code: "ml", name: "Millilitre", dimension: "volume", factorToBase: "1", isDimensionBase: true, autoDisplay: true },
  { id: "6", code: "l", name: "Litre", dimension: "volume", factorToBase: "1000", isDimensionBase: false, autoDisplay: true },
  { id: "7", code: "mm", name: "Millimetre", dimension: "length", factorToBase: "1", isDimensionBase: true, autoDisplay: true },
  { id: "8", code: "cm", name: "Centimetre", dimension: "length", factorToBase: "10", isDimensionBase: false, autoDisplay: true },
  { id: "9", code: "m", name: "Metre", dimension: "length", factorToBase: "1000", isDimensionBase: false, autoDisplay: true },
  { id: "10", code: "pc", name: "Piece", dimension: "count", factorToBase: "1", isDimensionBase: true, autoDisplay: true },
  { id: "11", code: "dz", name: "Dozen", dimension: "count", factorToBase: "12", isDimensionBase: false, autoDisplay: true },
];

describe("choosing a unit", () => {
  it("shows the largest unit that leaves at least one", () => {
    expect(formatQty("2000", "g", UNITS)).toBe("2 kg");
    expect(formatQty("1250", "g", UNITS)).toBe("1.25 kg");
    expect(formatQty("250", "g", UNITS)).toBe("250 g");
    expect(formatQty("1500", "mm", UNITS)).toBe("1.5 m");
    expect(formatQty("250", "mm", UNITS)).toBe("25 cm");
    expect(formatQty("2000", "ml", UNITS)).toBe("2 l");
  });

  /*
   * The rule left unrestricted is arithmetically perfect and practically
   * absurd: 157,500 g really is 1.575 quintals, and saying so across a counter
   * would get a blank look.
   */
  it("does not reach for units nobody asks for", () => {
    expect(formatQty("157500", "g", UNITS)).toBe("157.5 kg");
    expect(formatQty("500000", "g", UNITS)).toBe("500 kg");
    // And not downward either.
    expect(displayQty("0.5", "g", UNITS).code).toBe("g");
  });

  it("still offers those units when one is pinned", () => {
    expect(formatQty("157500", "g", UNITS, { pin: "q" })).toBe("1.575 q");
    expect(formatQty("250", "g", UNITS, { pin: "kg" })).toBe("0.25 kg");
  });

  /*
   * box, case and strip all carry a factor of 1 because a box of bolts is a
   * hundred and a box of bulbs is not. And nobody wants twelve bulbs on a bill
   * as "1 dz".
   */
  it("leaves counts alone", () => {
    expect(formatQty("12", "pc", UNITS)).toBe("12 pc");
    expect(formatQty("144", "pc", UNITS)).toBe("144 pc");
  });

  it("leaves zero in the stock unit, so a column does not jump about", () => {
    expect(formatQty("0", "g", UNITS)).toBe("0 g");
  });

  it("passes through anything it does not recognise rather than guessing", () => {
    expect(formatQty("5", "furlong", UNITS)).toBe("5 furlong");
    expect(formatQty("5", "g", undefined)).toBe("5 g");
    expect(formatQty("5", "g", [])).toBe("5 g");
    expect(formatQty(null, "g", UNITS)).toBe("—");
  });
});

describe("price converts with the quantity", () => {
  /*
   * The property the whole feature rests on. "2 kg x Rs 0.045" is arithmetic no
   * customer accepts, however right the total underneath happens to be — so
   * quantity and price must move by the same factor, and the line total must
   * come out identical either way.
   */
  it("keeps the line total identical whichever unit is shown", () => {
    const PRICE_PER_GRAM = "0.045";

    for (const grams of ["1", "7", "250", "999", "1000", "1250", "2000", "157500"]) {
      const d = displayQty(grams, "g", UNITS, { unitPrice: PRICE_PER_GRAM });
      const fromStock = Number(grams) * Number(PRICE_PER_GRAM);
      const fromDisplay = d.value * (d.unitPrice ?? 0);
      expect(Math.abs(fromStock - fromDisplay)).toBeLessThan(0.005);
    }
  });

  it("quotes the price in the unit it is showing", () => {
    const d = displayQty("2000", "g", UNITS, { unitPrice: "0.045" });
    expect(d.code).toBe("kg");
    expect(d.unitPrice).toBe(45);
  });

  it("leaves the price alone when the unit does not change", () => {
    const d = displayQty("250", "g", UNITS, { unitPrice: "0.045" });
    expect(d.code).toBe("g");
    expect(d.unitPrice).toBe(0.045);
  });

  it("has no price to convert when none was given", () => {
    expect(displayQty("2000", "g", UNITS).unitPrice).toBeNull();
    expect(displayQty("2000", "g", UNITS, { unitPrice: null }).unitPrice).toBeNull();
  });
});

describe("precision", () => {
  /*
   * Dividing by 1000 moves the point three places. Round to two and 1007 g
   * displays as "1.01 kg", the line stops reconciling, and the error is a
   * rounding artefact nobody can trace.
   */
  it("never displays a value that will not multiply back", () => {
    for (let g = 1; g <= 5000; g += 1) {
      const d = displayQty(String(g), "g", UNITS);
      const factor = Number(UNITS.find((u) => u.code === d.code)!.factorToBase);
      expect(Math.abs(d.value * factor - g)).toBeLessThan(1e-9);
    }
  });

  it("drops trailing zeros, because 2.000 kg is 2 kg", () => {
    expect(formatQty("2000", "g", UNITS)).toBe("2 kg");
    expect(formatQty("3000", "mm", UNITS)).toBe("3 m");
  });
});

describe("the converter", () => {
  it("lists every compatible unit, largest first", () => {
    const rows = convertAll(2.5, "kg", UNITS);
    expect(rows.map((r) => r.code)).toEqual(["q", "kg", "g", "mg"]);
    expect(rows.find((r) => r.code === "g")!.value).toBe(2500);
    expect(rows.find((r) => r.code === "q")!.value).toBe(0.025);
  });

  it("does not cross dimensions — grams are not millilitres", () => {
    expect(convertAll(1, "kg", UNITS).some((r) => r.code === "l")).toBe(false);
  });

  it("returns nothing for a unit it has never heard of", () => {
    expect(convertAll(1, "furlong", UNITS)).toEqual([]);
  });
});
