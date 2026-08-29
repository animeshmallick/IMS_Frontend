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
  const [offset, setOffset] = useState(0);
  const limit = 25;

  const locations = useApi<Location[]>(["locations"], "/locations");
  const receipts = useApiList<GoodsReceiptListItem>(["goods-receipts"], "/goods-receipts", {
    locationId: locationId || undefined,
    limit,
    offset,
  });

  const drafts = (receipts.data?.items ?? []).filter((r) => r.status === "draft").length;

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

      {drafts > 0 ? (
        <div className="alert warn">
          {drafts} receipt{drafts === 1 ? " is" : "s are"} still a draft. Stock does not move until a
          receipt is posted.
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
      </div>

      <Card flush>
        <QueryState
          query={{ ...receipts, data: receipts.data?.items }}
          empty={
            <Empty
              title="No deliveries recorded"
              hint="Open a purchase order that has been placed, then use “Record delivery”."
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
            {(receipts.data?.items ?? []).map((grn) => (
              <tr
                key={grn.id}
                className="clickable"
                onClick={() => navigate(`/goods-receipts/${grn.id}`)}
              >
                <td>
                  <Link to={`/goods-receipts/${grn.id}`}>{grn.grnNumber}</Link>
                </td>
                <td className="small">{grn.poNumber}</td>
                <td className="small">{grn.locationName}</td>
                <td className="small">{grn.supplierInvoiceNo ?? "—"}</td>
                <td>
                  <Badge tone={statusTone(grn.status)}>{humanise(grn.status)}</Badge>
                </td>
                <td className="small">{dateTime(grn.receivedAt)}</td>
              </tr>
            ))}
          </Table>
        </QueryState>

        <div style={{ padding: "0 0.9rem 0.9rem" }}>
          <Pager
            total={receipts.data?.total ?? 0}
            limit={limit}
            offset={offset}
            onChange={setOffset}
          />
        </div>
      </Card>
    </>
  );
}
