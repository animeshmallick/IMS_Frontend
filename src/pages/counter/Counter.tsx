import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi, useInvalidate } from "../../lib/hooks";
import { useSessionContext } from "../../lib/session";
import { useOffline } from "../../lib/offline";
import { saveShift, loadShift, type CachedItem, type QueuedSale } from "../../lib/offline-db";
import { api, newIdempotencyKey } from "../../lib/api";
import {
  Badge,
  Card,
  ErrorBanner,
  Field,
  Modal,
  PageHead,
  Table,
  TextField,
} from "../../components/ui";
import { VariantPicker } from "../../components/VariantPicker";
import { date, money, multiplyMoney, qty, sumMoney } from "../../lib/format";
import type { Customer, PaymentMethod, SalesOrder, Shift, VariantSearchResult } from "../../lib/types";

const COUNTER_CODE = "TILL-1";

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "wallet", label: "Wallet" },
  { value: "store_credit", label: "Store credit" },
];

/**
 * The sales counter.
 *
 * Runs in two modes, and the cashier should barely notice the difference.
 *
 * ONLINE, a cart holds RESERVATIONS: nothing leaves the shelf while the customer
 * decides, but no other till can sell the same last unit either. Stock moves at
 * placement, where batch costs are fixed into COGS.
 *
 * OFFLINE, there is no server to reserve anything, so the bill is built from the
 * cached catalogue and queued. It is written to disk BEFORE the cashier is told
 * the sale is complete, so a crash between taking the money and syncing cannot
 * lose it.
 *
 * The offline mode can oversell, because a disconnected till cannot see the
 * others. That is the deliberate trade-off: for a shop, taking the sale beats
 * perfect stock accuracy, and the server reconciles the difference on sync.
 */
