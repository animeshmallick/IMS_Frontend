import { defineConfig } from "vitest/config";

/**
 * Tests for the logic where a mistake costs money.
 *
 * Deliberately not a component-rendering suite. What is worth protecting here
 * is the handful of pure functions that stand between a scanned barcode and a
 * ledger entry: unit conversion, barcode decoding, and the list-envelope
 * normalisation that once took a whole screen down. Each is small, has no
 * dependencies, and is wrong in ways nobody notices — the sale still completes,
 * it is just for the wrong amount.
 *
 * Rendering tests would need a DOM, a query client and a router, and would
 * mostly assert that React renders. These need none of that, so they run in
 * milliseconds and there is no excuse to skip them.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
