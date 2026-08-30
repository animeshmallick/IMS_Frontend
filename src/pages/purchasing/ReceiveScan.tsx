import { Barcode, Check, Link2 } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "../../lib/api";
import { useApiMutation } from "../../lib/hooks";
import { ErrorBanner } from "../../components/ui";

/**
 * Scanning a packet while receiving it.
 *
 * This is the moment a barcode first exists as far as the shop is concerned.
 * A product bought for the first time is created blind — nobody has seen the
 * packet, so there is nothing to enter — and the code printed on it is only
 * discoverable when the goods are on the bench. Without somewhere to put it,
 * the scan resolves to nothing and the item is unsellable until somebody
 * notices at a till with a queue waiting.
 *
 * So a scan here does one of three things, and which one it does is the whole
 * value:
 *
 *   known, on this order      jump to that line, so receiving is a scan-and-type
 *                             loop rather than hunting down a list
 *   unknown                   offer to link it to a line — the case above
 *   known, NOT on this order  say so plainly. This is the wrong goods arriving,
 *                             and it is worth catching on the bench rather than
 *                             three weeks later during a stock count.
 */

export interface ScanTarget {
  purchaseOrderLineId: string;
  variantId: string;
  sku: string;
  variantName: string | null;
}

type Outcome =
  | { kind: "matched"; sku: string }
  | { kind: "unknown"; barcode: string }
  | { kind: "elsewhere"; barcode: string; sku: string; productName: string };

export function ReceiveScan({
  lines,
  onMatch,
  onLinked,
}: {
  lines: ScanTarget[];
  /** A scan that resolved to a line on this receipt. */
  onMatch: (purchaseOrderLineId: string) => void;
  /** A barcode was just attached to a variant; the caller refetches. */
  onLinked: () => void;
}) {
  const [term, setTerm] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [linkTo, setLinkTo] = useState("");
  const [error, setError] = useState<unknown>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const link = useApiMutation<{ variantId: string; barcode: string }, unknown>(
    (body) => `/catalog/variants/${body.variantId}/barcodes`,
    { invalidate: [["catalog", "product"]] },
  );

  async function resolve(raw: string) {
    const barcode = raw.trim();
    if (!barcode) return;
    setError(null);
    setTerm("");

    try {
      /*
       * The ordinary variant search, which resolves an exact barcode first.
       * Reusing it means a generated in-store code and a manufacturer code
       * behave identically here, with no second lookup path to keep in step.
       */
      const results = await api<{ variantId: string; sku: string; productName: string; exactBarcode: boolean }[]>(
        "/catalog/variants/search",
        { query: { q: barcode, limit: 5 } },
      );

      const exact = results.find((r) => r.exactBarcode);

      if (!exact) {
        setOutcome({ kind: "unknown", barcode });
        // Pre-select the only sensible target when there is exactly one line.
        setLinkTo(lines.length === 1 ? lines[0]!.purchaseOrderLineId : "");
        return;
      }

      const onThisOrder = lines.find((l) => l.variantId === exact.variantId);
      if (onThisOrder) {
        setOutcome({ kind: "matched", sku: exact.sku });
        onMatch(onThisOrder.purchaseOrderLineId);
        return;
      }

      setOutcome({
        kind: "elsewhere",
        barcode,
        sku: exact.sku,
        productName: exact.productName,
      });
    } catch (err) {
      setError(err);
    } finally {
      inputRef.current?.focus();
    }
  }

  async function attach() {
    const target = lines.find((l) => l.purchaseOrderLineId === linkTo);
    if (!target || outcome?.kind !== "unknown") return;

    try {
      await link.mutateAsync({ variantId: target.variantId, barcode: outcome.barcode });
      setOutcome({ kind: "matched", sku: target.sku });
      onMatch(target.purchaseOrderLineId);
      onLinked();
    } catch (err) {
      setError(err);
    } finally {
      inputRef.current?.focus();
    }
  }

  return (
    <div className="receive-scan">
      <form
        className="row"
        onSubmit={(event) => {
          event.preventDefault();
          void resolve(term);
        }}
      >
        <Barcode size={16} aria-hidden />
        <input
          ref={inputRef}
          autoFocus
          className="mono grow"
          value={term}
          placeholder="Scan the packet"
          onChange={(event) => setTerm(event.target.value)}
        />
        <button type="submit" className="sm" disabled={!term.trim()}>
          Find
        </button>
      </form>

      <ErrorBanner error={error ?? link.error} />

      {outcome?.kind === "matched" ? (
        <div className="alert success">
          <div>
            <Check size={14} aria-hidden /> <strong>{outcome.sku}</strong> — line highlighted below.
          </div>
        </div>
      ) : null}

      {outcome?.kind === "elsewhere" ? (
        <div className="alert warn">
          <div>
            <strong>That is {outcome.sku}</strong> ({outcome.productName}), which is not on this
            purchase order. Check you are receiving the right goods before continuing.
          </div>
        </div>
      ) : null}

      {outcome?.kind === "unknown" ? (
        <div className="alert info">
          <div className="grow">
            <strong className="mono">{outcome.barcode}</strong> is not linked to anything yet.
            {/*
              * The expected case for a first delivery, not an error: the SKU was
              * created before anyone had seen the packet, so this is the first
              * time the number has existed for the shop.
              */}
            <span className="sub">
              This is normal the first time a product arrives. Attach it to the line it belongs
              to and it will scan everywhere from now on — the counter, the sheet, and offline.
            </span>
            <div className="inline-form mt">
              <select value={linkTo} onChange={(event) => setLinkTo(event.target.value)}>
                <option value="">Which line is this?</option>
                {lines.map((l) => (
                  <option key={l.purchaseOrderLineId} value={l.purchaseOrderLineId}>
                    {l.sku}
                    {l.variantName ? ` · ${l.variantName}` : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="primary"
                disabled={!linkTo || link.isPending}
                onClick={() => void attach()}
              >
                <Link2 size={14} aria-hidden />
                Link it
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
