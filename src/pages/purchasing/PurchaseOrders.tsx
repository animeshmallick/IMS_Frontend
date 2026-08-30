import { ClipboardList } from "lucide-react";
import { useApiList } from "../../lib/hooks";
import { useSessionContext } from "../../lib/session";
import { Badge, Card, Empty, PageHead, Pager, QueryState, Table } from "../../components/ui";
import { date, humanise, money, statusTone } from "../../lib/format";
import type { PurchaseOrderListItem } from "../../lib/types";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

/**
 * Purchase orders.
 *
 * The status is the whole story of a PO, so it leads: a buyer's question is
 * almost always "what is waiting on me" — drafts to finish, submissions to
 * approve, deliveries outstanding.
 *
 * Which is why the status filter is a segmented control rather than a dropdown.
 * A select hides the very thing the page is organised around and costs two
 * clicks to answer the only question anyone opens this screen with; the
 * segments answer it before you click at all, because the counts are on them.
 */

/**
 * The four views that correspond to a decision, plus everything.
 *
 * Not one tab per status: eight tabs is a list to read, and nobody asks "show
 * me cancelled" often enough to spend a tab on it. `statuses` is what goes to
 * the API, so "Open" is genuinely one request rather than a client-side filter
 * over a page of results.
 */
const VIEWS: { key: string; label: string; statuses?: string[] }[] = [
  { key: "open", label: "Open", statuses: ["ordered", "partially_received"] },
  { key: "todo", label: "Needs action", statuses: ["draft", "pending_approval", "approved"] },
  { key: "done", label: "Received", statuses: ["received", "closed"] },
  { key: "all", label: "All" },
];

export function PurchaseOrders() {
  const { can } = useSessionContext();
  const navigate = useNavigate();
  const [view, setView] = useState("open");
  const [offset, setOffset] = useState(0);
  const limit = 25;

  const current = VIEWS.find((v) => v.key === view) ?? VIEWS[3]!;

  const orders = useApiList<PurchaseOrderListItem>(["purchase-orders", view], "/purchase-orders", {
    status: current.statuses?.join(",") || undefined,
    limit,
    offset,
  });

  const select = (key: string) => {
    setView(key);
    setOffset(0);
  };

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

      <div className="mb">
        <div className="seg" role="tablist" aria-label="Purchase order status">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={view === v.key}
              className={view === v.key ? "active" : ""}
              onClick={() => select(v.key)}
            >
              {v.label}
              {view === v.key && orders.data?.total ? (
                <span className="count">{orders.data.total}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <Card flush>
        <QueryState
          query={{ ...orders, data: orders.data?.items }}
          empty={
            <Empty
              icon={<ClipboardList size={14} aria-hidden />}
              title={
                view === "todo"
                  ? "Nothing waiting on you"
                  : view === "open"
                    ? "No orders outstanding"
                    : "No purchase orders"
              }
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
            {(orders.data?.items ?? []).map((po) => {
              /*
               * An expected date in the past on an order that has not fully
               * arrived is the one thing on this screen that needs chasing, so
               * it gets the row stripe — visible before any text is read.
               */
              const overdue =
                po.expectedDate !== null &&
                new Date(po.expectedDate) < new Date() &&
                (po.status === "ordered" || po.status === "partially_received");

              return (
                <tr
                  key={po.id}
                  className={overdue ? "clickable warn" : "clickable"}
                  onClick={() => navigate(`/purchase-orders/${po.id}`)}
                >
                  <td>
                    <Link to={`/purchase-orders/${po.id}`} className="mono">
                      {po.poNumber}
                    </Link>
                    <span className="sub">Raised {date(po.createdAt)}</span>
                  </td>
                  <td>{po.supplierName}</td>
                  <td className="small">{po.destinationName}</td>
                  <td className="small">
                    {date(po.expectedDate)}
                    {overdue ? <span className="sub error">Overdue</span> : null}
                  </td>
                  <td>
                    <Badge tone={statusTone(po.status)}>{humanise(po.status)}</Badge>
                  </td>
                  <td className="num">{money(po.total)}</td>
                </tr>
              );
            })}
          </Table>
        </QueryState>

        <div className="card-foot">
          <Pager
            total={orders.data?.total ?? null}
            hasMore={orders.data?.hasMore ?? false}
            limit={limit}
            offset={offset}
            onChange={setOffset}
          />
        </div>
      </Card>
    </>
  );
}
