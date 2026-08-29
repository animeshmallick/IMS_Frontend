import { useState } from "react";
import { useParams } from "react-router-dom";
import { useApi, useApiMutation } from "../../lib/hooks";
import { useSessionContext } from "../../lib/session";
import {
  Badge,
  Card,
  ConfirmButton,
  ErrorBanner,
  Field,
  Loading,
  PageHead,
  Table,
} from "../../components/ui";
import { date, dateTime, humanise, money, qty, statusTone } from "../../lib/format";

interface CountLine {
  id: string;
  variantId: string;
  sku: string;
  productName: string;
  variantName: string | null;
  batchId: string;
  batchCode: string;
  expiresOn: string | null;
  /** Null while the count is blind — withheld from whoever is counting. */
  systemQty: string | null;
  countedQty: string | null;
  varianceQty: string | null;
  varianceCost: string | null;
  varianceReason: string | null;
  countedAt: string | null;
}

interface CountDetail {
  id: string;
  countNumber: string;
  status: "draft" | "counting" | "review" | "posted" | "cancelled";
  locationId: string;
  locationName: string;
  scope: string | null;
  snapshotAt: string | null;
  createdBy: string;
  countedBy: string | null;
  approvedBy: string | null;
  postedAt: string | null;
  notes: string | null;
  createdAt: string;
  blind: boolean;
  lines: CountLine[];
}

/**
 * One stock count.
 *
 * Variances post as DELTAS, not overwrites. `systemQty` is frozen when counting
 * starts, but posting applies `counted − snapshot` to the CURRENT balance —
 * because the store keeps selling while staff count, and setting the balance to
 * the counted figure would silently erase every sale made during the count in a
 * way that looks like the count fixed something.
 */
