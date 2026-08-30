import { Link } from "react-router-dom";
import { Card } from "../components/ui";
import { ChartLegend, Sparkline, TrendChart, useChartPalette } from "../components/charts";
import { date, dateShort, moneyCompact } from "../lib/format";

/**
 * The dashboard's charts, in their own module so they can be fetched
 * separately.
 *
 * The dashboard is the landing route: everybody arrives here, including the
 * cashier whose entire job is on one other screen. The charting library is
 * ~115 KB gzipped and only means anything to somebody holding
 * `report:financial` — so importing it from Dashboard.tsx directly would post
 * that download to every till in the business to render nothing.
 *
 * Split out and lazily imported, it is fetched by the people who can actually
 * see it and by nobody else.
 */

export interface TrendPoint extends Record<string, unknown> {
  day: string;
  revenue: number;
  margin: number;
}

function useSeries() {
  const palette = useChartPalette();
  return [
    { key: "revenue", label: "Revenue", color: palette["--series-1"] },
    { key: "margin", label: "Margin", color: palette["--series-3"] },
  ];
}

/**
 * Trading at the scale a single day is judged against.
 *
 * "Today's sales: ₹18,420" is a number without a yardstick — good day, bad day,
 * or just a Tuesday? Fourteen days is the shortest window containing two of
 * every weekday, so a quiet Monday reads as a Monday rather than as a problem.
 */
export function TakingsTrend({ data }: { data: TrendPoint[] }) {
  const series = useSeries();

  return (
    <Card
      title="Last 14 days"
      actions={
        <>
          <ChartLegend series={series} />
          <Link className="btn sm" to="/reports">
            Reports
          </Link>
        </>
      }
      flush
    >
      <TrendChart
        data={data}
        xKey="day"
        series={series}
        format={(value) => moneyCompact(value)}
        tickFormatter={dateShort}
        labelFormatter={(value) => date(value)}
        size="sm"
        summary="Revenue and margin for each of the last fourteen days."
      />
    </Card>
  );
}

/** Shape only, riding along the bottom of the month-to-date stat. */
export function TakingsSpark({ data }: { data: TrendPoint[] }) {
  return (
    <Sparkline data={data} dataKey="revenue" label="Revenue over the last fourteen days" />
  );
}
