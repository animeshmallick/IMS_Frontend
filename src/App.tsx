import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { lazy, type ComponentType } from "react";
import { ApiError } from "./lib/api";
import { SessionProvider, useSessionQuery } from "./lib/session";
import { OfflineProvider } from "./lib/offline";
import { SignIn } from "./pages/SignIn";
import { ErrorBoundary, pushToast, ToastProvider } from "./components/feedback";
import { Shell } from "./components/Shell";
import { RequirePermission } from "./components/RequirePermission";

/*
 * Screens are downloaded when they are opened, not when the app is.
 *
 * All thirty-nine were imported eagerly into a single bundle, so a cashier
 * opening the till pulled down the whole administration suite, every report and
 * the barcode generator before the first bill could be rung up — over the shop
 * broadband this system actually runs on. Charting made it worse: a library
 * three screens need was landing in the bundle all thirty-nine share.
 *
 * `lazy` gives each screen its own chunk and lets the bundler hoist what they
 * have in common, so the till downloads the till.
 *
 * The bindings keep their original names, so every route below reads exactly as
 * it did before.
 */
const page = <T extends Record<string, ComponentType<object>>>(
  loader: () => Promise<T>,
  name: keyof T & string,
) => lazy(async () => ({ default: (await loader())[name]! }));

const Dashboard = page(() => import("./pages/Dashboard"), "Dashboard");
const StockOnHand = page(() => import("./pages/stock/StockOnHand"), "StockOnHand");
const StockLedger = page(() => import("./pages/stock/StockLedger"), "StockLedger");
const SerialLookup = page(() => import("./pages/stock/SerialLookup"), "SerialLookup");
const BarcodeSheet = page(() => import("./pages/catalog/BarcodeSheet"), "BarcodeSheet");
const Labels = page(() => import("./pages/catalog/Labels"), "Labels");
const Units = page(() => import("./pages/admin/Units"), "Units");
const Products = page(() => import("./pages/catalog/Products"), "Products");
const ProductDetailPage = page(
  () => import("./pages/catalog/ProductDetail"),
  "ProductDetailPage",
);
const NewProduct = page(() => import("./pages/catalog/NewProduct"), "NewProduct");
const Categories = page(() => import("./pages/catalog/Categories"), "Categories");
const Suppliers = page(() => import("./pages/partners/Suppliers"), "Suppliers");
const Customers = page(() => import("./pages/partners/Customers"), "Customers");
const PurchaseOrders = page(() => import("./pages/purchasing/PurchaseOrders"), "PurchaseOrders");
const PurchaseOrderDetailPage = page(
  () => import("./pages/purchasing/PurchaseOrderDetail"),
  "PurchaseOrderDetailPage",
);
const NewPurchaseOrder = page(
  () => import("./pages/purchasing/NewPurchaseOrder"),
  "NewPurchaseOrder",
);
const GoodsReceipts = page(() => import("./pages/purchasing/GoodsReceipts"), "GoodsReceipts");
const GoodsReceiptDetailPage = page(
  () => import("./pages/purchasing/GoodsReceiptDetail"),
  "GoodsReceiptDetailPage",
);
const NewGoodsReceipt = page(
  () => import("./pages/purchasing/NewGoodsReceipt"),
  "NewGoodsReceipt",
);
const SupplierReturns = page(() => import("./pages/purchasing/SupplierReturns"), "SupplierReturns");
const Transfers = page(() => import("./pages/transfers/Transfers"), "Transfers");
const TransferDetailPage = page(
  () => import("./pages/transfers/TransferDetail"),
  "TransferDetailPage",
);
const NewTransfer = page(() => import("./pages/transfers/NewTransfer"), "NewTransfer");
const Adjustments = page(() => import("./pages/stock/Adjustments"), "Adjustments");
const NewAdjustment = page(() => import("./pages/stock/NewAdjustment"), "NewAdjustment");
const AdjustmentDetailPage = page(
  () => import("./pages/stock/AdjustmentDetail"),
  "AdjustmentDetailPage",
);
const StockCounts = page(() => import("./pages/stock/StockCounts"), "StockCounts");
const StockCountDetailPage = page(
  () => import("./pages/stock/StockCountDetail"),
  "StockCountDetailPage",
);
const Counter = page(() => import("./pages/counter/Counter"), "Counter");
const Bills = page(() => import("./pages/counter/Bills"), "Bills");
const BillDetailPage = page(() => import("./pages/counter/BillDetail"), "BillDetailPage");
const Shifts = page(() => import("./pages/counter/Shifts"), "Shifts");
const Reports = page(() => import("./pages/reports/Reports"), "Reports");
const Insights = page(() => import("./pages/insights/Insights"), "Insights");
const Replenishment = page(() => import("./pages/insights/Replenishment"), "Replenishment");
const SystemHealth = page(() => import("./pages/admin/SystemHealth"), "SystemHealth");
const Staff = page(() => import("./pages/admin/Staff"), "Staff");
const Roles = page(() => import("./pages/admin/Roles"), "Roles");
const LocationsAdmin = page(() => import("./pages/admin/Locations"), "LocationsAdmin");
const AuditTrail = page(() => import("./pages/admin/Audit"), "AuditTrail");