export function StockCountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can, session } = useSessionContext();
  const [entries, setEntries] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [includeZero, setIncludeZero] = useState(false);
  const [categoryPath, setCategoryPath] = useState("");

  const count = useApi<CountDetail>(["counts", id], `/stock-counts/${id}`);

  const options = { method: "POST" as const, idempotent: true, invalidate: [["counts"], ["stock"]] };
  type Body = Record<string, unknown> | undefined;

  const start = useApiMutation<Body, unknown>(`/stock-counts/${id}/start`, options);
  const enter = useApiMutation<Body, unknown>(`/stock-counts/${id}/counts`, {
    ...options,
    idempotent: false,
  });
  const submit = useApiMutation<Body, unknown>(`/stock-counts/${id}/submit`, options);
  const post = useApiMutation<Body, unknown>(`/stock-counts/${id}/post`, options);
  const cancel = useApiMutation<Body, unknown>(`/stock-counts/${id}/cancel`, options);

  if (count.isPending) return <Loading />;
  if (count.isError) return <ErrorBanner error={count.error} />;
  const doc = count.data!;

  const countedByMe = doc.countedBy === session.user.id;
  const variances = doc.lines.filter((l) => l.varianceQty && Number(l.varianceQty) !== 0);
  const totalVarianceCost = variances.reduce((sum, l) => sum + Number(l.varianceCost ?? 0), 0);

  return (
    <>
      <PageHead
        title={doc.countNumber}
        subtitle={
          <>
            {doc.locationName}
            {doc.scope ? ` · ${doc.scope}` : ""}
            {doc.snapshotAt ? ` · frozen ${dateTime(doc.snapshotAt)}` : ""}
          </>
        }
        actions={
          <>
            <Badge tone={statusTone(doc.status)}>{humanise(doc.status)}</Badge>

            {doc.status === "draft" && can("stock:count") ? (
              <ConfirmButton
                label="Start counting"
                title="Start this count?"
                confirmLabel="Start"
                message="The expected quantities are frozen now, and the sheet becomes blind — whoever counts will not see them."
                onConfirm={() =>
                  start.mutateAsync({
                    categoryPath: categoryPath || undefined,
                    includeZeroBalances: includeZero,
                  })
                }
              >
                <Field
                  label="Limit to a category path"
                  help="Optional, e.g. /grocery/staples. Leave blank for the whole location."
                >
                  <input value={categoryPath} onChange={(e) => setCategoryPath(e.target.value)} />
                </Field>
                <label className="row small">
                  <input
                    type="checkbox"
                    checked={includeZero}
                    onChange={(e) => setIncludeZero(e.target.checked)}
                  />
                  Include items believed to be at zero — catches stock nobody recorded
                </label>
              </ConfirmButton>
            ) : null}

            {doc.status === "counting" && can("stock:count") ? (
              <ConfirmButton
                label="Submit for review"
                message="Finish counting and send the sheet for review. Variances become visible to whoever approves."
                onConfirm={() => submit.mutateAsync(undefined)}
              />
            ) : null}

            {doc.status === "review" && can("stock:count_approve") && !countedByMe ? (
              <ConfirmButton
                danger
                label="Post variances"
                title="Post this count?"
                confirmLabel="Post"
                message="The difference between counted and expected is applied to the CURRENT balance, so sales made while counting are preserved."
                onConfirm={() => post.mutateAsync(undefined)}
              />
            ) : null}

            {["draft", "counting", "review"].includes(doc.status) && can("stock:count") ? (
              <ConfirmButton
                danger
                label="Cancel"
                message="Abandon this count. Nothing is posted."
                onConfirm={() => cancel.mutateAsync({ reason: "Cancelled" })}
              />
            ) : null}
          </>
        }
      />

      <ErrorBanner
        error={start.error ?? enter.error ?? submit.error ?? post.error ?? cancel.error}
      />

      {doc.blind ? (
        <div className="alert warn">
          This sheet is blind — the expected quantity is hidden on purpose. Count what is actually
          on the shelf.
        </div>
      ) : null}

      {doc.status === "review" && countedByMe ? (
        <div className="alert warn">
          You counted these lines, so you cannot approve them. Someone else has to post the
          variances.
        </div>
      ) : null}

      {doc.status === "draft" ? (
        <div className="alert">
          Nothing has been counted yet. Use “Start counting” to freeze the expected quantities and
          generate the sheet.
        </div>
      ) : null}

      {!doc.blind && doc.status !== "draft" ? (
        <div className="grid cols-3 mb">
          <Card>
            <div className="stat">
              <div className="label">Lines</div>
              <div className="value">{doc.lines.length}</div>
            </div>
          </Card>
          <Card>
            <div className="stat">
              <div className="label">With a variance</div>
              <div className="value">{variances.length}</div>
            </div>
          </Card>
          {can("report:financial") ? (
            <Card>
              <div className="stat">
                <div className="label">Value of variance</div>
                <div className="value">{money(totalVarianceCost)}</div>
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}

      {doc.lines.length > 0 ? (
        <Card title="Count sheet" flush>
          <Table
            head={
              <tr>
                <th>Item</th>
                <th>Batch</th>
                {!doc.blind ? <th className="num">Expected</th> : null}
                <th className="num">Counted</th>
                {!doc.blind ? <th className="num">Variance</th> : null}
                <th>Reason</th>
              </tr>
            }
          >
            {doc.lines.map((line) => {
              const variance = line.varianceQty ? Number(line.varianceQty) : null;
              return (
                <tr key={line.id}>
                  <td>
                    {line.sku}
                    <span className="sub">{line.productName}</span>
                  </td>
                  <td className="small">
                    {line.batchCode}
                    {line.expiresOn ? <span className="sub">{date(line.expiresOn)}</span> : null}
                  </td>
                  {!doc.blind ? <td className="num muted">{qty(line.systemQty)}</td> : null}
                  <td className="num">
                    {doc.status === "counting" && can("stock:count") ? (
                      <input
                        className="num"
                        inputMode="decimal"
                        placeholder={line.countedQty ?? "0"}
                        value={entries[line.id] ?? ""}
                        onChange={(e) =>
                          setEntries((current) => ({ ...current, [line.id]: e.target.value }))
                        }
                      />
                    ) : (
                      qty(line.countedQty)
                    )}
                  </td>
                  {!doc.blind ? (
                    <td className="num">
                      {variance === null ? (
                        <span className="muted">—</span>
                      ) : variance === 0 ? (
                        <Badge tone="success">Matches</Badge>
                      ) : (
                        <Badge tone={variance < 0 ? "danger" : "warn"}>
                          {variance > 0 ? "+" : ""}
                          {qty(line.varianceQty)}
                        </Badge>
                      )}
                    </td>
                  ) : null}
                  <td>
                    {doc.status === "counting" && can("stock:count") ? (
                      <input
                        value={reasons[line.id] ?? ""}
                        placeholder="If it differs"
                        onChange={(e) =>
                          setReasons((current) => ({ ...current, [line.id]: e.target.value }))
                        }
                      />
                    ) : (
                      <span className="small">{line.varianceReason ?? "—"}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>

          {doc.status === "counting" && can("stock:count") ? (
            <div className="card-body">
              <button
                type="button"
                className="primary"
                disabled={enter.isPending || Object.keys(entries).length === 0}
                onClick={() =>
                  enter.mutate({
                    lines: Object.entries(entries)
                      .filter(([, value]) => value.trim() !== "")
                      .map(([lineId, countedQty]) => ({
                        lineId,
                        countedQty,
                        varianceReason: reasons[lineId] || undefined,
                      })),
                  })
                }
              >
                {enter.isPending ? "Saving..." : "Save counted quantities"}
              </button>
              <p className="small muted mt">
                Zero is a valid count — it means the shelf is empty. Save as you go; you can keep
                entering until the sheet is submitted.
              </p>
            </div>
          ) : null}
        </Card>
      ) : null}
    </>
  );
}
