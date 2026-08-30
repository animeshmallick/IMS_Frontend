import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useApi, useApiList } from "../../lib/hooks";
import { useUnits } from "../../lib/use-units";
import { Badge, Card, Empty, Field, PageHead, Pager, QueryState, Table } from "../../components/ui";
import { dateTime, humanise, money} from "../../lib/format";
import type { LedgerEntry, Location } from "../../lib/types";

const MOVEMENT_TYPES = [
  "goods_receipt",
  "purchase_return",
  "transfer_out",
  "transfer_in",
  "sale",
  "sale_return",
  "adjustment",
  "stock_count",
  "opening_balance",
  "reversal",
];

/**
 * The stock ledger.
 *
 * Append-only and double-entry: every movement writes two signed legs sharing a
 * group id, one of which is often a virtual counterparty (supplier, customer,
 * scrap). That is why an outward sale shows a matching `customer` line — the two
 * always sum to zero, and this screen is where you prove it when a figure is
 * disputed.
 */
export function StockLedger() {
  const units = useUnits();
  const [params] = useSearchParams();
  const [variantId] = useState(params.get("variantId") ?? "");
  const [locationId, setLocationId] = useState("");
  const [movementType, setMovementType] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const locations = useApi<Location[]>(["locations"], "/locations");

  const ledger = useApiList<LedgerEntry>(["stock", "ledger"], "/stock/ledger", {
    variantId: variantId || undefined,
    locationId: locationId || undefined,
    movementType: movementType || undefined,
    limit,
    offset,
  });

  return (
    <>
      <PageHead
        title="Stock ledger"
        subtitle="Every movement ever posted. Nothing here is edited or deleted — corrections are reversing entries."
      />

      <div className="filters">
        <Field label="Location">
          <select
            value={locationId}
            onChange={(e) => {
              setLocationId(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All locations</option>
            {(locations.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
                {l.isPhysical ? "" : " (virtual)"}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Movement type">
          <select
            value={movementType}
            onChange={(e) => {
              setMovementType(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All movements</option>
            {MOVEMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {humanise(t)}
              </option>
            ))}
          </select>
        </Field>

        {variantId ? (
          <Field label=" ">
            <Badge tone="info">Filtered to one SKU</Badge>
          </Field>
        ) : null}
      </div>

      <Card flush>
        <QueryState
          query={{ ...ledger, data: ledger.data?.items }}
          empty={<Empty title="No movements" hint="Nothing has moved that matches these filters." />}
        >
          <Table
            head={
              <tr>
                <th>When</th>
                <th>Item</th>
                <th>Location</th>
                <th>Batch</th>
                <th>Movement</th>
                <th className="num">Change</th>
                <th className="num">Balance after</th>
                <th className="num">Unit cost</th>
              </tr>
            }
          >
            {(ledger.data?.items ?? []).map((entry) => {
              const inward = Number(entry.qtyDelta) > 0;
              return (
                <tr key={entry.id}>
                  <td className="small nowrap">{dateTime(entry.occurredAt)}</td>
                  <td>
                    {entry.sku}
                    <span className="sub">{entry.productName}</span>
                  </td>
                  <td className="small">
                    {entry.locationName}
                    {!entry.locationIsPhysical ? <span className="sub">virtual</span> : null}
                  </td>
                  <td className="small">{entry.batchCode}</td>
                  <td>
                    <Badge tone={inward ? "success" : "neutral"}>
                      {humanise(entry.movementType)}
                    </Badge>
                  </td>
                  <td className="num">
                    <strong style={{ color: inward ? "var(--success)" : "var(--danger)" }}>
                      {inward ? "+" : ""}
                      {units.format(entry.qtyDelta, entry.stockUomCode)}
                    </strong>
                  </td>
                  <td className="num muted">
                    {entry.locationIsPhysical ? units.format(entry.balanceAfter, entry.stockUomCode) : "—"}
                  </td>
                  <td className="num muted">{money(entry.unitCost)}</td>
                </tr>
              );
            })}
          </Table>
        </QueryState>

        <div className="card-foot">
          <Pager total={ledger.data?.total ?? 0} limit={limit} offset={offset} onChange={setOffset} />
        </div>
      </Card>
    </>
  );
}
