import { ScanLine } from "lucide-react";
import { useState } from "react";
import { useApiList } from "../../lib/hooks";
import {
  Card,
  Empty,
  Field,
  PageHead,
  Pager,
  QueryState,
  Table,
} from "../../components/ui";
import { dateTime, humanise } from "../../lib/format";
import type { AuditEntry } from "../../lib/types";

/**
 * The audit trail.
 *
 * Append-only, written inside the same transaction as the change it describes —
 * so an approval that appears here definitely happened, and one that happened
 * definitely appears. Entries record the CHANGED FIELDS rather than whole rows,
 * because the question is always "what changed", never "what did the row look
 * like".
 */
export function AuditTrail() {
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const entries = useApiList<AuditEntry>(["admin", "audit"], "/audit", {
    action: action || undefined,
    entityType: entityType || undefined,
    from: from || undefined,
    to: to || undefined,
    limit,
    offset,
  });

  return (
    <>
      <PageHead
        title="Audit trail"
        subtitle="Who changed what, and when. Nothing here can be edited or removed."
      />

      <div className="filters">
        <Field label="Action" help="Prefix match, e.g. “purchase_order.” for the whole module.">
          <input
            value={action}
            placeholder="purchase_order.approve"
            onChange={(e) => {
              setAction(e.target.value);
              setOffset(0);
            }}
          />
        </Field>
        <Field label="Entity">
          <input
            value={entityType}
            placeholder="user, role, purchase_order"
            onChange={(e) => {
              setEntityType(e.target.value);
              setOffset(0);
            }}
          />
        </Field>
        <Field label="From">
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setOffset(0);
            }}
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setOffset(0);
            }}
          />
        </Field>
      </div>

      <Card flush>
        <QueryState
          query={{ ...entries, data: entries.data?.items }}
          empty={<Empty icon={<ScanLine size={14} aria-hidden />} title="Nothing recorded" hint="No audit entries match these filters." />}
        >
          <Table
            head={
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Changed</th>
                <th>Where</th>
              </tr>
            }
          >
            {(entries.data?.items ?? []).map((entry) => (
              <tr key={entry.id}>
                <td className="small nowrap">{dateTime(entry.occurredAt)}</td>
                <td className="small">
                  {entry.actorName ?? entry.actorEmail ?? "System"}
                  {entry.actorName && entry.actorEmail ? (
                    <span className="sub">{entry.actorEmail}</span>
                  ) : null}
                </td>
                <td>{humanise(entry.action.replace(/\./g, " "))}</td>
                <td className="small">
                  {entry.entityType}
                  {entry.entityId ? (
                    <span className="sub">{entry.entityId.slice(0, 8)}</span>
                  ) : null}
                </td>
                <td className="small">
                  <ChangeSummary before={entry.before} after={entry.after} />
                </td>
                <td className="small muted">{entry.locationName ?? "—"}</td>
              </tr>
            ))}
          </Table>
        </QueryState>

        <div className="card-foot">
          <Pager
            total={entries.data?.total ?? 0}
            limit={limit}
            offset={offset}
            onChange={setOffset}
          />
        </div>
      </Card>
    </>
  );
}

/** Renders the recorded delta as `field: old → new`, which is what people read for. */
function ChangeSummary({
  before,
  after,
}: {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}) {
  if (!after && !before) return <span className="muted">—</span>;

  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];

  return (
    <>
      {keys.slice(0, 4).map((key) => (
        <div key={key}>
          <strong>{key}</strong>
          {before?.[key] !== undefined ? ` ${format(before[key])} →` : ":"}{" "}
          {format(after?.[key])}
        </div>
      ))}
      {keys.length > 4 ? <span className="muted">+{keys.length - 4} more</span> : null}
    </>
  );
}

function format(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (typeof value === "object") return JSON.stringify(value).slice(0, 40);
  return String(value);
}
