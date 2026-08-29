/**
 * Permission codes, mirrored from the backend catalogue
 * (`backend/src/shared/permissions.ts`).
 *
 * Kept as a plain union rather than imported, since the projects are separate
 * repos. The backend is the authority — this list only drives what the UI
 * offers. Every check is enforced again server-side, so a stale copy here can
 * show a button that then fails, but can never grant access.
 */
export type Permission =
  | "catalog:read" | "catalog:write" | "catalog:archive"
  | "price:read" | "price:write"
  | "supplier:read" | "supplier:write"
  | "customer:read" | "customer:write"
  | "po:read" | "po:write" | "po:submit" | "po:approve" | "po:place" | "po:cancel" | "po:close"
  | "grn:read" | "grn:write" | "grn:post" | "grn:cancel"
  | "purchase_return:read" | "purchase_return:write"
  | "purchase_return:approve" | "purchase_return:credit"
  | "stock:read" | "stock:transfer" | "stock:receive_transfer"
  | "stock:adjust" | "stock:adjust_approve" | "stock:count" | "stock:count_approve"
  | "shift:open" | "shift:close" | "shift:reconcile"
  | "sale:create" | "sale:read" | "sale:discount" | "sale:override_batch"
  | "sale:return" | "sale:return_approve"
  | "report:operational" | "report:financial"
  | "user:read" | "user:write" | "user:assign_role"
  | "location:read" | "location:write"
  | "audit:read" | "alert:resolve" | "settings:write";
