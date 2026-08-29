import { useState } from "react";
import { Link } from "react-router-dom";
import { useApi, useApiList } from "../../lib/hooks";
import { useSessionContext } from "../../lib/session";
import {
  Badge,
  Card,
  Empty,
  Field,
  PageHead,
  Pager,
  QueryState,
  Table,
  useDebounced,
} from "../../components/ui";
import { date, daysUntil, money, qty } from "../../lib/format";
import type { Location, StockBalance, Valuation } from "../../lib/types";

/**
 * Stock on hand.
 *
 * `available` rather than `onHand` is what a person actually needs: units held
 * by an open cart or a raised transfer are physically present but already
 * promised, and treating them as sellable is how the last unit gets sold twice.
 * Both are shown, with the reserved difference called out.
 */
export function StockOnHand() {
  const { can, activeLocation } = useSessionContext();
  const [search, setSearch] = useState("");
  const [locationId, setLocationId] = useState(activeLocation?.id ?? "");
  const [belowReorder, setBelowReorder] = useState(false);
  const [includeZero, setIncludeZero] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const debounced = useDebounced(search);

  const locations = useApi<Location[]>(["locations"], "/locations");

  const balances = useApiList<StockBalance>(["stock", "balances"], "/stock/balances", {
    search: debounced || undefined,
    locationId: locationId || undefined,
    belowReorderPoint: belowReorder || undefined,
    includeZero: includeZero || undefined,
    limit,
    offset,
  });

  const valuation = useApi<Valuation>(
    ["stock", "valuation"],
    "/stock/valuation",
    { locationId: locationId || undefined },
    { enabled: can("report:financial") },
  );

  const totalValue = (valuation.data?.byLocation ?? []).reduce(
    (sum, row) => sum + Number(row.totalValue),
    0,
  );

  return (
    <>
      <PageHead
        title="Stock on hand"
        subtitle="What is physically present, and how much of it is already promised"
        actions={
          <>
            {can("stock:adjust") ? (
              <Link className="btn" to="/adjustments/new">
                Adjust stock
              </Link>
            ) : null}
            {can("stock:transfer") ? (
              <Link className="btn primary" to="/transfers/new">
                Move stock
              </Link>
            ) : null}
          </>
        }
      />

      {can("report:financial") && valuation.data ? (
        <div className="grid cols-3 mb">
          <Card>
            <div className="stat">
              <div className="label">Stock value</div>
              <div className="value">{money(totalValue)}</div>
              <div className="hint">At batch cost{locationId ? ", this location" : ", all locations"}</div>
            </div>
          </Card>
          <Card>
            <div className="stat">
              <div className="label">In transit</div>
              <div className="value">{money(valuation.data.inTransitValue)}</div>
              <div className="hint">Dispatched but not yet received</div>
            </div>
          </Card>
          <Card>
            <div className="stat">
              <div className="label">Lines shown</div>
              <div className="value">{balances.data?.total ?? 0}</div>
            </div>
          </Card>
        </div>
      ) : null}

      <div className="filters">
        <Field label="Search">
          <input
            value={search}
            placeholder="SKU, name or barcode"
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
          />
        </Field>

        <Field label="Location">
          <select
            value={locationId}
            onChange={(e) => {
              setLocationId(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All locations</option>
            {(locations.data ?? [])
              .filter((l) => l.isPhysical && !l.isSystem)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </select>
        </Field>

        <Field label=" ">
          <label className="row small">
            <input
              type="checkbox"
              checked={belowReorder}
              onChange={(e) => {
                setBelowReorder(e.target.checked);
                setOffset(0);
              }}
            />
            Below reorder point
          </label>
        </Field>

        <Field label=" ">
          <label className="row small">
            <input
              type="checkbox"
              checked={includeZero}
              onChange={(e) => {
                setIncludeZero(e.target.checked);
                setOffset(0);
              }}
            />
            Include zero balances
          </label>
        </Field>
      </div>

      <Card flush>
        <QueryState
          query={{ ...balances, data: balances.data?.items }}
          empty={
            <Empty
              title="No stock matches"
              hint="Try a different search, or tick 'include zero balances' to see items that have run out."
            />
          }
        >
          <Table
            head={
              <tr>
                <th>Item</th>
                <th>Location</th>
                <th className="num">On hand</th>
                <th className="num">Reserved</th>
                <th className="num">Available</th>
                <th className="num">Batches</th>
                <th>Earliest expiry</th>
                {can("report:financial") ? <th className="num">Value</th> : null}
              </tr>
            }
          >
            {(balances.data?.items ?? []).map((row) => {
              const days = daysUntil(row.earliestExpiry);
              const low =
                row.reorderPoint !== null && Number(row.available) <= Number(row.reorderPoint);

              return (
                <tr key={`${row.variantId}-${row.locationId}`}>
                  <td>
                    <Link to={`/stock/ledger?variantId=${row.variantId}`}>{row.sku}</Link>
                    <span className="sub">
                      {row.productName}
                      {row.variantName ? ` · ${row.variantName}` : ""}
                    </span>
                  </td>
                  <td className="small">{row.locationName}</td>
                  <td className="num">{qty(row.onHand)}</td>
                  <td className="num muted">
                    {Number(row.reserved) > 0 ? qty(row.reserved) : "—"}
                  </td>
                  <td className="num">
                    <strong>{qty(row.available)}</strong> <span className="muted small">{row.stockUomCode}</span>
                    {low ? (
                      <span className="sub">
                        <Badge tone="warn">Reorder</Badge>
                      </span>
                    ) : null}
                  </td>
                  <td className="num muted">{row.batchCount}</td>
                  <td>
                    {row.earliestExpiry ? (
                      <>
                        {date(row.earliestExpiry)}
                        {days !== null && days <= 30 ? (
                          <span className="sub">
                            <Badge tone={days < 0 ? "danger" : "warn"}>
                              {days < 0 ? `${-days}d overdue` : `${days}d`}
                            </Badge>
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  {can("report:financial") ? (
                    <td className="num">{money(row.stockValue)}</td>
                  ) : null}
                </tr>
              );
            })}
          </Table>
        </QueryState>

        <div style={{ padding: "0 0.9rem 0.9rem" }}>
          <Pager
            total={balances.data?.total ?? 0}
            limit={limit}
            offset={offset}
            onChange={setOffset}
          />
        </div>
      </Card>
    </>
  );
}
