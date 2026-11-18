import { es } from '../i18n/es';
import type {
  CatalogItem,
  CatalogSupplier,
  ErpNextStatus,
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

export interface PurchaseOrderSyncResult {
  erpnextName: string;
  status: ErpNextStatus;
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
        lines: doc.lines.map((line) => ({ itemRef: line.itemRef, quantity: line.quantity })),
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

// Lightweight reachability probe reused from the catalog endpoint (no dedicated /health route
// exists in contracts/backend-api.md); a 2xx here proves the full app -> backend path works,
// which navigator.onLine alone cannot (research.md: "Detección de conectividad").
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
