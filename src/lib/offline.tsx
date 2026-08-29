import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";
import {
  catalogueMeta,
  listQueuedSales,
  loadCatalogue,
  markSaleFailed,
  queueSale,
  removeQueuedSale,
  saveCatalogue,
  storageAvailable,
  type CachedItem,
  type QueuedSale,
} from "./offline-db";

/**
 * Keeping the till working when the connection does not.
 *
 * A shop that trades offline today cannot be handed a system that stops selling
 * when the internet drops, so the counter falls back to a cached catalogue and
 * queues its bills. Three things make that safe:
 *
 * 1. **The queue is written before the cashier is told the sale is done.** A
 *    crash between taking the money and syncing cannot lose the sale.
 * 2. **Each bill carries one idempotency key for life.** The server returns the
 *    original sale on a replay instead of billing the customer twice, so
 *    retrying is always safe — which is what lets this retry freely.
 * 3. **Nothing is deleted until the server acknowledges it.** A failed sync
 *    leaves the bill queued; only a definite answer clears it.
 *
 * `navigator.onLine` is treated as a hint, not truth. It reports whether a
 * network interface exists, not whether our server is reachable — a café Wi-Fi
 * portal is "online" and useless. So the real signal is whether requests
 * actually succeed.
 */

export interface OfflineState {
  /** Our server answered recently. */
  online: boolean;
  /** Bills waiting to reach the server. */
  pending: number;
  /** Bills the server rejected permanently; these need a person. */
  blocked: QueuedSale[];
  syncing: boolean;
  catalogue: CachedItem[];
  catalogueCachedAt: string | null;
  storageReady: boolean;

  refreshCatalogue: (locationId: string) => Promise<void>;
  enqueue: (sale: QueuedSale) => Promise<void>;
  sync: () => Promise<void>;
  lookup: (term: string) => CachedItem[];
}

const OfflineContext = createContext<OfflineState | undefined>(undefined);

interface SyncResponse {
  synced: number;
  duplicates: number;
  failed: number;
  results: {
    idempotencyKey: string;
    status: "synced" | "duplicate" | "failed";
    orderNumber?: string;
    error?: { code: string; message: string };
    retryable?: boolean;
  }[];
}

export function OfflineProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [blocked, setBlocked] = useState<QueuedSale[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [catalogue, setCatalogue] = useState<CachedItem[]>([]);
  const [catalogueCachedAt, setCachedAt] = useState<string | null>(null);
  const [storageReady, setStorageReady] = useState(false);

  // Guards against two syncs overlapping — a timer firing while a reconnect
  // sync is still in flight would send the same bills twice. Harmless thanks to
  // idempotency, but wasteful and confusing in the logs.
  const syncingRef = useRef(false);

  const refreshQueueState = useCallback(async () => {
    const queued = await listQueuedSales();
    setPending(queued.filter((sale) => !sale.blocked).length);
    setBlocked(queued.filter((sale) => sale.blocked));
  }, []);

  /* ------------------------------------------------------------------ boot */
  useEffect(() => {
    void (async () => {
      const ready = await storageAvailable();
      setStorageReady(ready);
      if (!ready) return;

      const [items, meta] = await Promise.all([loadCatalogue(), catalogueMeta()]);
      setCatalogue(items);
      setCachedAt(meta?.cachedAt ?? null);
      await refreshQueueState();
    })();
  }, [refreshQueueState]);

  /* ------------------------------------------------------------- catalogue */
  const refreshCatalogue = useCallback(async (locationId: string) => {
    const snapshot = await api<{ items: CachedItem[]; capturedAt: string }>(
      "/offline/catalogue",
      { query: { locationId } },
    );
    await saveCatalogue(snapshot.items, locationId);
    setCatalogue(snapshot.items);
    setCachedAt(snapshot.capturedAt);
  }, []);

  /* ------------------------------------------------------------------ sync */
  const sync = useCallback(async () => {
    if (syncingRef.current) return;

    const queued = (await listQueuedSales()).filter((sale) => !sale.blocked);
    if (queued.length === 0) {
      await refreshQueueState();
      return;
    }

    syncingRef.current = true;
    setSyncing(true);

    try {
      const response = await api<SyncResponse>("/offline/sync", {
        method: "POST",
        body: {
          sales: queued.map((sale) => ({
            idempotencyKey: sale.idempotencyKey,
            locationId: sale.locationId,
            shiftId: sale.shiftId,
            capturedAt: sale.capturedAt,
            customerId: sale.customerId,
            roundingAdjustment: sale.roundingAdjustment,
            lines: sale.lines.map((line) => ({
              variantId: line.variantId,
              saleUomId: line.saleUomId,
              qty: line.qty,
              unitPrice: line.unitPrice,
              discountAmount: line.discountAmount,
            })),
            payments: sale.payments,
          })),
        },
      });

      for (const result of response.results) {
        if (result.status === "synced" || result.status === "duplicate") {
          // A duplicate means the server already had it — equally done.
          await removeQueuedSale(result.idempotencyKey);
        } else {
          await markSaleFailed(
            result.idempotencyKey,
            result.error?.message ?? "Unknown error",
            result.retryable === false,
          );
        }
      }

      setOnline(true);
    } catch {
      // The whole request failed, so nothing was acknowledged and every bill
      // stays queued. Not an error state for the user — just still offline.
      setOnline(false);
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      await refreshQueueState();
    }
  }, [refreshQueueState]);

  const enqueue = useCallback(
    async (sale: QueuedSale) => {
      await queueSale(sale);
      await refreshQueueState();
      // Try immediately: if the connection is fine this lands within a second
      // and the cashier never knows the queue existed.
      void sync();
    },
    [refreshQueueState, sync],
  );

  /* ------------------------------------------------- connectivity watching */
  useEffect(() => {
    function handleOnline() {
      setOnline(true);
      void sync();
    }
    function handleOffline() {
      setOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    /*
     * Poll as well as listen.
     *
     * The browser's events fire on interface changes, which is not the same
     * question as "can we reach our server". A lightweight health check every
     * 20 seconds is what actually detects a captive portal, a dead VPN or a
     * server restart — and it drains the queue without anyone pressing anything.
     */
    const timer = setInterval(() => {
      void (async () => {
        try {
          await api("/health/live");
          setOnline(true);
          void sync();
        } catch {
          setOnline(false);
        }
      })();
    }, 20_000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(timer);
    };
  }, [sync]);

  /* ---------------------------------------------------------------- lookup */
  const lookup = useCallback(
    (term: string): CachedItem[] => {
      const needle = term.trim().toLowerCase();
      if (!needle) return [];

      // An exact barcode wins outright — a scan should resolve to one row, not
      // land partway down a fuzzy list.
      const scanned = catalogue.find((item) =>
        item.barcodes.some((barcode) => barcode.toLowerCase() === needle),
      );
      if (scanned) return [scanned];

      return catalogue
        .filter(
          (item) =>
            item.sku.toLowerCase().includes(needle) ||
            item.productName.toLowerCase().includes(needle),
        )
        .slice(0, 15);
    },
    [catalogue],
  );

  const value: OfflineState = {
    online,
    pending,
    blocked,
    syncing,
    catalogue,
    catalogueCachedAt,
    storageReady,
    refreshCatalogue,
    enqueue,
    sync,
    lookup,
  };

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline(): OfflineState {
  const value = useContext(OfflineContext);
  if (!value) throw new Error("useOffline must be used inside an OfflineProvider");
  return value;
}
