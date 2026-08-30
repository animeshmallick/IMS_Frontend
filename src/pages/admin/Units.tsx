import { ArrowRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Badge,
  Card,
  ErrorBanner,
  Field,
  Modal,
  PageHead,
  SelectField,
  Table,
  TextField,
} from "../../components/ui";
import { useApi, useApiMutation } from "../../lib/hooks";
import { useSessionContext } from "../../lib/session";
import type { Uom } from "../../lib/types";
import { convertAll } from "../../lib/units";

/**
 * Units, and what they convert to.
 *
 * Two jobs on one screen because they are the same subject. The calculator
 * answers "how much is that really", which staff ask constantly; the table
 * below it is what the calculator — and the whole rest of the application —
 * actually reads. Change a unit here and every quantity in the app is displayed
 * differently, with no deploy.
 */

const DIMENSIONS = ["mass", "volume", "length", "area", "count"] as const;

export function Units() {
  const { can } = useSessionContext();
  const units = useApi<Uom[]>(["catalog", "uoms"], "/catalog/uoms");
  const [adding, setAdding] = useState(false);

  return (
    <>
      <PageHead
        title="Units"
        subtitle="What a quantity means, and how it is shown across the app"
        actions={
          can("settings:write") ? (
            <button type="button" className="primary" onClick={() => setAdding(true)}>
              <Plus size={14} aria-hidden />
              Add a unit
            </button>
          ) : null
        }
      />

      <ErrorBanner error={units.error} />

      <div className="grid cols-2 mb">
        <Converter units={units.data ?? []} />
        <Explainer />
      </div>

      <Card title="Every unit" flush>
        <Table
          head={
            <tr>
              <th>Unit</th>
              <th>Measures</th>
              <th className="num">One of these is</th>
              <th>Shown automatically</th>
            </tr>
          }
        >
          {DIMENSIONS.flatMap((dimension) => {
            const rows = (units.data ?? [])
              .filter((u) => u.dimension === dimension)
              .sort((a, b) => Number(a.factorToBase) - Number(b.factorToBase));
            if (rows.length === 0) return [];
            const base = rows.find((u) => u.isDimensionBase);

            return rows.map((u) => (
              <tr key={u.id}>
                <td>
                  <strong className="mono">{u.code}</strong>
                  <span className="sub">{u.name}</span>
                </td>
                <td className="small muted">{u.dimension}</td>
                <td className="num">
                  {u.isDimensionBase ? (
                    <Badge tone="info">base unit</Badge>
                  ) : (
                    <>
                      {Number(u.factorToBase).toLocaleString("en-IN", {
                        maximumFractionDigits: 6,
                      })}{" "}
                      <span className="muted small">{base?.code}</span>
                    </>
                  )}
                </td>
                <td>
                  {u.autoDisplay ? (
                    <Badge tone="success">yes</Badge>
                  ) : (
                    <>
                      <Badge>no</Badge>
                      <span className="sub">Available when pinned or converting</span>
                    </>
                  )}
                </td>
              </tr>
            ));
          })}
        </Table>
      </Card>

      {adding ? <AddUnit units={units.data ?? []} onClose={() => setAdding(false)} /> : null}
    </>
  );
}

/* -------------------------------------------------------------- calculator */

