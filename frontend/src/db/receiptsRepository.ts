import { db } from './schema';
import type { LocalDocumentLine, LocalPurchaseDocument } from './types';

export interface ReceiptLineInput {
  itemRef: string;
  quantity: number;
  warehouseRef: string;
  // erpnextName of the origin order line (data-model.md: required for purchase_receipt lines
  // so ERPNext can compute the pending balance, FR-013/FR-014).
  sourceOrderLineRef: string;
}

function toReceiptLines(inputs: ReceiptLineInput[]): LocalDocumentLine[] {
  return inputs.map((line) => ({
    itemRef: line.itemRef,
    quantity: line.quantity,
    unitPrice: null,
    warehouseRef: line.warehouseRef,
    sourceOrderLineRef: line.sourceOrderLineRef,
  }));
}

// Creates the local record for a receipt attempt before the network call is made (Historia 4,
// FR-007): the idempotencyKey is fixed here and reused on every retry of this same attempt, so
// a dropped response never results in a second Purchase Receipt in ERPNext.
export async function createLocalReceipt(
  purchaseOrderRef: string,
  lines: ReceiptLineInput[],
): Promise<LocalPurchaseDocument> {
  const now = new Date().toISOString();
  const document: LocalPurchaseDocument = {
    localId: crypto.randomUUID(),
    documentType: 'purchase_receipt',
    idempotencyKey: crypto.randomUUID(),
    syncStatus: 'pending',
    erpnextName: null,
    erpnextStatus: null,
    errorMessage: null,
    supplierRef: null,
    purchaseOrderRef,
    lines: toReceiptLines(lines),
    createdAt: now,
    updatedAt: now,
  };
  await db.localPurchaseDocuments.add(document);
  return document;
}

export function getLocalReceipt(localId: string): Promise<LocalPurchaseDocument | undefined> {
  return db.localPurchaseDocuments.get(localId);
}

// Lists every receipt already attempted against a given order (Historia 5: "existen
// exactamente dos recibos vinculados a la orden"), regardless of its sync outcome, so the user
// can see failed/pending attempts too, not only the successful ones.
export function listReceiptsForOrder(purchaseOrderRef: string): Promise<LocalPurchaseDocument[]> {
  return db.localPurchaseDocuments
    .where('documentType')
    .equals('purchase_receipt')
    .filter((doc) => doc.purchaseOrderRef === purchaseOrderRef)
    .toArray();
}

// Marks a receipt attempt as sent and confirmed by ERPNext, recording the folio it was
// assigned (FR-014); syncStatus 'synced' also retroactively covers a retry that recovered an
// already-created document instead of creating a new one.
export async function markReceiptSynced(localId: string, erpnextName: string): Promise<void> {
  await db.localPurchaseDocuments.update(localId, {
    syncStatus: 'synced',
    erpnextName,
    errorMessage: null,
    updatedAt: new Date().toISOString(),
  });
}

// Marks a real rejection from the backend/ERPNext (not a transient network failure) so the UI
// can show the translated reason and offer a retry with the same idempotencyKey.
export async function markReceiptFailed(localId: string, errorMessage: string): Promise<void> {
  await db.localPurchaseDocuments.update(localId, {
    syncStatus: 'failed',
    errorMessage,
    updatedAt: new Date().toISOString(),
  });
}
