import { useState } from "react";
import { useApi, useApiMutation } from "../../lib/hooks";
import { useSessionContext } from "../../lib/session";
import { Badge, Card, Empty, ErrorBanner, PageHead, QueryState, Table } from "../../components/ui";
import { dateTime, humanise } from "../../lib/format";

/** Severity to the row-stripe class. Only unresolved rows are striped. */
function toneOf(severity: Alert["severity"]): string {
  return severity === "critical" ? "danger" : severity === "warning" ? "warn" : "";
}

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
  /** The webhook fired. NOT the same as a person having dealt with it. */
  delivered: boolean;
  resolved: boolean;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolvedNote: string | null;
}

/**
 * System health.
 *
 * Written for someone who should never have to open a terminal: it answers the
 * three questions that actually matter — is the database reachable, do the books
 * balance, and is anything queued that has not gone out.
 */
export function SystemHealth() {
  const { can } = useSessionContext();

  const health = useApi<Health>(["admin", "health"], "/alerts/health", undefined, {
    staleTime: 10_000,
  });
  /*
   * Unresolved first, because that is the working list — the one that answers
   * "what still needs somebody". The full history stays a click away rather
   * than being the default, since an alert list that only grows is one people
   * stop opening.
   */
  const [showResolved, setShowResolved] = useState(false);
  const alerts = useApi<Alert[]>(["alerts", showResolved], "/alerts", {
    limit: 100,
    ...(showResolved ? {} : { unresolvedOnly: "true" }),
  });

  const resolve = useApiMutation<{ id: number; note?: string }, void>(
    (input) => `/alerts/${input.id}/resolve`,
    { invalidate: [["alerts"]] },
  );
  const reopen = useApiMutation<{ id: number }, void>(
    (input) => `/alerts/${input.id}/resolve`,
    { method: "DELETE", invalidate: [["alerts"]] },
  );

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
              <div className="value text">
                <Badge tone={data?.database === "connected" ? "success" : "danger"}>
                  {humanise(data?.database ?? "unknown")}
                </Badge>
              </div>
            </div>
          </Card>

          <Card>
            <div className="stat">
              <div className="label">Books balance</div>
              <div className="value text">
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
              <div className="value text sm">
                {dateTime(data?.lastStockMovementAt)}
              </div>
            </div>
          </Card>
        </div>

        {!integrityOk ? (
          <Card title="Ledger drift — needs attention" flush>
            <div className="alert error card-inset">
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
          <>
            {data && !data.alertDeliveryConfigured ? (
              <span className="small muted">
                Set ALERT_WEBHOOK_URL to also push these to WhatsApp, Slack or email
              </span>
            ) : null}
            <label className="check small">
              <input
                type="checkbox"
                checked={showResolved}
                onChange={(event) => setShowResolved(event.target.checked)}
              />
              Include resolved
            </label>
          </>
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
                <th>Status</th>
                <th />
              </tr>
            }
          >
            {(alerts.data ?? []).map((alert) => (
              <tr key={alert.id} className={alert.resolved ? "" : toneOf(alert.severity)}>
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
                <td className="small">
                  {alert.resolved ? (
                    <>
                      <Badge tone="success">Resolved</Badge>
                      <span className="sub">
                        {alert.resolvedBy}
                        {alert.resolvedAt ? ` · ${dateTime(alert.resolvedAt)}` : ""}
                      </span>
                      {alert.resolvedNote ? <span className="sub">{alert.resolvedNote}</span> : null}
                    </>
                  ) : (
                    <span className="muted">
                      Open
                      <span className="sub">{alert.delivered ? "Sent" : "Queued"}</span>
                    </span>
                  )}
                </td>
                <td className="right">
                  {can("alert:resolve") ? (
                    alert.resolved ? (
                      <button
                        type="button"
                        className="ghost sm"
                        disabled={reopen.isPending}
                        onClick={() => reopen.mutate({ id: alert.id })}
                      >
                        Reopen
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="sm"
                        disabled={resolve.isPending}
                        onClick={() => {
                          /*
                           * The note is optional and asked for inline. A modal
                           * per alert would make clearing a morning's worth of
                           * them a chore, and a chore is how alert lists end up
                           * ignored.
                           */
                          const note = window.prompt("What was done? (optional)") ?? undefined;
                          resolve.mutate({ id: alert.id, note: note || undefined });
                        }}
                      >
                        Resolve
                      </button>
                    )
                  ) : null}
                </td>
              </tr>
            ))}
          </Table>
        </QueryState>
      </Card>
    </>
  );
}