export function Counter() {
  const navigate = useNavigate();
  const { activeLocation, can } = useSessionContext();
  const invalidate = useInvalidate();
  const offline = useOffline();
  const locationId = activeLocation?.id;

  const [cart, setCart] = useState<SalesOrder | null>(null);
  const [offlineLines, setOfflineLines] = useState<OfflineLine[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [weighing, setWeighing] = useState<PickedItem | null>(null);
  const [cachedShiftId, setCachedShiftId] = useState<string | null>(null);

  /*
   * The scan field is home.
   *
   * A till is driven with a scanner in one hand and goods in the other, so
   * every path through this screen has to end with the caret back in the scan
   * box. Miss it once and the next scan types itself into whatever had focus —
   * a quantity box, a search field, nothing at all — and the cashier finds out
   * when the barcode does not appear.
   */
  const scanRef = useRef<HTMLDivElement>(null);
  const focusScan = useCallback(() => {
    scanRef.current?.querySelector("input")?.focus();
  }, []);

  const shift = useApi<Shift | null>(
    ["counter", "shift", locationId],
    "/counter/shifts/current",
    { locationId: locationId!, counterCode: COUNTER_CODE },
    { enabled: Boolean(locationId) && offline.online, staleTime: 5_000 },
  );

  /*
   * Cache the open shift and the catalogue whenever we can see them.
   *
   * Both are needed to sell offline and neither is reachable once the connection
   * drops, so they are refreshed opportunistically rather than on demand — by
   * the time the till needs them it is too late to fetch.
   */
  useEffect(() => {
    if (!shift.data || shift.data.status !== "open" || !locationId) return;
    void saveShift({
      shiftId: shift.data.id,
      shiftNumber: shift.data.shiftNumber,
      locationId,
      counterCode: COUNTER_CODE,
    });
    setCachedShiftId(shift.data.id);
  }, [shift.data, locationId]);

  useEffect(() => {
    if (!locationId || !offline.online) return;
    void offline.refreshCatalogue(locationId).catch(() => {
      // A failed refresh is not fatal — the previous snapshot still sells.
    });
  }, [locationId, offline.online]);

  useEffect(() => {
    void loadShift().then((cached) => {
      if (cached && cached.locationId === locationId) setCachedShiftId(cached.shiftId);
    });
  }, [locationId]);

  const offlineMode = !offline.online;

  /* ------------------------------------------------------------------ cart */

  async function ensureCart(): Promise<SalesOrder> {
    if (cart) return cart;
    const created = await api<SalesOrder>("/counter/carts", {
      method: "POST",
      body: { locationId, counterCode: COUNTER_CODE },
    });
    setCart(created);
    return created;
  }

  async function run<T>(work: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    try {
      return await work();
    } catch (caught) {
      setError(caught);
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function addItem(item: PickedItem, quantity = "1") {
    if (offlineMode) {
      setOfflineLines((current) => [
        ...current,
        {
          variantId: item.variantId,
          sku: item.sku,
          productName: item.productName,
          saleUomId: item.stockUomId,
          stockUomCode: item.stockUomCode,
          qty: quantity,
          unitPrice: item.price ?? "0",
        },
      ]);
      return;
    }

    await run(async () => {
      const active = await ensureCart();
      const updated = await api<SalesOrder>(`/counter/carts/${active.id}/lines`, {
        method: "POST",
        // A serial identifies one physical device and settles its batch too, so
        // it is sent in preference to the SKU when the cashier scanned one.
        body: item.serialNo
          ? { serialNo: item.serialNo, qty: "1" }
          : { variantId: item.variantId, qty: quantity },
      });
      setCart(updated);
    });
  }

  /**
   * Add a unit by the number on its own sticker.
   *
   * Offline this is not offered: the till has no way to know whether that
   * specific device is still in stock, and guessing would let the same unit be
   * sold twice across two disconnected counters.
   */
  async function addSerial(serialNo: string) {
    await addItem(
      {
        serialNo,
        variantId: "",
        sku: serialNo,
        productName: "",
        stockUomId: "",
        stockUomCode: "",
        isDivisible: false,
        price: null,
      },
      "1",
    );
  }

  async function removeLine(lineId: string) {
    if (!cart) return;
    await run(async () => {
      const updated = await api<SalesOrder>(`/counter/carts/${cart.id}/lines/${lineId}`, {
        method: "DELETE",
      });
      setCart(updated);
    });
  }

  async function abandon() {
    if (offlineMode) {
      setOfflineLines([]);
      return;
    }
    if (!cart) return;
    await run(async () => {
      await api(`/counter/carts/${cart.id}/cancel`, {
        method: "POST",
        body: { reason: "Cancelled at the counter" },
      });
      setCart(null);
      await invalidate(["stock"]);
    });
  }

  /* ------------------------------------------------------------- rendering */

  if (!locationId) {
    return (
      <div className="empty">
        <h3>No working location</h3>
        <p>Choose the store you are selling from, at the top of the screen.</p>
      </div>
    );
  }

  const offlineTotal = sumMoney(
    offlineLines.map((line) => multiplyMoney(line.unitPrice, line.qty)),
  );
  const lineCount = offlineMode ? offlineLines.length : (cart?.lines.length ?? 0);
  const displayTotal = offlineMode ? offlineTotal : (cart?.total ?? "0");

  /*
   * Function keys, not chords.
   *
   * F-keys are unclaimed by the browser and reachable without leaving the home
   * position; ⌘/Ctrl combinations are already taken by the browser and get
   * intercepted before the page sees them. Nothing here is destructive without
   * a confirmation behind it.
   */
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const typing =
        event.target instanceof HTMLElement &&
        /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);

      if (event.key === "F2") {
        event.preventDefault();
        setPayOpen((open) => (lineCount > 0 ? !open : open));
        return;
      }
      if (event.key === "F4") {
        event.preventDefault();
        focusScan();
        return;
      }
      // Escape leaves a field rather than abandoning a bill: a cashier hitting
      // it to clear a mistyped quantity must never lose the whole sale.
      if (event.key === "Escape" && typing) {
        (event.target as HTMLElement).blur();
        focusScan();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [focusScan, lineCount]);


  // Offline we cannot check whether a shift is open; the cached one is the best
  // available answer, and blocking the sale would defeat the point.
  const shiftReady = offlineMode ? Boolean(cachedShiftId) : shift.data?.status === "open";

  if (!offlineMode && shift.isPending) return <p className="loading">Checking the till...</p>;

  if (!shiftReady) {
    return (
      <>
        <PageHead title="Sales counter" subtitle={activeLocation?.name} />
        <ConnectionBanner />
        <Card title="No shift is open at this till">
          <p className="mb">
            A shift makes the cash drawer attributable: takings are measured against the float you
            start with, so the counter cannot be used until one is open.
            {offlineMode ? " You are offline, so a shift must be opened once the connection is back." : ""}
          </p>
          <button
            type="button"
            className="primary"
            disabled={offlineMode}
            onClick={() => navigate("/counter/shifts")}
          >
            Open a shift
          </button>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHead
        title="Sales counter"
        subtitle={
          <>
            {activeLocation?.name} · till {COUNTER_CODE}
            {shift.data ? ` · shift ${shift.data.shiftNumber}` : ""}
          </>
        }
        actions={
          lineCount > 0 ? (
            <button type="button" className="danger" onClick={() => void abandon()} disabled={busy}>
              Abandon bill
            </button>
          ) : null
        }
      />

      <ConnectionBanner />
      <ErrorBanner error={error} />

      <div className="pos">
        <div>
          <Card title="Scan or search">
            <div className="pos-scan" ref={scanRef}>
              {offlineMode ? (
                <OfflinePicker
                  onPick={(item) => (item.isDivisible ? setWeighing(item) : void addItem(item))}
                />
              ) : (
                <VariantPicker
                  autoFocus
                  onPick={(variant) => {
                    const picked = fromSearchResult(variant);
                    return picked.isDivisible ? setWeighing(picked) : void addItem(picked);
                  }}
                  placeholder="Scan a barcode, or type a name or SKU"
                />
              )}
            </div>
            <p className="small muted mt">
              A scan that matches a barcode exactly is added straight away. For loose goods sold by
              weight, add the item then enter the quantity.
            </p>

            {/* Serialised goods are scanned off the unit itself, not the shelf
                label — the sticker on a television identifies that one device,
                which is what a warranty claim needs months later. */}
            {!offlineMode ? <SerialScan onScan={(serialNo) => void addSerial(serialNo)} /> : null}
          </Card>

          <Card title={`Bill${lineCount ? ` — ${lineCount} lines` : ""}`} flush>
            {lineCount === 0 ? (
              <p className="empty">Nothing on the bill yet. Scan the first item.</p>
            ) : offlineMode ? (
              <Table
                head={
                  <tr>
                    <th>Item</th>
                    <th className="num">Qty</th>
                    <th className="num">Price</th>
                    <th className="num">Total</th>
                    <th />
                  </tr>
                }
              >
                {offlineLines.map((line, index) => (
                  <tr key={`${line.variantId}-${index}`}>
                    <td>
                      {line.sku}
                      <span className="sub">{line.productName}</span>
                    </td>
                    <td className="num">
                      {qty(line.qty)} <span className="muted small">{line.stockUomCode}</span>
                    </td>
                    <td className="num">{money(line.unitPrice)}</td>
                    <td className="num">
                      <strong>{money(multiplyMoney(line.unitPrice, line.qty))}</strong>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="ghost sm"
                        onClick={() =>
                          setOfflineLines((c) => c.filter((_, i) => i !== index))
                        }
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Table
                head={
                  <tr>
                    <th>Item</th>
                    <th className="num">Qty</th>
                    <th className="num">Price</th>
                    <th className="num">Total</th>
                    <th />
                  </tr>
                }
              >
                {(cart?.lines ?? []).map((line) => (
                  <tr key={line.id}>
                    <td>
                      {line.sku}
                      <span className="sub">{line.productName}</span>
                      {/* The batch is shown because the cashier is physically
                          handing that lot over, and its expiry is the customer's
                          question. Offline there is no allocation to show. */}
                      {line.allocations.map((allocation) => (
                        <span className="sub" key={allocation.batchId}>
                          {allocation.batchCode}
                          {allocation.expiresOn ? ` · expires ${date(allocation.expiresOn)}` : ""}
                        </span>
                      ))}
                    </td>
                    <td className="num">
                      {qty(line.saleQty)} <span className="muted small">{line.saleUomCode}</span>
                    </td>
                    <td className="num">{money(line.unitPrice)}</td>
                    <td className="num">
                      <strong>{money(line.lineTotal)}</strong>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="ghost sm"
                        disabled={busy}
                        onClick={() => void removeLine(line.id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>

        <div className="pos-side">
          <Card title="Total">
            <div className="pos-line-total">
              <span>Subtotal</span>
              <span className="num">{money(offlineMode ? offlineTotal : (cart?.subtotal ?? "0"))}</span>
            </div>
            {!offlineMode && Number(cart?.discountAmount ?? 0) > 0 ? (
              <div className="pos-line-total">
                <span>Discount</span>
                <span className="num">−{money(cart!.discountAmount)}</span>
              </div>
            ) : null}
            <div className="pos-line-total grand">
              <span>To pay</span>
              <span className="pos-total">{money(displayTotal)}</span>
            </div>

            <button
              type="button"
              className="primary lg block mt"
              disabled={lineCount === 0 || busy}
              onClick={() => setPayOpen(true)}
            >
              Take payment
              <kbd>F2</kbd>
            </button>

            <div className="keyhints">
              <span>
                <kbd>F2</kbd> Pay
              </span>
              <span>
                <kbd>F4</kbd> Back to scan
              </span>
              <span>
                <kbd>Esc</kbd> Leave field
              </span>
            </div>
          </Card>

          {!offlineMode && cart ? (
            <CustomerPanel
              cart={cart}
              disabled={busy}
              onChange={setCart}
              canDiscount={can("sale:discount")}
              onError={setError}
            />
          ) : null}
        </div>
      </div>

      {weighing ? (
        <WeightModal
          item={weighing}
          onClose={() => setWeighing(null)}
          onConfirm={async (amount) => {
            const picked = weighing;
            setWeighing(null);
            await addItem(picked, amount);
          }}
        />
      ) : null}

      {payOpen && (offlineMode ? offlineLines.length > 0 : cart) ? (
        <PaymentModal
          total={displayTotal}
          offline={offlineMode}
          onClose={() => setPayOpen(false)}
          onPay={async (payments) => {
            if (offlineMode) {
              const queued: QueuedSale = {
                // Minted ONCE, here, and reused on every retry for the life of
                // this bill — a fresh key per attempt is how a customer gets
                // charged twice.
                idempotencyKey: newIdempotencyKey(),
                locationId: locationId!,
                shiftId: cachedShiftId!,
                capturedAt: new Date().toISOString(),
                lines: offlineLines,
                payments,
                total: offlineTotal,
                attempts: 0,
              };
              await offline.enqueue(queued);
              setOfflineLines([]);
              setPayOpen(false);
              return { offline: true as const };
            }

            const order = await api<SalesOrder>(`/counter/carts/${cart!.id}/place`, {
              method: "POST",
              idempotencyKey: newIdempotencyKey(),
              body: { payments },
            });
            setPayOpen(false);
            setCart(null);
            await invalidate(["stock"], ["counter"], ["reports"]);
            navigate(`/counter/orders/${order.id}?justPlaced=1`);
            return { offline: false as const };
          }}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------- types */

interface OfflineLine {
  variantId: string;
  sku: string;
  productName: string;
  saleUomId: string;
  stockUomCode: string;
  qty: string;
  unitPrice: string;
  discountAmount?: string;
}

/** The common shape of an item picked either from the server or from the cache. */
interface PickedItem {
  /** Set when the cashier scanned a unit sticker rather than a shelf barcode. */
  serialNo?: string;
  variantId: string;
  sku: string;
  productName: string;
  stockUomId: string;
  stockUomCode: string;
  isDivisible: boolean;
  price: string | null;
}

function fromSearchResult(variant: VariantSearchResult): PickedItem {
  return {
    variantId: variant.variantId,
    sku: variant.sku,
    productName: variant.productName,
    // The online picker does not carry the UoM id; the server defaults to the
    // variant's stock unit when none is sent, which is the same thing.
    stockUomId: "",
    stockUomCode: variant.stockUomCode,
    isDivisible: variant.isDivisible,
    price: variant.price,
  };
}

/* ------------------------------------------------------- connection banner */

/**
 * Says plainly what mode the till is in.
 *
 * A cashier must never have to guess whether a sale reached the system, so this
 * is deliberately loud when offline and when anything is still queued.
 */
function ConnectionBanner() {
  const { online, pending, blocked, syncing, catalogueCachedAt, sync } = useOffline();

  if (!online) {
    return (
      <div className="alert warn">
        <strong>Offline — still selling.</strong> Bills are being saved on this device and will
        upload by themselves when the connection returns.
        {pending > 0 ? ` ${pending} waiting.` : ""}
        {catalogueCachedAt ? (
          <span className="rid">Prices last updated {date(catalogueCachedAt)}</span>
        ) : null}
      </div>
    );
  }

  if (blocked.length > 0) {
    return (
      <div className="alert error">
        <strong>{blocked.length} bill(s) could not be uploaded.</strong>{" "}
        {blocked[0]?.lastError ?? ""} These need someone to look at them — see System Health.
      </div>
    );
  }

  if (pending > 0 || syncing) {
    return (
      <div className="alert">
        {syncing ? "Uploading" : "Waiting to upload"} {pending} offline bill(s).{" "}
        <button type="button" className="sm" onClick={() => void sync()}>
          Upload now
        </button>
      </div>
    );
  }

  return null;
}

/* ------------------------------------------------------------ offline picker */

/** Search the cached catalogue. Same keyboard behaviour as the online picker. */
function OfflinePicker({ onPick }: { onPick: (item: PickedItem) => void }) {
  const { lookup, catalogue } = useOffline();
  const [term, setTerm] = useState("");

  const results = lookup(term);

  function pick(item: CachedItem) {
    onPick({
      variantId: item.variantId,
      sku: item.sku,
      productName: item.productName,
      stockUomId: item.stockUomId,
      stockUomCode: item.stockUomCode,
      isDivisible: item.isDivisible,
      price: item.price,
    });
    setTerm("");
  }

  if (catalogue.length === 0) {
    return (
      <div className="alert error">
        This till has no cached price list, so it cannot sell offline. Connect once to download it.
      </div>
    );
  }

  return (
    <div>
      <input
        autoFocus
        value={term}
        placeholder="Scan a barcode, or type a name or SKU"
        onChange={(event) => setTerm(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          // A scanner ends with Enter. One result means nothing to choose between.
          if (results.length === 1) pick(results[0]!);
        }}
      />

      {results.length > 0 ? (
        <div className="search-results">
          {results.map((item) => (
            <button type="button" key={item.variantId} onClick={() => pick(item)}>
              <div className="spread">
                <span>
                  <strong>{item.sku}</strong>
                  <span className="sub">{item.productName}</span>
                </span>
                <span className="nowrap muted small">
                  {money(item.price)} / {item.stockUomCode}
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : null}

      {term.trim() && results.length === 0 ? (
        <p className="small muted mt">Nothing in the cached list matches “{term}”.</p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ weighed goods */

function WeightModal({
  item,
  onClose,
  onConfirm,
}: {
  item: PickedItem;
  onClose: () => void;
  onConfirm: (amount: string) => void | Promise<void>;
}) {
  const [amount, setAmount] = useState("");

  return (
    <Modal
      narrow
      title={item.productName}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={!(Number(amount) > 0)}
            onClick={() => void onConfirm(amount)}
          >
            Add to bill
          </button>
        </>
      }
    >
      <Field
        label={`Quantity in ${item.stockUomCode}`}
        help={item.price ? `${money(item.price)} per ${item.stockUomCode}` : "No price set."}
      >
        <input
          autoFocus
          className="num"
          inputMode="decimal"
          value={amount}
          placeholder="0"
          onChange={(event) => setAmount(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && Number(amount) > 0) void onConfirm(amount);
          }}
        />
      </Field>

      {Number(amount) > 0 && item.price ? (
        <p>
          Line total <strong>{money(multiplyMoney(item.price, amount))}</strong>
        </p>
      ) : null}
    </Modal>
  );
}

/* ------------------------------------------------------- customer & discount */

function CustomerPanel({
  cart,
  disabled,
  onChange,
  canDiscount,
  onError,
}: {
  cart: SalesOrder;
  disabled: boolean;
  onChange: (order: SalesOrder) => void;
  canDiscount: boolean;
  onError: (error: unknown) => void;
}) {
  const [phone, setPhone] = useState("");
  const [discount, setDiscount] = useState("");
  const [reason, setReason] = useState("");

  const found = useApi<Customer[]>(
    ["partners", "customers", phone],
    "/partners/customers/search",
    { q: phone, limit: 5 },
    { enabled: phone.trim().length >= 3 },
  );

  async function attach(customerId: string | null) {
    try {
      onChange(
        await api<SalesOrder>(`/counter/carts/${cart.id}/customer`, {
          method: "PUT",
          body: { customerId },
        }),
      );
      setPhone("");
    } catch (error) {
      onError(error);
    }
  }

  async function applyDiscount() {
    try {
      onChange(
        await api<SalesOrder>(`/counter/carts/${cart.id}/discount`, {
          method: "POST",
          body: { discountAmount: discount, reason },
        }),
      );
      setDiscount("");
      setReason("");
    } catch (error) {
      onError(error);
    }
  }

  return (
    <Card title="Customer">
      {cart.customerName ? (
        <div className="spread mb">
          <strong>{cart.customerName}</strong>
          <button type="button" className="ghost sm" onClick={() => void attach(null)}>
            Remove
          </button>
        </div>
      ) : (
        <>
          <TextField
            label="Phone or name"
            value={phone}
            disabled={disabled}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Optional"
          />
          {(found.data ?? []).map((customer) => (
            <button
              type="button"
              key={customer.id}
              className="sm"
              style={{ width: "100%", marginBottom: "0.25rem" }}
              onClick={() => void attach(customer.id)}
            >
              {customer.name} {customer.phone ? `· ${customer.phone}` : ""}
            </button>
          ))}
        </>
      )}

      {canDiscount ? (
        <>
          <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "0.7rem 0" }} />
          <Field label="Bill discount" help="A reason is required — discounts are reported on.">
            <input
              inputMode="decimal"
              value={discount}
              placeholder="0.00"
              onChange={(e) => setDiscount(e.target.value)}
            />
          </Field>
          <TextField
            value={reason}
            placeholder="Reason"
            onChange={(e) => setReason(e.target.value)}
          />
          <button
            type="button"
            className="sm"
            disabled={!discount || reason.trim().length < 3}
            onClick={() => void applyDiscount()}
          >
            Apply discount
          </button>
        </>
      ) : null}
    </Card>
  );
}

/* ------------------------------------------------------------------ payment */

interface Tender {
  method: PaymentMethod;
  amount: string;
  reference: string;
  tendered: string;
}

/**
 * Split tender.
 *
 * Payments must sum to the bill exactly — the server refuses otherwise, online
 * or on sync — so the shortfall is shown live rather than discovered later.
 */
function PaymentModal({
  total,
  offline,
  onClose,
  onPay,
}: {
  total: string;
  offline: boolean;
  onClose: () => void;
  onPay: (payments: { method: PaymentMethod; amount: string; reference?: string; tenderedAmount?: string }[]) => Promise<{ offline: boolean }>;
}) {
  const [tenders, setTenders] = useState<Tender[]>([
    { method: "cash", amount: total, reference: "", tendered: "" },
  ]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const paid = tenders.reduce((sum, t) => sum + Math.round(Number(t.amount || 0) * 100), 0);
  const due = Math.round(Number(total) * 100);
  const outstanding = (due - paid) / 100;

  const cashTender = tenders.find((t) => t.method === "cash");
  const change =
    cashTender && Number(cashTender.tendered) > 0
      ? Number(cashTender.tendered) - Number(cashTender.amount || 0)
      : 0;

  function patch(index: number, changes: Partial<Tender>) {
    setTenders((current) => current.map((t, i) => (i === index ? { ...t, ...changes } : t)));
  }

  async function place() {
    setBusy(true);
    setError(null);
    try {
      await onPay(
        tenders
          .filter((t) => Number(t.amount) > 0)
          .map((t) => ({
            method: t.method,
            amount: t.amount,
            reference: t.reference || undefined,
            tenderedAmount:
              t.method === "cash" && Number(t.tendered) > 0 ? t.tendered : undefined,
          })),
      );
    } catch (caught) {
      setError(caught);
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Take payment — ${money(total)}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy}>
            Back
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy || Math.abs(outstanding) > 0.001}
            onClick={() => void place()}
          >
            {busy ? "Placing..." : offline ? "Complete sale (offline)" : "Place bill"}
          </button>
        </>
      }
    >
      <ErrorBanner error={error} />

      {offline ? (
        <div className="alert warn">
          This bill will be saved on this device and uploaded automatically when the connection
          returns. Give the customer their goods and change as normal.
        </div>
      ) : null}

      {tenders.map((tender, index) => (
        <div className="inline-form mb" key={index}>
          <Field label="Method">
            <select
              value={tender.method}
              onChange={(e) => patch(index, { method: e.target.value as PaymentMethod })}
            >
              {METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Amount">
            <input
              className="num"
              inputMode="decimal"
              value={tender.amount}
              onChange={(e) => patch(index, { amount: e.target.value })}
            />
          </Field>

          {tender.method === "cash" ? (
            <Field label="Cash given">
              <input
                className="num"
                inputMode="decimal"
                value={tender.tendered}
                onChange={(e) => patch(index, { tendered: e.target.value })}
              />
            </Field>
          ) : (
            <Field label="Reference">
              <input
                value={tender.reference}
                placeholder="UPI / card ref"
                onChange={(e) => patch(index, { reference: e.target.value })}
              />
            </Field>
          )}

          {tenders.length > 1 ? (
            <button
              type="button"
              className="ghost sm"
              onClick={() => setTenders((c) => c.filter((_, i) => i !== index))}
            >
              Remove
            </button>
          ) : null}
        </div>
      ))}

      <button
        type="button"
        className="sm"
        onClick={() =>
          setTenders((current) => [
            ...current,
            {
              method: "upi",
              amount: outstanding > 0 ? outstanding.toFixed(2) : "0",
              reference: "",
              tendered: "",
            },
          ])
        }
      >
        Split payment
      </button>

      <div className="mt">
        {Math.abs(outstanding) > 0.001 ? (
          <Badge tone={outstanding > 0 ? "warn" : "danger"}>
            {outstanding > 0
              ? `${money(outstanding)} still to pay`
              : `${money(-outstanding)} over the bill total`}
          </Badge>
        ) : (
          <Badge tone="success">Payment matches the bill</Badge>
        )}

        {change > 0 ? (
          <p className="mt">
            <strong>Change to give: {money(change)}</strong>
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------ serial scan */

/**
 * Scan a unit by the number on its own sticker.
 *
 * Kept as its own field rather than folded into the product search: the two are
 * different actions with different failure modes. A product search that finds
 * nothing means "try another word"; a serial that finds nothing means "this unit
 * is not in stock here", which is something the cashier needs told plainly.
 */
function SerialScan({ onScan }: { onScan: (serialNo: string) => void }) {
  const [value, setValue] = useState("");

  function submit() {
    const serialNo = value.trim();
    if (!serialNo) return;
    onScan(serialNo);
    setValue("");
  }

  return (
    <Field
      label="Serial / IMEI"
      help="For televisions, phones and anything else tracked by unit."
    >
      <div className="inline-form">
        <input
          value={value}
          placeholder="Scan the sticker on the unit"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            submit();
          }}
        />
        <button type="button" className="sm" disabled={!value.trim()} onClick={submit}>
          Add
        </button>
      </div>
    </Field>
  );
}
