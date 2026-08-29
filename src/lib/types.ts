/**
 * API response types, mirrored from what the backend actually returns.
 *
 * Money and quantity fields are `string` throughout, and deliberately so: they
 * are Postgres `numeric` on the other side. Typing them as `number` here would
 * invite arithmetic that silently loses precision, so they stay strings and the
 * helpers in `format.ts` do the display work.
 */

export interface Paged<T> {
  data: T[];
  meta: { total: number; limit: number; offset: number };
}

export type LocationType =
  | "warehouse"
  | "store"
  | "transit"
  | "supplier"
  | "customer"
  | "scrap"
  | "variance";

export interface Location {
  id: string;
  code: string;
  name: string;
  type: LocationType;
  isPhysical: boolean;
  isSystem: boolean;
  allowsSales: boolean;
  allowsReceipts: boolean;
  isActive: boolean;
  address: Record<string, string> | null;
  phone: string | null;
  sortOrder: number;
}

export interface Uom {
  id: string;
  code: string;
  name: string;
  dimension: "count" | "mass" | "volume" | "length" | "area";
  factorToBase: string;
  isDimensionBase: boolean;
}

export interface Category {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  path: string;
  depth: number;
  sortOrder: number;
  isActive: boolean;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  manufacturer?: string | null;
}

export type ProductType =
  | "standard"
  | "pharma"
  | "food"
  | "apparel"
  | "hardware"
  | "electronics";

export interface ProductListItem {
  id: string;
  code: string;
  name: string;
  categoryPath: string;
  brandName: string | null;
  productType: ProductType;
  stockUomCode: string;
  status: "draft" | "active" | "discontinued";
  variantCount: number;
}

export interface ProductVariantDetail {
  id: string;
  sku: string;
  variantName: string | null;
  shelfLifeDays: number | null;
  reorderPoint: string | null;
  reorderQty: string | null;
  imageUrl: string | null;
  status: string;
  currentPrice: string | null;
  mrp: string | null;
  barcodes?: { id: string; barcode: string; type: string; packQty: string; isPrimary: boolean }[];
  uomConversions?: { uomId: string; uomCode: string; factorToStockUom: string; purpose: string }[];
}

export interface ProductDetail {
  id: string;
  code: string;
  name: string;
  slug: string;
  description: string | null;
  categoryId: string;
  categoryPath: string;
  brandId: string | null;
  brandName: string | null;
  productType: ProductType;
  stockUomId: string;
  stockUomCode: string;
  isDivisible: boolean;
  trackExpiry: boolean;
  trackSerial: boolean;
  specs: Record<string, string | number | boolean> | null;
  status: "draft" | "active" | "discontinued";
  createdAt: string;
  variants: ProductVariantDetail[];
}

export interface VariantSearchResult {
  variantId: string;
  sku: string;
  productName: string;
  variantName: string | null;
  stockUomCode: string;
  isDivisible: boolean;
  trackExpiry: boolean;
  price: string | null;
  mrp: string | null;
  /** True when the term matched a barcode exactly — a scan, not a search. */
  exactBarcode: boolean;
}

/* --------------------------------------------------------------------- stock */

export interface StockBalance {
  variantId: string;
  sku: string;
  productName: string;
  variantName: string | null;
  categoryPath: string;
  brandName: string | null;
  stockUomCode: string;
  locationId: string;
  locationName: string;
  onHand: string;
  reserved: string;
  available: string;
  batchCount: number;
  stockValue: string;
  earliestExpiry: string | null;
  reorderPoint: string | null;
}

export interface LedgerEntry {
  id: number;
  movementGroupId: string;
  occurredAt: string;
  variantId: string;
  sku: string;
  productName: string;
  locationId: string;
  locationName: string;
  locationIsPhysical: boolean;
  batchId: string;
  batchCode: string;
  qtyDelta: string;
  unitCost: string;
  balanceAfter: string;
  movementType: string;
  documentType: string | null;
  documentId: string | null;
  note: string | null;
  performedBy: string;
}

export interface ExpiringBatch {
  variantId: string;
  sku: string;
  productName: string;
  locationId: string;
  locationName: string;
  batchId: string;
  batchCode: string;
  expiresOn: string;
  onHand: string;
  unitCost: string;
  valueAtRisk: string;
  daysToExpiry: number;
  bucket: string;
}

export interface ReorderRow {
  variantId: string;
  sku: string;
  productName: string;
  locationId: string;
  onHand: string;
  reorderPoint: string;
  reorderQty: string;
  suggestedQty: string;
  preferredSupplierId?: string | null;
  preferredSupplierName?: string | null;
}

