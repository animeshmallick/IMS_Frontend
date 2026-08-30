import { ClipboardCheck } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApi, useApiList, useApiMutation } from "../../lib/hooks";
import { useSessionContext } from "../../lib/session";
import {
  Badge,
  Card,
  Empty,
  ErrorBanner,
  Field,
  Modal,
  PageHead,
  Pager,
  QueryState,
  Table,
  TextField,
} from "../../components/ui";
import { date, humanise, statusTone } from "../../lib/format";
import type { Location, StockCountListItem } from "../../lib/types";
import { CycleCountPanel } from "./CycleCountPanel";

/**
 * Stock counts.
 *
 * Counting is BLIND: the sheet withholds the expected quantity from whoever is
 * counting, because showing it produces a count that agrees with the system and
 * tells you nothing. The reveal is tied to the approval permission, not to a
 * toggle on this screen.
 */
/**
 * The views that correspond to a decision.
 *
 * A count in progress and a count awaiting review are two different jobs for
 * two different people, and both were previously behind the same dropdown as
 * "cancelled".
 */
const VIEWS: { key: string; label: string; statuses?: string[] }[] = [
  { key: "open", label: "In progress", statuses: ["draft", "counting"] },
  { key: "review", label: "Awaiting review", statuses: ["review"] },
  { key: "done", label: "Posted", statuses: ["posted"] },
  { key: "all", label: "All" },
];

export function StockCounts() {
  const navigate = useNavigate();
  const { can, activeLocation } = useSessionContext();
  const [view, setView] = useState("open");
  const [offset, setOffset] = useState(0);
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<"cycle" | "history">("cycle");
  const limit = 25;

  const current = VIEWS.find((v) => v.key === view) ?? VIEWS[3]!;

  const counts = useApiList<StockCountListItem>(["counts", view], "/stock-counts", {
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
        title="Stock counts"
        subtitle="Count the shelf, then post the difference against what the system believed"
        actions={
          can("stock:count") ? (
            <button type="button" className="primary" onClick={() => setCreating(true)}>
              New count
            </button>
          ) : null
        }
      />

      <div className="tabs">
        <button
          type="button"
          className={tab === "cycle" ? "active" : ""}
          onClick={() => setTab("cycle")}
        >
          What to count today
        </button>
        <button
          type="button"
          className={tab === "history" ? "active" : ""}
          onClick={() => setTab("history")}
        >
          Count history
        </button>
      </div>

      {tab === "cycle" ? <CycleCountPanel /> : null}

      {tab === "history" ? (
      <>
      <div className="mb">
        <div className="seg" role="tablist" aria-label="Stock count status">
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
            </button>
          ))}
        </div>
      </div>

      <Card flush>
        <QueryState
          query={{ ...counts, data: counts.data?.items }}
          empty={
            <Empty
              icon={<ClipboardCheck size={14} aria-hidden />}
              title="No stock counts"
              hint="Start one to check what is physically on the shelves."
            />
          }
        >
          <Table
            head={
              <tr>
                <th>Number</th>
                <th>Location</th>
                <th>Scope</th>
                <th>Status</th>
                <th>Started</th>
              </tr>
            }
          >
            {(counts.data?.items ?? []).map((count) => (
              <tr key={count.id} className="clickable" onClick={() => navigate(`/counts/${count.id}`)}>
                <td>
                  <Link to={`/counts/${count.id}`}>{count.countNumber}</Link>
                </td>
                <td className="small">{count.locationName}</td>
                <td className="small">{count.scope ?? "Whole location"}</td>
                <td>
                  <Badge tone={statusTone(count.status)}>{humanise(count.status)}</Badge>
                </td>
                <td className="small">{date(count.createdAt)}</td>
              </tr>
            ))}
          </Table>
        </QueryState>

        <div className="card-foot">
          <Pager total={counts.data?.total ?? 0} limit={limit} offset={offset} onChange={setOffset} />
        </div>
      </Card>

      </>
      ) : null}

      {creating ? (
        <NewCountModal
          defaultLocationId={activeLocation?.id ?? ""}
          onClose={() => setCreating(false)}
          onCreated={(id) => navigate(`/counts/${id}`)}
        />
      ) : null}
    </>
  );
}

function NewCountModal({
  defaultLocationId,
  onClose,
  onCreated,
}: {
  defaultLocationId: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [locationId, setLocationId] = useState(defaultLocationId);
  const [scope, setScope] = useState("");
  const [notes, setNotes] = useState("");

  const locations = useApi<Location[]>(["locations"], "/locations");

  const create = useApiMutation<Record<string, unknown>, { id: string }>("/stock-counts", {
    method: "POST",
    idempotent: true,
    invalidate: [["counts"]],
    onSuccess: (result) => onCreated(result.id),
  });

  return (
    <Modal
      narrow
      title="New stock count"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={!locationId || create.isPending}
            onClick={() =>
              create.mutate({ locationId, scope: scope || undefined, notes: notes || undefined })
            }
          >
            {create.isPending ? "Creating..." : "Create"}
          </button>
        </>
      }
    >
      <ErrorBanner error={create.error} />

      <Field label="Location">
        <select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
          <option value="">Choose a location</option>
          {(locations.data ?? [])
            .filter((l) => l.isPhysical && !l.isSystem)
            .map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
        </select>
      </Field>

      <TextField
        label="What is being counted?"
        help="A description for the people doing it, e.g. “Aisle 3, cold storage”."
        value={scope}
        onChange={(e) => setScope(e.target.value)}
      />

      <Field label="Notes">
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <p className="small muted">
        You choose which items to include on the next screen, when the count is started and the
        expected quantities are frozen.
      </p>
    </Modal>
  );
}
