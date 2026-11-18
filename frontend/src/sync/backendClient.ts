import { es } from '../i18n/es';
import type {
  CatalogItem,
  CatalogSupplier,
  CatalogWarehouse,
  ErpNextStatus,
  LocalDocumentLine,
  LocalPurchaseDocument,
} from '../db/types';

// The only way the frontend reaches ERPNext: every request goes through this backend, which
// holds the ERPNext credentials (Constitution Principle IV). Overridable for tests/deploys.
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8080';

export interface BackendErrorBody {
  errorCode: string;
  message: string;
  erpnextDetail?: string;
}

// Carries the backend's translated error shape (contracts/backend-api.md) so callers can
// branch on errorCode (e.g. ERPNEXT_UNREACHABLE) without re-parsing the response body.
export class BackendApiError extends Error {
  errorCode: string;
  erpnextDetail?: string;

  constructor(body: BackendErrorBody) {
    super(body.message);
    this.errorCode = body.errorCode;
    this.erpnextDetail = body.erpnextDetail;
  }
}

// Falls back to a generic translated message if the backend itself is unreachable, since in
// that case there is no JSON error body to parse at all.
async function toBackendApiError(response: Response): Promise<BackendApiError> {
  try {
    const body = (await response.json()) as BackendErrorBody;
    return new BackendApiError(body);
  } catch {
    return new BackendApiError({
      errorCode: 'ERPNEXT_UNREACHABLE',
      message: es.errors.erpnextUnreachable,
    });
  }
}

export async function fetchSupplierCatalog(): Promise<CatalogSupplier[]> {
  const response = await fetch(`${BACKEND_URL}/api/catalog/suppliers`);
  if (!response.ok) throw await toBackendApiError(response);
  const body = (await response.json()) as { suppliers: CatalogSupplier[] };
  return body.suppliers;
}

export async function fetchItemCatalog(): Promise<CatalogItem[]> {
  const response = await fetch(`${BACKEND_URL}/api/catalog/items`);
  if (!response.ok) throw await toBackendApiError(response);
  const body = (await response.json()) as { items: CatalogItem[] };
  return body.items;
}

// Beyond the documented contract: the backend added this so the receipt form can reference a
// real Warehouse name (spec.md Assumptions: exactly one Warehouse exists for this demo).
export async function fetchWarehouseCatalog(): Promise<CatalogWarehouse[]> {
  const response = await fetch(`${BACKEND_URL}/api/catalog/warehouses`);
  if (!response.ok) throw await toBackendApiError(response);
  const body = (await response.json()) as { warehouses: CatalogWarehouse[] };
  return body.warehouses;
}

export interface PurchaseOrderSyncResult {
  erpnextName: string;
  status: ErpNextStatus;
}

// Shared fetch wrapper: normalizes any network-level failure (backend down, DNS, timeout) to
// ERPNEXT_UNREACHABLE, and any non-2xx response to the backend's translated error body, so
// every caller (queue sync, direct user actions) sees the same two failure shapes.
async function sendJson(path: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
  } catch {
    throw new BackendApiError({
      errorCode: 'ERPNEXT_UNREACHABLE',
      message: es.errors.actionUnreachable,
    });
  }
  if (!response.ok) throw await toBackendApiError(response);
  return response;
}

function toOrderLineRequest(line: LocalDocumentLine) {
  return { itemRef: line.itemRef, quantity: line.quantity, unitPrice: line.unitPrice };
}

