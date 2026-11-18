import { db } from './schema';
import type { ErpNextStatus, LocalDocumentLine, LocalPurchaseDocument } from './types';

export interface OrderLineInput {
  itemRef: string;
  quantity: number;
  // Required for purchase orders (FR-017): without it ERPNext accepts the line at rate 0.
  unitPrice: number;
}

function toLines(inputs: OrderLineInput[]): LocalDocumentLine[] {
  return inputs.map((line) => ({
    itemRef: line.itemRef,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    warehouseRef: null,
    sourceOrderLineRef: null,
  }));
}

export function listLocalOrders(): Promise<LocalPurchaseDocument[]> {
  return db.localPurchaseDocuments.where('documentType').equals('purchase_order').toArray();
}

export function getLocalOrder(localId: string): Promise<LocalPurchaseDocument | undefined> {
  return db.localPurchaseDocuments.get(localId);
}

// idempotencyKey is generated exactly once here and never regenerated on edit or retry
// (FR-007/FR-008, data-model.md validation rules) — this is the only place a new key is made.
export async function createLocalOrder(
  supplierRef: string,
  lines: OrderLineInput[],
): Promise<LocalPurchaseDocument> {
  const now = new Date().toISOString();
  const document: LocalPurchaseDocument = {
    localId: crypto.randomUUID(),
    documentType: 'purchase_order',
    idempotencyKey: crypto.randomUUID(),
    syncStatus: 'pending',
    erpnextName: null,
    erpnextStatus: null,
    errorMessage: null,
    supplierRef,
    purchaseOrderRef: null,
    lines: toLines(lines),
    createdAt: now,
    updatedAt: now,
  };
  await db.localPurchaseDocuments.add(document);
  return document;
}

// Edits the local draft in place, preserving idempotencyKey/localId/erpnextName. A document
// that previously failed moves back to 'pending' on edit (data-model.md: "usuario corrige y
// reintenta"), so the corrected version is the one offered to the queue next.
export async function updateLocalOrder(
  localId: string,
  supplierRef: string,
  lines: OrderLineInput[],
): Promise<void> {
  const existing = await db.localPurchaseDocuments.get(localId);
  if (!existing) throw new Error(`Local order not found: ${localId}`);
  await db.localPurchaseDocuments.update(localId, {
    supplierRef,
    lines: toLines(lines),
    updatedAt: new Date().toISOString(),
    syncStatus: existing.syncStatus === 'failed' ? 'pending' : existing.syncStatus,
  });
}

// Discard only ever removes a *local* capture (FR-004); callers are responsible for the
// explicit confirmation step before calling this.
export async function discardLocalOrder(localId: string): Promise<void> {
  await db.localPurchaseDocuments.delete(localId);
}

// Applies a successful PUT /api/purchase-orders/{erpnextName} (Historia 3, FR-009): the folio
// never changes, only the lines and updatedAt; erpnextStatus stays 'draft' since editing an
// already-submitted/cancelled order is not offered by the UI.
export async function applySyncedOrderEdit(
  localId: string,
  lines: OrderLineInput[],
): Promise<void> {
  await db.localPurchaseDocuments.update(localId, {
    lines: toLines(lines),
    errorMessage: null,
    updatedAt: new Date().toISOString(),
  });
}

// Reflects the ERPNext status reported by submit/cancel (FR-011); ERPNext is the source of
// truth (Constitution Principle III), the local record is only updated after ERPNext confirms.
export async function setOrderErpnextStatus(
  localId: string,
  erpnextStatus: ErpNextStatus,
): Promise<void> {
  await db.localPurchaseDocuments.update(localId, {
    erpnextStatus,
    errorMessage: null,
    updatedAt: new Date().toISOString(),
  });
}

// Persists the comprehensible message ERPNext/the backend returned for a blocked action (e.g.
// a cancellation refused because of a linked receipt, FR-011), reusing the same field the sync
// queue uses for failed documents so OrderDetail only needs one error banner.
export async function setOrderErrorMessage(
  localId: string,
  errorMessage: string | null,
): Promise<void> {
  await db.localPurchaseDocuments.update(localId, { errorMessage });
}