const queryClient = new QueryClient({
  /*
   * Every failed mutation says so, on every screen.
   *
   * Screens report their own failures with an <ErrorBanner>, which is the right
   * place for the detail — but it depends on each screen remembering, and on the
   * banner being IN VIEW. Inside a tall dialog it is not: the button is at the
   * bottom, the banner renders at the top, and scanning a barcode that is
   * already on another SKU looked exactly like nothing happening at all.
   *
   * This is the floor under that. The banners stay; this guarantees no failure
   * is silent, whatever screen it came from.
   */
  mutationCache: new MutationCache({
    onError: (error) => {
      // The server writes these to be read by the person who hit them —
      // "This barcode is already assigned to another product", not a status
      // code. Anything unrecognised still gets a sentence rather than nothing.
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Something went wrong.";

      pushToast(message, {
        tone: "error",
        // Only for the genuinely unexplained: a reference nobody can act on is
        // noise on a message that already says what to do.
        body:
          error instanceof ApiError && error.code === "INTERNAL_ERROR" && error.requestId
            ? `Reference: ${error.requestId}`
            : undefined,
      });
    },
  }),
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Never retry a rejection the user caused — a 403 will still be a 403,
        // and retrying an INSUFFICIENT_STOCK just hides the real answer.
        if (error instanceof ApiError && !error.isRetryable) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      // Mutations are never retried automatically: without an idempotency key a
      // retry can double-apply, and with one the caller decides when to reuse it.
      retry: false,
    },
  },
});