function Converter({ units }: { units: Uom[] }) {
  const [amount, setAmount] = useState("1");
  const [from, setFrom] = useState("kg");

  const rows = useMemo(() => {
    const n = Number(amount);
    if (!Number.isFinite(n) || !units.length) return [];
    return convertAll(n, from, units);
  }, [amount, from, units]);

  return (
    <Card title="Convert">
      <div className="inline-form mb">
        <Field label="Amount">
          <input
            className="num"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </Field>
        <Field label="Unit">
          <select value={from} onChange={(event) => setFrom(event.target.value)}>
            {units.map((u) => (
              <option key={u.id} value={u.code}>
                {u.code} — {u.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {rows.length > 0 ? (
        <table>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code}>
                <td className="small muted">
                  <ArrowRight size={12} aria-hidden /> {r.name}
                </td>
                <td className="num">
                  {/*
                   * Full precision, not display precision. This is a
                   * calculator, and one that quietly rounds is worse than
                   * useless — you cannot tell whether the number is exact.
                   */}
                  <strong>{r.value.toLocaleString("en-IN", { maximumFractionDigits: 10 })}</strong>{" "}
                  <span className="muted">{r.code}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="hint">Enter an amount to convert.</p>
      )}
    </Card>
  );
}

function Explainer() {
  return (
    <Card title="How quantities are shown">
      <p className="hint mb">
        Stock is <strong>stored</strong> in the base unit of its kind — grams,
        millilitres, millimetres — and that never changes. It is what keeps the ledger
        exact.
      </p>
      <p className="hint mb">
        What you see is chosen for readability: the largest unit that leaves a number
        of at least 1, which is how anyone would write it by hand.
      </p>
      <div className="tw">
        <table>
          <tbody>
            <tr><td className="mono small">2000 g</td><td className="small">2 kg</td></tr>
            <tr><td className="mono small">1250 g</td><td className="small">1.25 kg</td></tr>
            <tr><td className="mono small">250 g</td><td className="small">250 g</td></tr>
            <tr><td className="mono small">1500 mm</td><td className="small">1.5 m</td></tr>
          </tbody>
        </table>
      </div>
      <p className="hint mt">
        The <strong>price converts with it</strong>. Atta stored at ₹0.045 per gram shows
        as ₹45.00 per kg, so a bill line reads 2 kg × ₹45.00 rather than 2 kg × ₹0.045.
      </p>
      <p className="hint">
        Units marked <em>not shown automatically</em> — quintals, milligrams — are still
        real and still convert here. They are simply not what the app reaches for on its
        own, because nobody asks for a quintal and a half of flour.
      </p>
    </Card>
  );
}

/* ----------------------------------------------------------------- adding */

function AddUnit({ units, onClose }: { units: Uom[]; onClose: () => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [dimension, setDimension] = useState<(typeof DIMENSIONS)[number]>("mass");
  const [factor, setFactor] = useState("");
  const [autoDisplay, setAutoDisplay] = useState(true);

  const create = useApiMutation<Record<string, unknown>, Uom>("/catalog/uoms", {
    invalidate: [["catalog", "uoms"]],
    onSuccess: onClose,
  });

  const base = units.find((u) => u.dimension === dimension && u.isDimensionBase);

  return (
    <Modal
      title="Add a unit"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={!code || !name || !factor || create.isPending}
            onClick={() =>
              create.mutate({ code, name, dimension, factorToBase: factor, autoDisplay })
            }
          >
            Add
          </button>
        </>
      }
    >
      <ErrorBanner error={create.error} />

      <div className="grid cols-2">
        <TextField
          label="Code"
          value={code}
          placeholder="tola"
          onChange={(e) => setCode(e.target.value)}
          help="What appears beside a number"
        />
        <TextField
          label="Name"
          value={name}
          placeholder="Tola"
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <SelectField
        label="What it measures"
        value={dimension}
        onChange={(e) => setDimension(e.target.value as (typeof DIMENSIONS)[number])}
      >
        {DIMENSIONS.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </SelectField>

      {/*
       * The factor is to the dimension's BASE, and getting that backwards is the
       * one mistake that matters — so the label says which unit, by name, rather
       * than leaving it to be inferred.
       */}
      <TextField
        label={`How many ${base?.code ?? "base units"} in one?`}
        className="num"
        inputMode="decimal"
        value={factor}
        placeholder="11.6638"
        onChange={(e) => setFactor(e.target.value)}
        help={
          base
            ? `One ${code || "unit"} equals this many ${base.name.toLowerCase()}. A kilogram would be 1000.`
            : undefined
        }
      />

      <label className="check mt">
        <input
          type="checkbox"
          checked={autoDisplay}
          onChange={(e) => setAutoDisplay(e.target.checked)}
        />
        Let the app show quantities in this unit on its own
      </label>

      <div className="alert info mt">
        <div>
          A new unit cannot become the base for what it measures. There is exactly one
          base, every stored quantity is expressed in it, and changing it would restate
          every number in the system.
        </div>
      </div>
    </Modal>
  );
}
