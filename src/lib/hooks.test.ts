import { describe, expect, it } from "vitest";
import { normaliseList } from "./hooks";

/*
 * These tests exist because of a real outage, not a hypothetical one.
 *
 * `/stock/balances` returns `{ data: { items, hasMore } }` rather than the
 * shared `{ data: [...], meta }` envelope — deliberately, because it is a
 * grouped aggregate and an exact count would cost a second full scan. The
 * client only understood the other two shapes, so `items` came back as the
 * nested OBJECT, the first `.map` threw, and the entire Stock on hand screen
 * went blank. The error named a React component and said nothing at all about
 * the endpoint that caused it.
 *
 * So the property under test is not "does it parse an envelope". It is: does
 * `items` come back as an array NO MATTER WHAT, including for shapes nobody
 * anticipated. That guarantee is what keeps one odd endpoint from taking a
 * screen down.
 */

describe("the three shapes the API actually returns", () => {
  it("a bare array, from an unpaginated endpoint", () => {
    expect(normaliseList([1, 2, 3])).toEqual({ items: [1, 2, 3], total: 3, hasMore: false });
  });

  it("the shared page() envelope", () => {
    expect(
      normaliseList({ data: ["a", "b"], meta: { total: 10, limit: 2, offset: 0 } }),
    ).toEqual({ items: ["a", "b"], total: 10, hasMore: true });
  });

  it("the nested envelope that cannot afford a count", () => {
    expect(normaliseList({ data: { items: ["x"], hasMore: true } })).toEqual({
      items: ["x"],
      total: null,
      hasMore: true,
    });
  });

  /*
   * null total is not "zero results". It is "this endpoint does not count", and
   * the pager renders differently for it — a range and a Next button rather
   * than an invented last page.
   */
  it("reports an absent count as null rather than zero", () => {
    expect(normaliseList({ data: { items: [], hasMore: false } }).total).toBeNull();
    expect(normaliseList({ data: [], meta: { total: 0 } }).total).toBe(0);
  });
});

describe("hasMore", () => {
  it("is true while the page does not reach the total", () => {
    expect(normaliseList({ data: [1, 2], meta: { total: 10, offset: 0 } }).hasMore).toBe(true);
    expect(normaliseList({ data: [1, 2], meta: { total: 10, offset: 8 } }).hasMore).toBe(false);
    expect(normaliseList({ data: [1, 2], meta: { total: 2, offset: 0 } }).hasMore).toBe(false);
  });

  it("takes the nested envelope's word for it, since it did the counting", () => {
    expect(normaliseList({ data: { items: [1], hasMore: true } }).hasMore).toBe(true);
    expect(normaliseList({ data: { items: [1] } }).hasMore).toBe(false);
  });
});

describe("items is always an array", () => {
  /*
   * The actual regression guard. Every one of these once had the potential to
   * blank a screen; none of them should now do worse than render nothing.
   */
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["an empty object", {}],
    ["data as a string", { data: "oops" }],
    ["data as a number", { data: 42 }],
    ["data as null", { data: null }],
    ["a nested object with no items", { data: { hasMore: true } }],
    ["items that are not an array", { data: { items: "nope" } }],
    ["a plain string", "not json"],
    ["a number", 7],
    ["an error-shaped body", { error: { code: "BOOM" } }],
  ])("survives %s", (_label, input) => {
    const result = normaliseList(input);
    expect(Array.isArray(result.items)).toBe(true);
    // And the thing that broke: this must not throw.
    expect(() => result.items.map((x) => x)).not.toThrow();
  });
});