export interface Valuation {
  byLocation: {
    locationId: string;
    locationName: string;
    categoryPath: string;
    skuCount: number;
    batchCount: number;
    totalUnits: string;
    totalValue: string;
  }[];
  inTransitValue: string;
}

/* ---------------------------------------------------------------- purchasing */

export type PoStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "ordered"
  | "partially_received"
  | "received"
  | "closed"
  | "cancelled";

export interface PurchaseOrderListItem {
  id: string;
  poNumber: string;
  status: PoStatus;
  supplierName: string;
  destinationName: string;
  expectedDate: string | null;
  total: string;
  createdAt: string;
}

export interface PurchaseOrderLine {
  id: string;
  lineNo: string;
  variantId: string;
  sku: string;
  variantName: string | null;
  orderUomId: string;
  orderUomCode: string;
  orderQty: string;
  uomFactor: string;
  orderQtyBase: string;
  receivedQtyBase: string;
  unitCost: string;
  lineSubtotal: string;
  isClosed: boolean;
  notes: string | null;
  /** Carried from the product so receiving knows whether to demand an expiry. */
  trackExpiry: boolean;
  trackSerial: boolean;
  isDivisible: boolean;
}

export interface PurchaseOrderDetail {
  id: string;
  poNumber: string;
  status: PoStatus;
  supplierId: string;
  supplierName: string;
  destinationLocationId: string;
  destinationName: string;
  expectedDate: string | null;
  supplierReference: string | null;
  subtotal: string;
  otherCharges: string;
  total: string;
  overReceiptTolerance: string;
  notes: string | null;
  createdBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  orderedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  lines: PurchaseOrderLine[];
  receipts: {
    id: string;
    grnNumber: string;
    status: string;
    receivedAt: string;
    supplierInvoiceNo: string | null;
  }[];
}

export interface GoodsReceiptListItem {
  id: string;
  grnNumber: string;
  status: "draft" | "posted" | "cancelled";
  poNumber: string;
  locationName: string;
  supplierInvoiceNo: string | null;
  receivedAt: string;
}

export interface GoodsReceiptLine {
  id: string;
  purchaseOrderLineId: string | null;
  variantId: string;
  sku: string;
  variantName: string | null;
  receiptUomCode: string;
  receiptQty: string;
  receiptQtyBase: string;
  rejectedQtyBase: string;
  rejectionReason: string | null;
  unitCost: string;
  landedUnitCost: string;
  batchId: string | null;
  batchCode: string | null;
  supplierBatchNo: string | null;
  manufacturedOn: string | null;
  expiresOn: string | null;
  notes: string | null;
}

export interface GoodsReceiptDetail {
  id: string;
  grnNumber: string;
  status: "draft" | "posted" | "cancelled";
  purchaseOrderId: string;
  poNumber: string;
  locationId: string;
  locationName: string;
  supplierInvoiceNo: string | null;
  supplierInvoiceDate: string | null;
  deliveryNoteNo: string | null;
  freightCharges: string;
  receivedAt: string;
  receivedBy: string;
  postedAt: string | null;
  notes: string | null;
  lines: GoodsReceiptLine[];
}

/* ----------------------------------------------------------------- transfers */

export type TransferStatus =
  | "draft"
  | "dispatched"
  | "partially_received"
  | "received"
  | "closed"
  | "cancelled";

export interface TransferListItem {
  id: string;
  transferNumber: string;
  status: TransferStatus;
  fromLocationId: string;
  fromName: string;
  toLocationId: string;
  toName: string;
  expectedAt: string | null;
  dispatchedAt: string | null;
  createdAt: string;
}

export interface TransferLine {
  id: string;
  variantId: string;
  sku: string;
  variantName: string | null;
  batchId: string | null;
  batchCode: string | null;
  expiresOn: string | null;
  unitCost: string;
  requestedQty: string;
  dispatchedQty: string;
  receivedQty: string;
  shortageQty: string;
  shortageReason: string | null;
  notes: string | null;
}

export interface TransferDetail extends TransferListItem {
  carrierReference: string | null;
  requestedBy: string;
  dispatchedBy: string | null;
  receivedBy: string | null;
  receivedAt: string | null;
  notes: string | null;
  lines: TransferLine[];
}

export interface InTransitRow {
  transferId: string;
  transferNumber: string;
  dispatchedAt: string;
  expectedAt: string | null;
  fromLocationId: string;
  toLocationId: string;
  variantId: string;
  sku: string;
  batchCode: string;
  expiresOn: string | null;
  outstandingQty: string;
}

/* --------------------------------------------------------------- counter */

