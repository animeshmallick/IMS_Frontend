import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApi, useApiList } from "../../lib/hooks";
import { useSessionContext } from "../../lib/session";
import { Badge, Card, Empty, Field, PageHead, Pager, QueryState, Table } from "../../components/ui";
import { date, dateTime, humanise, qty, statusTone } from "../../lib/format";
import type { InTransitRow, Location, TransferListItem } from "../../lib/types";

const STATUSES = ["draft", "dispatched", "partially_received", "received", "closed", "cancelled"];

/**
 * Stock transfers between warehouses and stores.
 *
 * A transfer has two legs: dispatch moves stock into a virtual `transit`
 * location, receipt moves it out. Without that, stock vanishes while the van is
 * on the road and a genuine loss looks exactly like a data-entry lag — so
 * "what is on a vehicle right now" gets its own panel here.
 */
export function Transfers() {
  const navigate = useNavigate();
  const { can, activeLocation } = useSessionContext();
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 25;

  const locations = useApi<Location[]>(["locations"], "/locations");
  const transfers = useApiList<TransferListItem>(["transfers"], "/stock-transfers", {
    status: status || undefined,
    limit,
    offset,
  });

  const inbound = useApi<InTransitRow[]>(
    ["transfers", "in-transit"],
    "/stock-transfers/in-transit",
    { toLocationId: activeLocation?.id },
  );

  const locationName = (id: string) =>
    (locations.data ?? []).find((l) => l.id === id)?.name ?? "—";

  return (
    <>
      <PageHead
        title="Stock transfers"
        subtitle="Move stock between your warehouses and stores"
        actions={
          can("stock:transfer") ? (
            <Link className="btn primary" to="/transfers/new">
              New transfer
            </Link>
          ) : null
        }
      />

      {(inbound.data?.length ?? 0) > 0 ? (
        <Card title="Arriving at your location" flush>
          <Table
            head={
              <tr>
                <th>Transfer</th>
                <th>From</th>
                <th>Item</th>
                <th>Dispatched</th>
                <th className="num">Outstanding</th>
              </tr>
            }
          >
            {(inbound.data ?? []).map((row) => (
              <tr key={`${row.transferId}-${row.variantId}-${row.batchCode}`}>
                <td>
                  <Link to={`/transfers/${row.transferId}`}>{row.transferNumber}</Link>
                </td>
                <td className="small">{locationName(row.fromLocationId)}</td>
                <td>
                  {row.sku}
                  <span className="sub">{row.batchCode}</span>
                </td>
                <td className="small">{date(row.dispatchedAt)}</td>
                <td className="num">{qty(row.outstandingQty)}</td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : null}

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
          query={{ ...transfers, data: transfers.data?.items }}
          empty={
            <Empty
              title="No transfers"
              hint="Raise one to move stock from a warehouse to a store."
            />
          }
        >
          <Table
            head={
              <tr>
                <th>Number</th>
                <th>From</th>
                <th>To</th>
                <th>Status</th>
                <th>Dispatched</th>
              </tr>
            }
          >
            {(transfers.data?.items ?? []).map((transfer) => (
              <tr
                key={transfer.id}
                className="clickable"
                onClick={() => navigate(`/transfers/${transfer.id}`)}
              >
                <td>
                  <Link to={`/transfers/${transfer.id}`}>{transfer.transferNumber}</Link>
                  <span className="sub">Raised {date(transfer.createdAt)}</span>
                </td>
                <td className="small">{transfer.fromName}</td>
                <td className="small">{transfer.toName}</td>
                <td>
                  <Badge tone={statusTone(transfer.status)}>{humanise(transfer.status)}</Badge>
                </td>
                <td className="small">
                  {transfer.dispatchedAt ? dateTime(transfer.dispatchedAt) : "—"}
                </td>
              </tr>
            ))}
          </Table>
        </QueryState>

        <div className="card-foot">
          <Pager
            total={transfers.data?.total ?? 0}
            limit={limit}
            offset={offset}
            onChange={setOffset}
          />
        </div>
      </Card>
    </>
  );
}
