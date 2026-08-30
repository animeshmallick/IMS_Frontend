import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";

/**
 * Charts.
 *
 * Every screen here already had its numbers in a table, and the tables stay:
 * a shopkeeper reconciling a day needs the exact figure, and a figure in a
 * chart cannot be copied into a spreadsheet or read out over a phone. What a
 * table cannot do is answer "which way is this going" without being read row by
 * row and held in the head — so the chart sits above the table and answers only
 * that.
 *
 * Restraint is deliberate. No gradients under three series, no 3D, no dual
 * axes: the palette has one accent because the app has one thing worth
 * highlighting at a time.
 */

/* ============================================================ theme bridge */

/**
 * Recharts wants real colour values.
 *
 * It writes `fill` and `stroke` as SVG presentation attributes, and `var(...)`
 * in a presentation attribute is not resolved reliably across browsers — so
 * passing `var(--accent)` gives black bars in some of them. The variables are
 * therefore read off the document once and re-read whenever the theme changes,
 * which is the only time they move.
 *
 * `data-theme` is watched rather than the hook's state, because the "system"
 * setting changes nothing in React at all — the OS flips and only the media
 * query knows.
 */
/*
 * Series colours are their own tokens, NOT the UI accent and success.
 *
 * Those two are picked to carry text and icons against a surface. In dark mode
 * they sit at OKLCH lightness 0.71 and 0.77, well outside the 0.48–0.67 band a
 * fill wants, and a chart drawn in them glowed. `--series-*` is a validated
 * categorical set instead: every adjacent pair clears ΔE 8 under simulated
 * protanopia and deuteranopia and ΔE 15 under normal vision, in both modes,
 * against this app's own surfaces.
 *
 * Assign slots in order and never cycle them — the ORDER is what makes the set
 * colourblind-safe, so a chart that skips to slot 5 for its second series has
 * quietly opted out of the guarantee.
 */
const TOKENS = [
  "--series-1",
  "--series-2",
  "--series-3",
  "--series-4",
  "--series-5",
  "--series-6",
  "--series-7",
  "--series-8",
  "--accent",
  "--success",
  "--warn",
  "--danger",
  "--muted",
  "--faint",
  "--fg",
  "--surface",
  "--border-c",
  "--border-strong",
] as const;

type Token = (typeof TOKENS)[number];
export type ChartPalette = Record<Token, string>;

function readPalette(): ChartPalette {
  const styles = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    TOKENS.map((token) => [token, styles.getPropertyValue(token).trim()]),
  ) as ChartPalette;
}

export function useChartPalette(): ChartPalette {
  const [palette, setPalette] = useState<ChartPalette>(readPalette);

  useEffect(() => {
    const refresh = () => setPalette(readPalette());

    // An explicit light/dark choice stamps data-theme on <html>.
    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    // "System" stamps nothing, so the OS flipping is only visible here.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", refresh);

    return () => {
      observer.disconnect();
      media.removeEventListener("change", refresh);
    };
  }, []);

  return palette;
}

/* ================================================================= tooltip */

export type TooltipFormatter = (value: number, key: string) => string;

/**
 * Recharts' own tooltip is an inline-styled white box: unreadable on a dark
 * theme and not restyleable without `!important` on four selectors. Ours is a
 * plain component, so it inherits the app's type, spacing and surface.
 */
