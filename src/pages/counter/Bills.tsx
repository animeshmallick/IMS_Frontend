import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApiList } from "../../lib/hooks";
import { useSessionContext } from "../../lib/session";
import { Card, Empty, PageHead, Pager, QueryState, Table } from "../../components/ui";
import { dateTime, money } from "../../lib/format";
import type { SalesOrderListItem } from "../../lib/types";

/** Placed bills at the working location. */
export function Bills() {
  const navigate = useNavigate();
  const { activeLocation, can } = useSessionContext();
  const [offset, setOffset] = useState(0);
  const limit = 25;

  const bills = useApiList<SalesOrderListItem>(
    ["counter", "orders"],
    "/counter/orders",
    { locationId: activeLocation?.id, limit, offset },
    { enabled: Boolean(activeLocation?.id) },
  );

  return (
    <>
      <PageHead
        title="Bills"
        subtitle={activeLocation?.name}
        actions={
          can("sale:create") ? (
            <Link className="btn primary" to="/counter">
              New sale
            </Link>
          ) : null
        }
      />

      <Card flush>
        <QueryState
          query={{ ...bills, data: bills.data?.items }}
          empty={<Empty title="No bills yet" hint="Sales placed at this location will appear here." />}
        >
          <Table
            head={
              <tr>
                <th>Bill</th>
                <th>Customer</th>
                <th>Placed</th>
                <th className="num">Total</th>
                {can("report:financial") ? <th className="num">Margin</th> : null}
              </tr>
            }
          >
            {(bills.data?.items ?? []).map((bill) => (
              <tr
                key={bill.id}
                className="clickable"
                onClick={() => navigate(`/counter/orders/${bill.id}`)}
              >
                <td>
                  <Link to={`/counter/orders/${bill.id}`}>{bill.orderNumber}</Link>
                </td>
                <td className="small">{bill.customerName ?? "Walk-in"}</td>
                <td className="small">{dateTime(bill.placedAt)}</td>
                <td className="num">{money(bill.total)}</td>
                {can("report:financial") ? (
                  <td className="num">{money(Number(bill.total) - Number(bill.totalCost))}</td>
                ) : null}
              </tr>
            ))}
          </Table>
        </QueryState>

        <div className="card-foot">
          <Pager total={bills.data?.total ?? 0} limit={limit} offset={offset} onChange={setOffset} />
        </div>
      </Card>
    </>
  );
}
