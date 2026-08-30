/**
 * The till's local store.
 *
 * IndexedDB rather than localStorage, for two reasons that both matter here: a
 * catalogue of several thousand SKUs comfortably exceeds the ~5 MB localStorage
 * ceiling, and localStorage is synchronous — writing a queued bill on the main
 * thread would stutter the very screen a cashier is typing into.
 *
 * Two stores:
 *
 *   catalogue  what the till can sell, refreshed whenever it is online
 *   outbox     bills rung up offline, awaiting acknowledgement
 *
 * The outbox is the part that must never lose data. A bill lands here BEFORE the
 * cashier is told the sale is complete, so a browser crash between taking the
 * money and syncing cannot lose the sale.
 */

const DB_NAME = "ims-till";
const DB_VERSION = 1;

export const CATALOGUE_STORE = "catalogue";
export const OUTBOX_STORE = "outbox";
export const META_STORE = "meta";

export interface CachedItem {
  variantId: string;
  sku: string;
  productName: string;
  variantName: string | null;
  stockUomId: string;
  stockUomCode: string;
  isDivisible: boolean;
  trackExpiry: boolean;
  /**
   * In-store item code, present only for SKUs that have had a label printed.
   *
   * Carried in the snapshot so a printed weight label still scans with the
   * connection down: the weight is inside the barcode and the price is already
   * cached, so resolving one needs nothing from the server.
   */
  plu: number | null;
  price: string;
  mrp: string | null;
  /** Advisory only: a snapshot that goes stale the moment another till sells. */
  availableQty: string;
  barcodes: string[];
}

export interface QueuedLine {
  variantId: string;
  sku: string;
  productName: string;
  saleUomId: string;
  stockUomCode: string;
  qty: string;
  unitPrice: string;
  discountAmount?: string;
}

export interface QueuedPayment {
  method: "cash" | "card" | "upi" | "wallet" | "store_credit" | "credit";
  amount: string;
  reference?: string;
  tenderedAmount?: string;
}

export interface QueuedSale {
  /** Generated when the sale is rung up, and NEVER regenerated. */
  idempotencyKey: string;
  locationId: string;
  shiftId: string;
  capturedAt: string;
  customerId?: string;
  roundingAdjustment?: string;
  lines: QueuedLine[];
  payments: QueuedPayment[];
  total: string;

  /* --------------------------------------------------------- sync bookkeeping */
  attempts: number;
  lastError?: string;
  /** Set when the server says retrying can never help; needs a person. */
  blocked?: boolean;
}

let dbPromise: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CATALOGUE_STORE)) {
        db.createObjectStore(CATALOGUE_STORE, { keyPath: "variantId" });
      }
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        db.createObjectStore(OUTBOX_STORE, { keyPath: "idempotencyKey" });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the till database"));
  });

  return dbPromise;
}

function transact<T>(
  store: string,
  mode: IDBTransactionMode,
  work: (objectStore: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const request = work(tx.objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Till database write failed"));
      }),
  );
}

/* ---------------------------------------------------------------- catalogue */

export async function saveCatalogue(items: CachedItem[], locationId: string): Promise<void> {
  const db = await open();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([CATALOGUE_STORE, META_STORE], "readwrite");
    const catalogue = tx.objectStore(CATALOGUE_STORE);

    // Replace wholesale rather than merge: a product withdrawn from sale must
    // disappear from the till, and merging would leave it sellable forever.
    catalogue.clear();
    for (const item of items) catalogue.put(item);

    tx.objectStore(META_STORE).put(
      { locationId, cachedAt: new Date().toISOString(), itemCount: items.length },
      "catalogue-meta",
    );

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not cache the catalogue"));
  });
}

export async function loadCatalogue(): Promise<CachedItem[]> {
  return transact<CachedItem[]>(CATALOGUE_STORE, "readonly", (store) => store.getAll());
}

export interface CatalogueMeta {
  locationId: string;
  cachedAt: string;
  itemCount: number;
}

export async function catalogueMeta(): Promise<CatalogueMeta | undefined> {
  return transact<CatalogueMeta | undefined>(META_STORE, "readonly", (store) =>
    store.get("catalogue-meta"),
  );
}

/* ------------------------------------------------------------------- outbox */

export async function queueSale(sale: QueuedSale): Promise<void> {
  await transact(OUTBOX_STORE, "readwrite", (store) => store.put(sale));
}

export async function listQueuedSales(): Promise<QueuedSale[]> {
  const sales = await transact<QueuedSale[]>(OUTBOX_STORE, "readonly", (store) => store.getAll());
  // Oldest first: bills should reach the server in the order they were rung up,
  // so the day reads sensibly and shift attribution stays sane.
  return sales.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}

export async function removeQueuedSale(idempotencyKey: string): Promise<void> {
  await transact(OUTBOX_STORE, "readwrite", (store) => store.delete(idempotencyKey));
}

/** Record a failed attempt without losing the bill. */
export async function markSaleFailed(
  idempotencyKey: string,
  error: string,
  blocked: boolean,
): Promise<void> {
  const existing = await transact<QueuedSale | undefined>(OUTBOX_STORE, "readonly", (store) =>
    store.get(idempotencyKey),
  );
  if (!existing) return;

  await queueSale({
    ...existing,
    attempts: existing.attempts + 1,
    lastError: error,
    blocked,
  });
}

/* --------------------------------------------------------------- the shift
 *
 * An offline bill must name the shift it was rung on, and the shift endpoint is
 * unreachable when the connection is down — so the open shift is cached
 * whenever the till sees it, and read back from here when selling offline.
 */

export interface CachedShift {
  shiftId: string;
  shiftNumber: string;
  locationId: string;
  counterCode: string;
}

export async function saveShift(shift: CachedShift): Promise<void> {
  await transact(META_STORE, 'readwrite', (store) => store.put(shift, 'open-shift'));
}

export async function loadShift(): Promise<CachedShift | undefined> {
  return transact<CachedShift | undefined>(META_STORE, 'readonly', (store) =>
    store.get('open-shift'),
  );
}

export async function clearShift(): Promise<void> {
  await transact(META_STORE, 'readwrite', (store) => store.delete('open-shift'));
}

/** Whether this browser can store anything at all — private mode may refuse. */
export async function storageAvailable(): Promise<boolean> {
  try {
    await open();
    return true;
  } catch {
    return false;
  }
}
