import { useState } from "react";
import { useApi, useApiMutation } from "../../lib/hooks";
import { useSessionContext } from "../../lib/session";
import {
  Badge,
  Card,
  ErrorBanner,
  Field,
  Loading,
  PageHead,
  TextField,
} from "../../components/ui";
import { dateTime, humanise, money, statusTone } from "../../lib/format";
import type { Shift } from "../../lib/types";

const COUNTER_CODE = "TILL-1";

/**
 * Cash shifts.
 *
 * Expected cash is DERIVED from the shift's own sales and refunds and is never
 * sent by the client — the cashier enters only what they physically counted.
 * Showing the expected figure before counting produces a count that agrees with
 * the system and tells you nothing, so it appears only after the drawer is
 * closed.
 */
export function Shifts() {
  const { activeLocation, can, session } = useSessionContext();
  const locationId = activeLocation?.id;

  const [openingFloat, setOpeningFloat] = useState("2000");
  const [countedCash, setCountedCash] = useState("");
  const [varianceReason, setVarianceReason] = useState("");
  const [note, setNote] = useState("");

  const shift = useApi<Shift | null>(
    ["counter", "shift", locationId],
    "/counter/shifts/current",
    { locationId: locationId!, counterCode: COUNTER_CODE },
    { enabled: Boolean(locationId), staleTime: 3_000 },
  );

  const summary = useApi<Record<string, string | number>>(
    ["counter", "shift-summary", shift.data?.id],
    `/counter/shifts/${shift.data?.id}/summary`,
    undefined,
    { enabled: Boolean(shift.data?.id) },
  );

  const invalidate = [["counter"]];

  const open = useApiMutation<Record<string, unknown>, Shift>("/counter/shifts", {
    method: "POST",
    idempotent: true,
    invalidate,
  });
  const close = useApiMutation<Record<string, unknown>, Shift>(
    `/counter/shifts/${shift.data?.id}/close`,
    { method: "POST", idempotent: true, invalidate },
  );
  const reconcile = useApiMutation<Record<string, unknown>, Shift>(
    `/counter/shifts/${shift.data?.id}/reconcile`,
    { method: "POST", idempotent: true, invalidate },
  );

  if (!locationId) {
    return (
      <div className="empty">
        <h3>No working location</h3>
        <p>Choose the store whose till you are opening.</p>
      </div>
    );
  }

  if (shift.isPending) return <Loading />;

  const current = shift.data;
  const isOpen = current?.status === "open";
  const isClosed = current?.status === "closed";
  const variance = Number(current?.cashVariance ?? 0);
  const closedByMe = current?.closedBy === session.user.id;

  return (
    <>
      <PageHead
        title="Cash shifts"
        subtitle={`${activeLocation?.name} · till ${COUNTER_CODE}`}
      />

      <ErrorBanner error={open.error ?? close.error ?? reconcile.error} />

      {!current || current.status === "reconciled" ? (
        <Card title="Open a shift">
          {can("shift:open") ? (
            <>
              <TextField
                label="Opening float"
                help="The cash already in the drawer when you start."
                inputMode="decimal"
                value={openingFloat}
                onChange={(e) => setOpeningFloat(e.target.value)}
              />
              <button
                type="button"
                className="primary"
                disabled={open.isPending}
                onClick={() =>
                  open.mutate({ locationId, counterCode: COUNTER_CODE, openingFloat })
                }
              >
                {open.isPending ? "Opening..." : "Open shift"}
              </button>
            </>
          ) : (
            <p className="muted">You do not have permission to open a shift.</p>
          )}
        </Card>
      ) : null}

      {current && current.status !== "reconciled" ? (
        <Card
          title={`Shift ${current.shiftNumber}`}
          actions={<Badge tone={statusTone(current.status)}>{humanise(current.status)}</Badge>}
        >
          <div className="grid cols-3 mb">
            <div className="stat">
              <div className="label">Opening float</div>
              <div className="value">{money(current.openingFloat)}</div>
            </div>
            <div className="stat">
              <div className="label">Opened</div>
              <div className="value text sm">
                {dateTime(current.openedAt)}
              </div>
            </div>
            {isClosed ? (
              <div className="stat">
                <div className="label">Counted</div>
                <div className="value">{money(current.countedCash)}</div>
              </div>
            ) : null}
          </div>

          {isOpen && can("shift:close") ? (
            <>
              <p className="small muted mb">
                Count the drawer and enter the total. The expected figure is worked out from this
                shift's own sales and is shown after you close — not before.
              </p>
              <div className="inline-form">
                <Field label="Cash counted">
                  <input
                    className="num"
                    inputMode="decimal"
                    value={countedCash}
                    onChange={(e) => setCountedCash(e.target.value)}
                  />
                </Field>
                <Field label="Reason (if it does not balance)">
                  <input
                    value={varianceReason}
                    onChange={(e) => setVarianceReason(e.target.value)}
                  />
                </Field>
                <button
                  type="button"
                  className="primary"
                  disabled={!countedCash || close.isPending}
                  onClick={() =>
                    close.mutate({
                      countedCash,
                      varianceReason: varianceReason || undefined,
                    })
                  }
                >
                  {close.isPending ? "Closing..." : "Close shift"}
                </button>
              </div>
            </>
          ) : null}

          {isClosed ? (
            <>
              <div className="grid cols-3 mb">
                <div className="stat">
                  <div className="label">Expected</div>
                  <div className="value">{money(current.expectedCash)}</div>
                </div>
                <div className="stat">
                  <div className="label">Variance</div>
                  <div className={variance === 0 ? "value" : "value text-danger"}>
                    {money(current.cashVariance)}
                  </div>
                  <div className="hint">{current.varianceReason ?? ""}</div>
                </div>
              </div>

              {can("shift:reconcile") ? (
                closedByMe && variance !== 0 ? (
                  <div className="alert warn">
                    This shift has a cash variance and you are the person who closed it. Someone else
                    must sign it off — that separation is what makes the variance meaningful.
                  </div>
                ) : (
                  <div className="inline-form">
                    <Field label="Sign-off note">
                      <input value={note} onChange={(e) => setNote(e.target.value)} />
                    </Field>
                    <button
                      type="button"
                      className="primary"
                      disabled={reconcile.isPending}
                      onClick={() => reconcile.mutate({ note: note || undefined })}
                    >
                      {reconcile.isPending ? "Signing off..." : "Reconcile shift"}
                    </button>
                  </div>
                )
              ) : (
                <p className="muted">A manager needs to reconcile this shift.</p>
              )}
            </>
          ) : null}
        </Card>
      ) : null}

      {summary.data ? (
        <Card title="This shift so far">
          <div className="grid cols-4">
            {Object.entries(summary.data).map(([key, value]) => (
              <div className="stat" key={key}>
                <div className="label">{humanise(key.replace(/([A-Z])/g, " $1").toLowerCase())}</div>
                <div className="value text">
                  {typeof value === "number"
                    ? value
                    : /^-?\d+(\.\d+)?$/.test(String(value))
                      ? money(String(value))
                      : String(value)}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </>
  );
}
