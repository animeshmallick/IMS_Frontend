import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApiList } from "../../lib/hooks";
import { useSessionContext } from "../../lib/session";
import { Badge, Card, Empty, Field, PageHead, Pager, QueryState, Table } from "../../components/ui";
import { date, humanise, money, statusTone } from "../../lib/format";
import type { PurchaseOrderListItem } from "../../lib/types";

const STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "ordered",
  "partially_received",
  "received",
  "closed",
  "cancelled",
];

/**
 * Purchase orders.
 *
 * The status is the whole story of a PO, so it leads: a buyer's question is
 * almost always "what is waiting on me" — drafts to finish, submissions to
 * approve, deliveries outstanding.
 */
export function PurchaseOrders() {
  const { can } = useSessionContext();
  const navigate = useNavigate();
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 25;

  const orders = useApiList<PurchaseOrderListItem>(["purchase-orders"], "/purchase-orders", {
    status: status || undefined,
    limit,
    offset,
  });

  return (
    <>
      <PageHead
        title="Purchase orders"
        subtitle="Order from a supplier, then record what actually arrives against it"
        actions={
          can("po:write") ? (
            <Link className="btn primary" to="/purchase-orders/new">
              New purchase order
            </Link>
          ) : null
        }
      />

      <div className="filters">
        <Field label="Status">
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanise(s)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Card flush>
        <QueryState
          query={{ ...orders, data: orders.data?.items }}
          empty={
            <Empty
              title="No purchase orders"
              hint={
                can("po:write")
                  ? "Raise one to start ordering stock from a supplier."
                  : "Nothing matches this filter."
              }
            />
          }
        >
          <Table
            head={
              <tr>
                <th>Number</th>
                <th>Supplier</th>
                <th>Deliver to</th>
                <th>Expected</th>
                <th>Status</th>
                <th className="num">Value</th>
              </tr>
            }
          >
            {(orders.data?.items ?? []).map((po) => (
              <tr
                key={po.id}
                className="clickable"
                onClick={() => navigate(`/purchase-orders/${po.id}`)}
              >
                <td>
                  <Link to={`/purchase-orders/${po.id}`}>{po.poNumber}</Link>
                  <span className="sub">Raised {date(po.createdAt)}</span>
                </td>
                <td>{po.supplierName}</td>
                <td className="small">{po.destinationName}</td>
                <td className="small">{date(po.expectedDate)}</td>
                <td>
                  <Badge tone={statusTone(po.status)}>{humanise(po.status)}</Badge>
                </td>
                <td className="num">{money(po.total)}</td>
              </tr>
            ))}
          </Table>
        </QueryState>

        <div style={{ padding: "0 0.9rem 0.9rem" }}>
          <Pager total={orders.data?.total ?? 0} limit={limit} offset={offset} onChange={setOffset} />
        </div>
      </Card>
    </>
  );
}