export interface SaleAllocation {
  salesOrderLineId: string;
  batchId: string;
  batchCode: string;
  expiresOn: string | null;
  qtyBase: string;
  unitCost: string;
  wasManual: boolean;
}

export interface SaleLine {
  id: string;
  variantId: string;
  sku: string;
  productName: string;
  variantName: string | null;
  saleUomCode: string;
  saleQty: string;
  qtyBase: string;
  unitPrice: string;
  discountAmount: string;
  lineTotal: string;
  lineCost: string;
  returnedQtyBase: string;
  allocations: SaleAllocation[];
}

export interface SalePayment {
  id: string;
  method: PaymentMethod;
  amount: string;
  reference: string | null;
  tenderedAmount: string | null;
  changeGiven: string | null;
  receivedAt: string;
}

export type PaymentMethod = "cash" | "card" | "upi" | "wallet" | "store_credit" | "credit";

export interface SalesOrder {
  id: string;
  orderNumber: string | null;
  status: "cart" | "placed" | "cancelled" | "refunded";
  locationId: string;
  locationName: string;
  shiftId: string | null;
  customerId: string | null;
  customerName: string | null;
  subtotal: string;
  discountAmount: string;
  roundingAdjustment: string;
  total: string;
  totalCost: string;
  prescriptionReference: string | null;
  placedAt: string | null;
  createdBy: string;
  createdAt: string;
  lines: SaleLine[];
  payments: SalePayment[];
}

export interface SalesOrderListItem {
  id: string;
  orderNumber: string;
  total: string;
  totalCost: string;
  placedAt: string;
  customerName: string | null;
}

export interface ReturnableLine {
  salesOrderLineId: string;
  sku: string;
  soldQtyBase: string;
  returnedQtyBase: string;
  unitPrice: string;
  lineTotal: string;
  batchId: string;
  batchCode: string;
  expiresOn: string | null;
  allocatedQtyBase: string;
  unitCost: string;
  returnableQtyBase: string;
}

export interface Shift {
  id: string;
  shiftNumber: string;
  locationId: string;
  counterCode: string | null;
  status: "open" | "closed" | "reconciled";
  openingFloat: string;
  expectedCash: string | null;
  countedCash: string | null;
  cashVariance: string | null;
  varianceReason: string | null;
  openedBy: string;
  openedAt: string;
  closedBy: string | null;
  closedAt: string | null;
  reconciledBy: string | null;
  reconciledAt: string | null;
}

/* ---------------------------------------------------------------- partners */

export interface Supplier {
  id: string;
  code: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: Record<string, string> | null;
  leadTimeDays: number;
  paymentTerms: string | null;
  minOrderValue: string | null;
  isActive: boolean;
  notes: string | null;
}

export interface Customer {
  id: string;
  code: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  creditLimit: string | null;
  isActive: boolean;
  notes: string | null;
}

/* ------------------------------------------------------ adjustments & counts */

export type AdjustmentReason =
  | "damaged"
  | "lost"
  | "expired"
  | "theft"
  | "found"
  | "correction"
  | "sample"
  | "internal_use";

export interface AdjustmentListItem {
  id: string;
  adjustmentNumber: string;
  status: "draft" | "pending_approval" | "approved" | "posted" | "rejected" | "cancelled";
  locationId: string;
  locationName: string;
  reason: AdjustmentReason;
  lineCount?: number;
  totalValue?: string;
  createdAt: string;
}

export interface StockCountListItem {
  id: string;
  countNumber: string;
  status: "draft" | "counting" | "review" | "posted" | "cancelled";
  locationId: string;
  locationName: string;
  scope: string | null;
  createdAt: string;
}

/* ----------------------------------------------------------------- admin */

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  employeeCode: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  roles: { id: string; code: string; name: string }[];
  locations: { id: string; code: string; name: string; isPrimary: boolean }[];
}

export interface Role {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  userCount: number;
}

export interface PermissionGroup {
  module: string;
  permissions: { code: string; description: string }[];
}

export interface AuditEntry {
  id: number;
  action: string;
  entityType: string;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  occurredAt: string;
  requestId: string | null;
  ipAddress: string | null;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  locationId: string | null;
  locationName: string | null;
}

/* --------------------------------------------------------------- reports */

export interface DashboardTotals {
  today: { orders: number; revenue: string; margin: string };
  monthToDate: { orders: number; revenue: string; margin: string };
}

export interface SalesSummaryRow {
  day: string;
  orders: number;
  revenue: string;
  discount: string;
  cost: string;
  margin: string;
  marginPercent: string;
}

export interface TopProductRow {
  variantId: string;
  sku: string;
  name: string;
  qtySold: string;
  revenue: string;
  cost?: string;
  margin?: string;
}
