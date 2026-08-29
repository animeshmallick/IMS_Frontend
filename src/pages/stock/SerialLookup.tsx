import { useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../../lib/hooks";
import { Badge, Card, Empty, Field, PageHead, Table } from "../../components/ui";
import { date, dateTime, humanise, money } from "../../lib/format";

interface History {
  id: string;
  serialNo: string;
  status: string;
  warrantyExpiresOn: string | null;
  warrantyDaysLeft: number | null;
  underWarranty: boolean;
  sku: string;
  productName: string;
  batchId: string;
  batchCode: string;
  receivedAt: string;
  unitCost: string;
  currentLocationName: string | null;
  sale: {
    orderId: string;
    orderNumber: string;
    placedAt: string;
    customerId: string | null;
    locationName: string;
    unitPrice: string;
  } | null;
}

interface RecallRow {
  serialNo: string;
  status: string;
  sku: string;
  currentLocationName: string | null;
  orderNumber: string | null;
  placedAt: string | null;
  customerId: string | null;
}

/**
 * The warranty counter.
 *
 * A customer arrives holding a device and a complaint. "When did you buy this,
 * and is it still covered" has to take seconds — not a rummage through a year of
 * bills — so this is one field and one answer.
 */
export function SerialLookup() {
  const [term, setTerm] = useState("");
  const [submitted, setSubmitted] = useState("");

  const history = useApi<History>(
    ["serials", submitted],
    `/serials/${encodeURIComponent(submitted)}`,
    undefined,
    { enabled: submitted.length > 0 },
  );

  const recall = useApi<RecallRow[]>(
    ["serials", "recall", history.data?.batchId],
    `/serials/recall/${history.data?.batchId}`,
    undefined,
    { enabled: Boolean(history.data?.batchId) },
  );

  const unit = history.data;

  return (
    <>
      <PageHead
        title="Warranty &amp; unit lookup"
        subtitle="Find a specific device by the number on its sticker"
      />

      <Card>
        <Field label="Serial or IMEI number">
          <div className="inline-form">
            <input
              autoFocus
              value={term}
              placeholder="Scan or type the number"
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                setSubmitted(term.trim());
              }}
            />
            <button
              type="button"
              className="primary"
              disabled={!term.trim()}
              onClick={() => setSubmitted(term.trim())}
            >
              Look up
            </button>
          </div>
        </Field>
      </Card>

      {submitted && history.isError ? (
        <Card>
          <Empty
            title="No unit on file with that number"
            hint="Check the number, or it may be from a product that is not tracked by unit."
          />
        </Card>
      ) : null}

      {unit ? (
        <>
          {/* The answer the customer is waiting for, first and largest. */}
          <div className="grid cols-3 mb">
            <Card>
              <div className="stat">
                <div className="label">Warranty</div>
                <div className="value" style={{ fontSize: "1.3rem" }}>
                  {unit.warrantyExpiresOn === null ? (
                    <Badge tone="neutral">None recorded</Badge>
                  ) : unit.underWarranty ? (
                    <Badge tone="success">In warranty</Badge>
                  ) : (
                    <Badge tone="danger">Expired</Badge>
                  )}
                </div>
                <div className="hint">
                  {unit.warrantyExpiresOn
                    ? unit.underWarranty
                      ? `${unit.warrantyDaysLeft} days left — until ${date(unit.warrantyExpiresOn)}`
                      : `Ran out ${date(unit.warrantyExpiresOn)}`
                    : "This product has no warranty period set"}
                </div>
              </div>
            </Card>

            <Card>
              <div className="stat">
                <div className="label">Sold</div>
                <div className="value" style={{ fontSize: "1.1rem" }}>
                  {unit.sale ? date(unit.sale.placedAt) : humanise(unit.status)}
                </div>
                <div className="hint">
                  {unit.sale ? (
                    <Link to={`/counter/orders/${unit.sale.orderId}`}>
                      {unit.sale.orderNumber}
                    </Link>
                  ) : (
                    (unit.currentLocationName ?? "Not in stock")
                  )}
                </div>
              </div>
            </Card>

            <Card>
              <div className="stat">
                <div className="label">Product</div>
                <div className="value" style={{ fontSize: "1.1rem" }}>
                  {unit.sku}
                </div>
                <div className="hint">{unit.productName}</div>
              </div>
            </Card>
          </div>

          <Card title="This unit" flush>
            <Table head={<tr><th>Detail</th><th>Value</th></tr>}>
              <tr>
                <td>Serial number</td>
                <td>
                  <strong>{unit.serialNo}</strong>
                </td>
              </tr>
              <tr>
                <td>Status</td>
                <td>
                  <Badge tone={unit.status === "sold" ? "info" : "success"}>
                    {humanise(unit.status)}
                  </Badge>
                </td>
              </tr>
              <tr>
                <td>Where it is now</td>
                <td>{unit.currentLocationName ?? "With the customer"}</td>
              </tr>
              <tr>
                <td>Batch it arrived on</td>
                <td>
                  {unit.batchCode}
                  <span className="sub">received {date(unit.receivedAt)}</span>
                </td>
              </tr>
              {unit.sale ? (
                <>
                  <tr>
                    <td>Sold at</td>
                    <td>{unit.sale.locationName}</td>
                  </tr>
                  <tr>
                    <td>Sold for</td>
                    <td>{money(unit.sale.unitPrice)}</td>
                  </tr>
                  <tr>
                    <td>Sold on</td>
                    <td>{dateTime(unit.sale.placedAt)}</td>
                  </tr>
                </>
              ) : null}
            </Table>
          </Card>

          {/* Every unit from the same production run — the recall question. */}
          {(recall.data?.length ?? 0) > 1 ? (
            <Card
              title={`Others from batch ${unit.batchCode}`}
              actions={<span className="small muted">Who else holds one, if this lot is recalled</span>}
              flush
            >
              <Table
                head={
                  <tr>
                    <th>Serial</th>
                    <th>Status</th>
                    <th>Where</th>
                    <th>Sold on</th>
                  </tr>
                }
              >
                {(recall.data ?? []).map((row) => (
                  <tr key={row.serialNo}>
                    <td>
                      {row.serialNo}
                      {row.serialNo === unit.serialNo ? (
                        <span className="sub">
                          <Badge tone="info">this one</Badge>
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <Badge tone={row.status === "sold" ? "warn" : "success"}>
                        {humanise(row.status)}
                      </Badge>
                    </td>
                    <td className="small">
                      {row.currentLocationName ?? "With a customer"}
                    </td>
                    <td className="small">
                      {row.orderNumber ? (
                        <>
                          {row.orderNumber}
                          <span className="sub">{date(row.placedAt)}</span>
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
              <div className="card-body">
                <p className="small muted">
                  If the manufacturer recalls this lot, these are the units affected — the ones
                  still on a shelf can be pulled, and the ones sold can be traced to the bill
                  that carried them out.
                </p>
              </div>
            </Card>
          ) : null}
        </>
      ) : null}
    </>
  );
}