// Creates or recovers (by idempotencyKey) a draft Purchase Order. Any network-level failure
// (backend down, DNS, timeout) is normalized to ERPNEXT_UNREACHABLE so the queue treats it as
// "retry later" rather than a hard rejection (backend-api.md: "the frontend must treat the
// order as pending and retry later, not as a final failure").
export async function createOrRecoverPurchaseOrder(
  doc: LocalPurchaseDocument,
): Promise<PurchaseOrderSyncResult> {
  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}/api/purchase-orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: doc.idempotencyKey,
        supplierRef: doc.supplierRef,
        lines: doc.lines.map(toOrderLineRequest),
      }),
    });
  } catch {
    throw new BackendApiError({
      errorCode: 'ERPNEXT_UNREACHABLE',
      message: es.errors.erpnextUnreachable,
    });
  }
  if (!response.ok) throw await toBackendApiError(response);
  const body = (await response.json()) as { erpnextName: string; status: ErpNextStatus };
  return { erpnextName: body.erpnextName, status: body.status };
}

// Edits an already-synced draft in place (Historia 3 / FR-009): same ERPNext folio, PUT instead
// of POST, no queue involved -- this flow only runs while online, by direct user action.
export async function updatePurchaseOrder(
  erpnextName: string,
  idempotencyKey: string,
  lines: LocalDocumentLine[],
): Promise<PurchaseOrderSyncResult> {
  const response = await sendJson(`/api/purchase-orders/${encodeURIComponent(erpnextName)}`, {
    method: 'PUT',
    body: JSON.stringify({ idempotencyKey, lines: lines.map(toOrderLineRequest) }),
  });
  const body = (await response.json()) as { erpnextName: string; status: ErpNextStatus };
  return { erpnextName: body.erpnextName, status: body.status };
}

// Presents (Submit) a draft order (FR-010/FR-011): irreversible on the ERPNext side, always a
// direct call (never queued) since it only makes sense once the draft already has a folio.
export async function submitPurchaseOrder(erpnextName: string): Promise<PurchaseOrderSyncResult> {
  const response = await sendJson(
    `/api/purchase-orders/${encodeURIComponent(erpnextName)}/submit`,
    { method: 'POST' },
  );
  const body = (await response.json()) as { erpnextName: string; status: ErpNextStatus };
  return { erpnextName: body.erpnextName, status: body.status };
}

// Cancels a submitted order (FR-010/FR-011). ERPNext may reject this (e.g. a linked Purchase
// Receipt); callers must surface the thrown BackendApiError.message as-is (already translated).
export async function cancelPurchaseOrder(erpnextName: string): Promise<PurchaseOrderSyncResult> {
  const response = await sendJson(
    `/api/purchase-orders/${encodeURIComponent(erpnextName)}/cancel`,
    { method: 'POST' },
  );
  const body = (await response.json()) as { erpnextName: string; status: ErpNextStatus };
  return { erpnextName: body.erpnextName, status: body.status };
}

export interface PurchaseReceiptLineInput {
  itemRef: string;
  quantity: number;
  warehouseRef: string;
  sourceOrderLineRef: string;
}

export interface OrderBalanceLine {
  itemRef: string;
  pendingQuantity: number;
}

export interface PurchaseReceiptResult {
  erpnextName: string;
  purchaseOrderRef: string;
  orderBalance: OrderBalanceLine[];
}

// Creates or recovers (by idempotencyKey) a Purchase Receipt linked to its origin order
// (FR-012/FR-013). Always a direct call: Historia 4/5 only runs with connection, so there is no
// need to go through the background sync queue for this document type.
export async function createOrRecoverPurchaseReceipt(
  idempotencyKey: string,
  purchaseOrderRef: string,
  lines: PurchaseReceiptLineInput[],
): Promise<PurchaseReceiptResult> {
  const response = await sendJson('/api/purchase-receipts', {
    method: 'POST',
    body: JSON.stringify({ idempotencyKey, purchaseOrderRef, lines }),
  });
  return (await response.json()) as PurchaseReceiptResult;
}

// Lightweight reachability probe reused from the catalog endpoint (no dedicated /health route
// exists in contracts/backend-api.md); a 2xx here proves the full app -> backend path works,
// which navigator.onLine alone cannot (see research.md's connectivity-detection section).
export async function probeBackendReachable(timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${BACKEND_URL}/api/catalog/suppliers`, {
      method: 'GET',
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
