import { PackageCheck } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApi, useApiList } from "../../lib/hooks";
import { Badge, Card, Empty, Field, PageHead, Pager, QueryState, Table } from "../../components/ui";
import { dateTime, humanise, statusTone } from "../../lib/format";
import type { GoodsReceiptListItem, Location } from "../../lib/types";

/**
 * Goods in.
 *
 * A DRAFT receipt has been keyed but has not moved any stock; a POSTED one has
 * created batches and written to the ledger. The distinction is the whole point
 * of the two-step flow, so it leads the list rather than hiding in a column.
 */
export function GoodsReceipts() {
  const navigate = useNavigate();
  const [locationId, setLocationId] = useState("");
  const [draftsOnly, setDraftsOnly] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = 25;

  const locations = useApi<Location[]>(["locations"], "/locations");
  const receipts = useApiList<GoodsReceiptListItem>(
    ["goods-receipts", draftsOnly],
    "/goods-receipts",
    {
      locationId: locationId || undefined,
      status: draftsOnly ? "draft" : undefined,
      limit,
      offset,
    },
  );

  const items = receipts.data?.items ?? [];
  const drafts = items.filter((r) => r.status === "draft").length;
  const filtered = Boolean(locationId) || draftsOnly;

  const clear = () => {
    setLocationId("");
    setDraftsOnly(false);
    setOffset(0);
  };

  return (
    <>
      <PageHead
        title="Goods in"
        subtitle="Deliveries recorded against purchase orders"
        actions={
          <Link className="btn" to="/purchase-orders">
            Find a purchase order
          </Link>
        }
      />

      {/*
       * A draft receipt is stock that has physically arrived and that the system
       * still believes is not here. That is worth interrupting for — and worth
       * making actionable, so the warning filters the list rather than merely
       * mentioning a number and leaving the reader to find them.
       */}
      {drafts > 0 && !draftsOnly ? (
        <div className="alert warn">
          <div className="grow">
            <strong>
              {drafts} receipt{drafts === 1 ? " is" : "s are"} still a draft.
            </strong>{" "}
            Stock does not move until a receipt is posted.
          </div>
          <button
            type="button"
            className="sm"
            onClick={() => {
              setDraftsOnly(true);
              setOffset(0);
            }}
          >
            Show them
          </button>
        </div>
      ) : null}

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
            {(locations.data ?? [])
              .filter((l) => l.isPhysical && !l.isSystem)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </select>
        </Field>

        <label className="check">
          <input
            type="checkbox"
            checked={draftsOnly}
            onChange={(e) => {
              setDraftsOnly(e.target.checked);
              setOffset(0);
            }}
          />
          Drafts only
        </label>

        {filtered ? (
          <button type="button" className="ghost sm" onClick={clear}>
            Clear filters
          </button>
        ) : null}
      </div>

      <Card flush>
        <QueryState
          query={{ ...receipts, data: receipts.data?.items }}
          empty={
            <Empty
              icon={<PackageCheck size={14} aria-hidden />}
              title={draftsOnly ? "No drafts" : "No deliveries recorded"}
              hint={
                draftsOnly
                  ? "Every receipt here has been posted."
                  : "Open a purchase order that has been placed, then use “Record delivery”."
              }
            />
          }
        >
          <Table
            head={
              <tr>
                <th>Receipt</th>
                <th>Purchase order</th>
                <th>Location</th>
                <th>Supplier invoice</th>
                <th>Status</th>
                <th>Received</th>
              </tr>
            }
          >
            {items.map((grn) => (
              <tr
                key={grn.id}
                className={grn.status === "draft" ? "clickable warn" : "clickable"}
                onClick={() => navigate(`/goods-receipts/${grn.id}`)}
              >
                <td>
                  <Link to={`/goods-receipts/${grn.id}`} className="mono">
                    {grn.grnNumber}
                  </Link>
                  {grn.status === "draft" ? (
                    <span className="sub warn">Stock not moved yet</span>
                  ) : null}
                </td>
                <td className="small mono">{grn.poNumber}</td>
                <td className="small">{grn.locationName}</td>
                <td className="small mono">{grn.supplierInvoiceNo ?? "—"}</td>
                <td>
                  <Badge tone={statusTone(grn.status)}>{humanise(grn.status)}</Badge>
                </td>
                <td className="small">{dateTime(grn.receivedAt)}</td>
              </tr>
            ))}
          </Table>
        </QueryState>

        <div className="card-foot">
          <Pager
            total={receipts.data?.total ?? null}
            hasMore={receipts.data?.hasMore ?? false}
            limit={limit}
            offset={offset}
            onChange={setOffset}
          />
        </div>
      </Card>
    </>
  );
}
