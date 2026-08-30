/**
 * Display formatting.
 *
 * Every money and quantity value from the API is a STRING, because the columns
 * behind them are Postgres `numeric`. These helpers format for display and
 * nothing else — the string is what gets sent back on a write. Parsing one to a
 * number to "clean it up" reintroduces the float error the backend goes to some
 * length to avoid, and it comes back as a balance of 0.30000000000000004.
 */

const MONEY = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function money(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? MONEY.format(n) : String(value);
}

/**
 * Money with the digits taken off, for chart axes and nothing else.
 *
 * A y-axis reading "₹1,20,000.00" four times over is 56px of tick label for a
 * scale nobody reads precisely — the point of the axis is the order of
 * magnitude, and the exact figure is in the tooltip and in the table below it.
 * Indian grouping, so a lakh is a lakh rather than "₹120K".
 */
const MONEY_COMPACT = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  maximumFractionDigits: 1,
});

export function moneyCompact(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  // Below a thousand, compact notation gains nothing and loses the paisa.
  return Math.abs(n) < 1000 ? MONEY.format(n) : MONEY_COMPACT.format(n);
}

/** A short axis label: "25 Aug", not "25 Aug 2026". The year is in the filter. */
export function dateShort(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

/**
 * Quantities keep up to three decimals but drop trailing zeros: a shop selling
 * bolts wants "12", not "12.000", while one selling atta needs "0.25".
 */
export function qty(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString("en-IN", { maximumFractionDigits: 3 });
}

export function qtyWithUom(value: string | null | undefined, uom?: string | null): string {
  const q = qty(value);
  return uom && q !== "—" ? `${q} ${uom}` : q;
}

export function date(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function dateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** For date inputs, which only accept YYYY-MM-DD. */
export function toDateInput(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function daysUntil(value: string | null | undefined): number | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

/** Turns `partially_received` into `Partially received` for display. */
export function humanise(value: string | null | undefined): string {
  if (!value) return "—";
  const spaced = value.replace(/[_-]/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Decimal-safe addition for the few places the UI has to total a column itself
 * (a cart subtotal shown while typing). Works in integer minor units, so the
 * displayed total matches what the server computes rather than drifting by a
 * paisa on the twentieth line. The server still recomputes and is the authority.
 */
export function sumMoney(values: (string | number)[]): string {
  const total = values.reduce<number>((acc, v) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? acc + Math.round(n * 100) : acc;
  }, 0);
  return (total / 100).toFixed(2);
}

export function multiplyMoney(unit: string | number, quantity: string | number): string {
  const u = typeof unit === "number" ? unit : Number(unit);
  const q = typeof quantity === "number" ? quantity : Number(quantity);
  if (!Number.isFinite(u) || !Number.isFinite(q)) return "0.00";
  return (Math.round(u * q * 100) / 100).toFixed(2);
}

/** Status -> badge tone, shared by every document list so colour means one thing. */
export function statusTone(status: string): "neutral" | "info" | "success" | "warn" | "danger" {
  switch (status) {
    case "draft":
    case "cart":
    case "open":
    case "counting":
      return "neutral";
    case "submitted":
    case "pending_approval":
    case "approved":
    case "ordered":
    case "in_transit":
    case "dispatched":
    case "partially_received":
    case "closed":
      return "info";
    case "posted":
    case "received":
    case "placed":
    case "completed":
    case "reconciled":
      return "success";
    case "on_hold":
    case "short_closed":
    case "quarantine":
    case "expiring":
      return "warn";
    case "cancelled":
    case "rejected":
    case "expired":
    case "voided":
      return "danger";
    default:
      return "neutral";
  }
}
