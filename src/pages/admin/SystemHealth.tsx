import { useApi, useApiMutation } from "../../lib/hooks";
import { Badge, Card, Empty, ErrorBanner, PageHead, QueryState, Table } from "../../components/ui";
import { dateTime, humanise } from "../../lib/format";

interface Health {
  database: string;
  ledgerIntegrity: "ok" | "drift_detected";
  driftRows: number;
  drift: {
    variant_id: string;
    location_id: string;
    batch_id: string;
    balance_qty: string;
    ledger_qty: string;
    drift: string;
  }[];
  alertsPending: number;
  alertsFailingDelivery: number;
  alertDeliveryConfigured: boolean;
  lastStockMovementAt: string | null;
  serverTime: string;
}

interface Alert {
  id: number;
  type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
  locationName?: string;
  link?: string;
  createdAt: string;
  delivered: boolean;
}

/**
 * System health.
 *
 * Written for someone who should never have to open a terminal: it answers the
 * three questions that actually matter — is the database reachable, do the books
 * balance, and is anything queued that has not gone out.
 */
export function SystemHealth() {
  const health = useApi<Health>(["admin", "health"], "/alerts/health", undefined, {
    staleTime: 10_000,
  });
  const alerts = useApi<Alert[]>(["alerts"], "/alerts", { limit: 50 });

  const scan = useApiMutation<undefined, { raised: number }>("/alerts/scan", {
    method: "POST",
    invalidate: [["alerts"], ["admin", "health"]],
  });

  const data = health.data;
  const integrityOk = data?.ledgerIntegrity === "ok";

  return (
    <>
      <PageHead
        title="System health"
        subtitle="What the system checks about itself, without you needing a terminal"
        actions={
          <button
            type="button"
            className="primary"
            disabled={scan.isPending}
            onClick={() => scan.mutate(undefined)}
          >
            {scan.isPending ? "Checking..." : "Check now"}
          </button>
        }
      />

      <ErrorBanner error={scan.error} />
      {scan.isSuccess ? (
        <div className="alert success">
          Check complete — {scan.data?.raised ?? 0} new alert(s) raised.
        </div>
      ) : null}

      <QueryState query={health}>
        <div className="grid cols-4 mb">
          <Card>
            <div className="stat">
              <div className="label">Database</div>
              <div className="value" style={{ fontSize: "1.1rem" }}>
                <Badge tone={data?.database === "connected" ? "success" : "danger"}>
                  {humanise(data?.database ?? "unknown")}
                </Badge>
              </div>
            </div>
          </Card>

          <Card>
            <div className="stat">
              <div className="label">Books balance</div>
              <div className="value" style={{ fontSize: "1.1rem" }}>
                <Badge tone={integrityOk ? "success" : "danger"}>
                  {integrityOk ? "Yes" : `${data?.driftRows} rows adrift`}
                </Badge>
              </div>
              <div className="hint">Stock balances vs the ledger</div>
            </div>
          </Card>

          <Card>
            <div className="stat">
              <div className="label">Alerts waiting</div>
              <div className="value">{data?.alertsPending ?? 0}</div>
              <div className="hint">
                {data?.alertDeliveryConfigured
                  ? "Delivery configured"
                  : "No delivery channel — alerts stay in the app"}
              </div>
            </div>
          </Card>

          <Card>
            <div className="stat">
              <div className="label">Last stock movement</div>
              <div className="value" style={{ fontSize: "1rem" }}>
                {dateTime(data?.lastStockMovementAt)}
              </div>
            </div>
          </Card>
        </div>

        {!integrityOk ? (
          <Card title="Ledger drift — needs attention" flush>
            <div className="alert error" style={{ margin: "0.9rem" }}>
              Recorded stock balances disagree with the movement ledger. Until this is explained,
              every stock figure in the system is suspect. This should never happen.
            </div>
            <Table
              head={
                <tr>
                  <th>Variant</th>
                  <th>Location</th>
                  <th className="num">Balance says</th>
                  <th className="num">Ledger says</th>
                  <th className="num">Difference</th>
                </tr>
              }
            >
              {(data?.drift ?? []).map((row) => (
                <tr key={`${row.variant_id}-${row.location_id}-${row.batch_id}`}>
                  <td className="small">{row.variant_id.slice(0, 8)}</td>
                  <td className="small">{row.location_id.slice(0, 8)}</td>
                  <td className="num">{row.balance_qty}</td>
                  <td className="num">{row.ledger_qty}</td>
                  <td className="num">
                    <Badge tone="danger">{row.drift}</Badge>
                  </td>
                </tr>
              ))}
            </Table>
          </Card>
        ) : null}
      </QueryState>

      <Card
        title="Recent alerts"
        actions={
          data && !data.alertDeliveryConfigured ? (
            <span className="small muted">
              Set ALERT_WEBHOOK_URL to also push these to WhatsApp, Slack or email
            </span>
          ) : null
        }
        flush
      >
        <QueryState
          query={alerts}
          empty={<Empty title="Nothing to report" hint="No exceptions have been raised." />}
        >
          <Table
            head={
              <tr>
                <th>When</th>
                <th>Severity</th>
                <th>What</th>
                <th>Where</th>
                <th>Sent</th>
              </tr>
            }
          >
            {(alerts.data ?? []).map((alert) => (
              <tr key={alert.id}>
                <td className="small nowrap">{dateTime(alert.createdAt)}</td>
                <td>
                  <Badge
                    tone={
                      alert.severity === "critical"
                        ? "danger"
                        : alert.severity === "warning"
                          ? "warn"
                          : "info"
                    }
                  >
                    {alert.severity}
                  </Badge>
                </td>
                <td>
                  {alert.link ? <a href={alert.link}>{alert.title}</a> : alert.title}
                  <span className="sub">{alert.detail}</span>
                </td>
                <td className="small muted">{alert.locationName ?? "—"}</td>
                <td className="small muted">{alert.delivered ? "yes" : "queued"}</td>
              </tr>
            ))}
          </Table>
        </QueryState>
      </Card>
    </>
  );
}
