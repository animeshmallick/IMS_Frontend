import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ApiError } from "./lib/api";
import { SessionProvider, useSessionQuery } from "./lib/session";
import { OfflineProvider } from "./lib/offline";
import { SignIn } from "./pages/SignIn";
import { ErrorBoundary, ToastProvider } from "./components/feedback";
import { Shell } from "./components/Shell";
import { Dashboard } from "./pages/Dashboard";
import { StockOnHand } from "./pages/stock/StockOnHand";
import { StockLedger } from "./pages/stock/StockLedger";
import { SerialLookup } from "./pages/stock/SerialLookup";
import { Labels } from "./pages/catalog/Labels";
import { Units } from "./pages/admin/Units";
import { Products } from "./pages/catalog/Products";
import { ProductDetailPage } from "./pages/catalog/ProductDetail";
import { NewProduct } from "./pages/catalog/NewProduct";
import { Categories } from "./pages/catalog/Categories";
import { Suppliers } from "./pages/partners/Suppliers";
import { Customers } from "./pages/partners/Customers";
import { PurchaseOrders } from "./pages/purchasing/PurchaseOrders";
import { PurchaseOrderDetailPage } from "./pages/purchasing/PurchaseOrderDetail";
import { NewPurchaseOrder } from "./pages/purchasing/NewPurchaseOrder";
import { GoodsReceipts } from "./pages/purchasing/GoodsReceipts";
import { GoodsReceiptDetailPage } from "./pages/purchasing/GoodsReceiptDetail";
import { NewGoodsReceipt } from "./pages/purchasing/NewGoodsReceipt";
import { SupplierReturns } from "./pages/purchasing/SupplierReturns";
import { Transfers } from "./pages/transfers/Transfers";
import { TransferDetailPage } from "./pages/transfers/TransferDetail";
import { NewTransfer } from "./pages/transfers/NewTransfer";
import { Adjustments } from "./pages/stock/Adjustments";
import { NewAdjustment } from "./pages/stock/NewAdjustment";
import { AdjustmentDetailPage } from "./pages/stock/AdjustmentDetail";
import { StockCounts } from "./pages/stock/StockCounts";
import { StockCountDetailPage } from "./pages/stock/StockCountDetail";
import { Counter } from "./pages/counter/Counter";
import { Bills } from "./pages/counter/Bills";
import { BillDetailPage } from "./pages/counter/BillDetail";
import { Shifts } from "./pages/counter/Shifts";
import { Reports } from "./pages/reports/Reports";
import { Insights } from "./pages/insights/Insights";
import { Replenishment } from "./pages/insights/Replenishment";
import { SystemHealth } from "./pages/admin/SystemHealth";
import { Staff } from "./pages/admin/Staff";
import { Roles } from "./pages/admin/Roles";
import { LocationsAdmin } from "./pages/admin/Locations";
import { AuditTrail } from "./pages/admin/Audit";
import { RequirePermission } from "./components/RequirePermission";

const queryClient = new QueryClient({
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