function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
  format,
}: {
  active?: boolean;
  payload?: { name?: string; dataKey?: string | number; value?: unknown; color?: string }[];
  label?: unknown;
  labelFormatter?: (label: string) => string;
  format: TooltipFormatter;
}) {
  if (!active || !payload?.length) return null;

  const heading = typeof label === "string" ? (labelFormatter?.(label) ?? label) : String(label ?? "");

  return (
    <div className="chart-tip">
      <div className="tip-label">{heading}</div>
      {payload.map((entry, index) => {
        const key = String(entry.dataKey ?? entry.name ?? index);
        const value = Number(entry.value ?? 0);
        return (
          <div className="tip-row" key={key}>
            <span className="swatch" style={{ background: entry.color }} aria-hidden />
            {entry.name ?? key}
            <span className="tip-value">{format(value, key)}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ================================================================== legend */

export function ChartLegend({ series }: { series: { label: string; color: string }[] }) {
  return (
    <div className="chart-legend">
      {series.map((item) => (
        <span key={item.label}>
          <i style={{ background: item.color }} aria-hidden />
          {item.label}
        </span>
      ))}
    </div>
  );
}

/* ================================================================== charts */

export interface Series {
  /** Key on each row of `data`. */
  key: string;
  label: string;
  color: string;
}

interface BaseProps<T> {
  data: T[];
  /** Key holding the category — a day, a location, a payment method. */
  xKey: string;
  series: Series[];
  /** Formats a value for the tooltip and the y-axis. Usually `money` or `qty`. */
  format: TooltipFormatter;
  /** Shortens the x-axis label; the tooltip still shows the long form. */
  tickFormatter?: (value: string) => string;
  labelFormatter?: (value: string) => string;
  size?: "sm" | "md" | "lg";
  /**
   * A description of the shape, for anyone who cannot see it. A chart with no
   * text alternative is a blank region to a screen reader, and the numbers are
   * right there in the table below — so this points at it.
   */
  summary?: string;
}

function chartClass(size: BaseProps<unknown>["size"]) {
  return size === "sm" ? "chart sm" : size === "lg" ? "chart lg" : "chart";
}

/**
 * A trend over time.
 *
 * Area rather than line: the fill carries magnitude at a glance, which is what
 * "was yesterday a good day" actually asks. Kept to a 14% wash so it never
 * competes with the stroke, which is where the shape lives.
 */
export function TrendChart<T extends Record<string, unknown>>({
  data,
  xKey,
  series,
  format,
  tickFormatter,
  labelFormatter,
  size,
  summary,
}: BaseProps<T>) {
  const gradients = useMemo(
    () => series.map((item) => ({ ...item, id: `fill-${item.key}` })),
    [series],
  );

  return (
    <div className={chartClass(size)} role="img" aria-label={summary}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <defs>
            {gradients.map((item) => (
              <linearGradient key={item.id} id={item.id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={item.color} stopOpacity={0.22} />
                <stop offset="100%" stopColor={item.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>

          {/* Horizontal rules only. Vertical ones fence the data into boxes and
              add nothing: the x-axis is already labelled. */}
          <CartesianGrid strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey={xKey}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={24}
            tickFormatter={tickFormatter}
          />
          <YAxis
            width={56}
            tickLine={false}
            axisLine={false}
            tickMargin={4}
            tickFormatter={(value: number) => format(value, series[0]?.key ?? "")}
          />
          <Tooltip
            content={
              <ChartTooltip format={format} labelFormatter={labelFormatter} />
            }
          />
          {gradients.map((item) => (
            <Area
              key={item.key}
              type="monotone"
              dataKey={item.key}
              name={item.label}
              stroke={item.color}
              strokeWidth={2}
              fill={`url(#${item.id})`}
              // A dot per day is noise at 90 days and useful at 7, so it only
              // appears where there is room for it.
              dot={data.length <= 14 ? { r: 2.5, strokeWidth: 0, fill: item.color } : false}
              activeDot={{ r: 4, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * A comparison across categories.
 *
 * Horizontal when the labels are names — a product or a location needs reading,
 * and rotated text is not read, it is deciphered.
 */
export function CategoryChart<T extends Record<string, unknown>>({
  data,
  xKey,
  series,
  format,
  size,
  summary,
  horizontal,
  /** Colour per bar rather than per series: for a single series where the row
      itself carries state, such as a variance that can be negative. */
  colorFor,
}: BaseProps<T> & {
  horizontal?: boolean;
  colorFor?: (row: T) => string;
}) {
  const single = series[0];
  if (!single) return null;

  return (
    <div className={chartClass(size)} role="img" aria-label={summary}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={{ top: 4, right: 12, bottom: 0, left: 0 }}
        >
          <CartesianGrid strokeDasharray="2 4" vertical={horizontal} horizontal={!horizontal} />
          {horizontal ? (
            <>
              <XAxis
                type="number"
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: number) => format(value, single.key)}
              />
              <YAxis
                type="category"
                dataKey={xKey}
                width={128}
                tickLine={false}
                axisLine={false}
                tickMargin={6}
              />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis
                width={56}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: number) => format(value, single.key)}
              />
            </>
          )}
          <Tooltip content={<ChartTooltip format={format} />} />
          <Bar
            dataKey={single.key}
            name={single.label}
            fill={single.color}
            radius={horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0]}
            maxBarSize={horizontal ? 18 : 44}
            isAnimationActive={false}
          >
            {colorFor
              ? data.map((row, index) => (
                  <Cell key={index} fill={colorFor(row)} />
                ))
              : null}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Shape without furniture, sized to ride along the bottom of a stat card.
 *
 * No axes and no labels on purpose: the figure above it is the value, and this
 * only says how it got there.
 */
export function Sparkline({
  data,
  dataKey,
  color,
  label,
}: {
  data: Record<string, unknown>[];
  dataKey: string;
  color?: string;
  label?: string;
}) {
  const palette = useChartPalette();
  const stroke = color ?? palette["--accent"];

  if (data.length < 2) return null;

  return (
    <div className="spark" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`spark-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={stroke}
            strokeWidth={1.5}
            fill={`url(#spark-${dataKey})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ================================================================== deltas */

/**
 * Period-on-period movement next to a figure.
 *
 * The arrow carries the direction as well as the colour does, so it survives a
 * monochrome print and the readers who would see these two greens and reds as
 * the same colour.
 *
 * `inverse` is for figures where down is the good news — write-offs, shrinkage,
 * time to receive. The screen says which way round it is; the palette does not
 * guess.
 */
export function Delta({
  value,
  previous,
  inverse,
  suffix = "",
}: {
  value: number;
  previous: number | null | undefined;
  inverse?: boolean;
  suffix?: string;
}) {
  if (previous === null || previous === undefined || previous === 0) return null;

  const change = ((value - previous) / Math.abs(previous)) * 100;
  // Under half a percent is noise, and an arrow on noise trains people to
  // ignore the arrow.
  if (!Number.isFinite(change)) return null;
  const flat = Math.abs(change) < 0.5;

  const direction = flat ? "flat" : change > 0 ? "up" : "down";
  const Icon = flat ? Minus : change > 0 ? ArrowUp : ArrowDown;

  return (
    <span className={`delta ${direction}${inverse && !flat ? " inverse" : ""}`}>
      <Icon size={12} aria-hidden />
      {flat ? "no change" : `${Math.abs(change).toFixed(1)}%${suffix}`}
    </span>
  );
}

/**
 * A chart's own empty state.
 *
 * A ResponsiveContainer with no rows renders 260px of blank card, which reads
 * as a chart that failed rather than a period with no sales.
 */
export function ChartEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="chart" style={{ display: "grid", placeItems: "center" }}>
      <span className="hint">{children}</span>
    </div>
  );
}