function Authenticated() {
  const session = useSessionQuery();

  if (session.isPending) return <p className="loading">Loading...</p>;

  if (session.isError) {
    const unauthenticated =
      session.error instanceof ApiError && session.error.code === "UNAUTHENTICATED";
    return unauthenticated ? <SignIn /> : <p role="alert">Could not load your account.</p>;
  }

  return (
    <SessionProvider session={session.data}>
      <OfflineProvider>
      <Routes>
        <Route path="/" element={<Shell />}>
          <Route index element={<Dashboard />} />

          {/* ------------------------------------------------------- counter */}
          <Route
            path="counter"
            element={
              <RequirePermission permission="sale:create">
                <Counter />
              </RequirePermission>
            }
          />
          <Route
            path="counter/orders"
            element={
              <RequirePermission permission="sale:read">
                <Bills />
              </RequirePermission>
            }
          />
          <Route
            path="counter/orders/:id"
            element={
              <RequirePermission permission="sale:read">
                <BillDetailPage />
              </RequirePermission>
            }
          />
          <Route
            path="counter/shifts"
            element={
              <RequirePermission anyOf={["shift:open", "shift:close", "shift:reconcile"]}>
                <Shifts />
              </RequirePermission>
            }
          />

          {/* ---------------------------------------------------- purchasing */}
          <Route
            path="purchase-orders"
            element={
              <RequirePermission permission="po:read">
                <PurchaseOrders />
              </RequirePermission>
            }
          />
          <Route
            path="purchase-orders/new"
            element={
              <RequirePermission permission="po:write">
                <NewPurchaseOrder />
              </RequirePermission>
            }
          />
          <Route
            path="purchase-orders/:id"
            element={
              <RequirePermission permission="po:read">
                <PurchaseOrderDetailPage />
              </RequirePermission>
            }
          />
          <Route
            path="goods-receipts"
            element={
              <RequirePermission permission="grn:read">
                <GoodsReceipts />
              </RequirePermission>
            }
          />
          <Route
            path="goods-receipts/new"
            element={
              <RequirePermission permission="grn:write">
                <NewGoodsReceipt />
              </RequirePermission>
            }
          />
          <Route
            path="goods-receipts/:id"
            element={
              <RequirePermission permission="grn:read">
                <GoodsReceiptDetailPage />
              </RequirePermission>
            }
          />
          <Route
            path="supplier-returns"
            element={
              <RequirePermission permission="purchase_return:read">
                <SupplierReturns />
              </RequirePermission>
            }
          />
          <Route
            path="suppliers"
            element={
              <RequirePermission permission="supplier:read">
                <Suppliers />
              </RequirePermission>
            }
          />

          {/* --------------------------------------------------------- stock */}
          <Route
            path="stock"
            element={
              <RequirePermission permission="stock:read">
                <StockOnHand />
              </RequirePermission>
            }
          />
          <Route
            path="stock/ledger"
            element={
              <RequirePermission permission="stock:read">
                <StockLedger />
              </RequirePermission>
            }
          />
          <Route
            path="serials"
            element={
              <RequirePermission permission="stock:read">
                <SerialLookup />
              </RequirePermission>
            }
          />
          <Route
            path="transfers"
            element={
              <RequirePermission permission="stock:read">
                <Transfers />
              </RequirePermission>
            }
          />
          <Route
            path="transfers/new"
            element={
              <RequirePermission permission="stock:transfer">
                <NewTransfer />
              </RequirePermission>
            }
          />
          <Route
            path="transfers/:id"
            element={
              <RequirePermission permission="stock:read">
                <TransferDetailPage />
              </RequirePermission>
            }
          />
          <Route
            path="adjustments"
            element={
              <RequirePermission anyOf={["stock:adjust", "stock:read"]}>
                <Adjustments />
              </RequirePermission>
            }
          />
          <Route
            path="adjustments/new"
            element={
              <RequirePermission permission="stock:adjust">
                <NewAdjustment />
              </RequirePermission>
            }
          />
          <Route
            path="adjustments/:id"
            element={
              <RequirePermission anyOf={["stock:adjust", "stock:read"]}>
                <AdjustmentDetailPage />
              </RequirePermission>
            }
          />
          <Route
            path="counts"
            element={
              <RequirePermission anyOf={["stock:count", "stock:read"]}>
                <StockCounts />
              </RequirePermission>
            }
          />
          <Route
            path="counts/:id"
            element={
              <RequirePermission anyOf={["stock:count", "stock:read"]}>
                <StockCountDetailPage />
              </RequirePermission>
            }
          />

          {/* ----------------------------------------------------- catalogue */}
          <Route
            path="products"
            element={
              <RequirePermission permission="catalog:read">
                <Products />
              </RequirePermission>
            }
          />
          <Route
            path="admin/units"
            element={
              <RequirePermission permission="catalog:read">
                <Units />
              </RequirePermission>
            }
          />
          <Route
            path="barcodes"
            element={
              <RequirePermission permission="catalog:read">
                <BarcodeSheet />
              </RequirePermission>
            }
          />
          <Route
            path="labels"
            element={
              <RequirePermission permission="catalog:read">
                <Labels />
              </RequirePermission>
            }
          />
          <Route
            path="products/new"
            element={
              <RequirePermission permission="catalog:write">
                <NewProduct />
              </RequirePermission>
            }
          />
          <Route
            path="products/:id"
            element={
              <RequirePermission permission="catalog:read">
                <ProductDetailPage />
              </RequirePermission>
            }
          />
          <Route
            path="categories"
            element={
              <RequirePermission permission="catalog:read">
                <Categories />
              </RequirePermission>
            }
          />
          <Route
            path="customers"
            element={
              <RequirePermission permission="customer:read">
                <Customers />
              </RequirePermission>
            }
          />

          {/* ------------------------------------------------------- reports */}
          <Route
            path="insights"
            element={
              <RequirePermission anyOf={["report:operational", "report:financial"]}>
                <Insights />
              </RequirePermission>
            }
          />
          <Route
            path="replenishment"
            element={
              <RequirePermission permission="report:operational">
                <Replenishment />
              </RequirePermission>
            }
          />
          <Route
            path="admin/health"
            element={
              <RequirePermission permission="settings:write">
                <SystemHealth />
              </RequirePermission>
            }
          />
          <Route
            path="reports"
            element={
              <RequirePermission anyOf={["report:operational", "report:financial"]}>
                <Reports />
              </RequirePermission>
            }
          />

          {/* --------------------------------------------------------- admin */}
          <Route
            path="admin/staff"
            element={
              <RequirePermission permission="user:read">
                <Staff />
              </RequirePermission>
            }
          />
          <Route
            path="admin/roles"
            element={
              <RequirePermission permission="user:read">
                <Roles />
              </RequirePermission>
            }
          />
          <Route
            path="admin/locations"
            element={
              <RequirePermission permission="location:read">
                <LocationsAdmin />
              </RequirePermission>
            }
          />
          <Route
            path="admin/audit"
            element={
              <RequirePermission permission="audit:read">
                <AuditTrail />
              </RequirePermission>
            }
          />

          <Route path="*" element={<p className="empty">That page does not exist.</p>} />
        </Route>
      </Routes>
      </OfflineProvider>
    </SessionProvider>
  );
}

export function App() {
  return (
    /*
     * ErrorBoundary outermost, so a crash anywhere below still renders a page
     * with a way out rather than the blank white screen React leaves when a
     * render throws and nothing catches it.
     */
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <BrowserRouter>
            <Authenticated />
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
