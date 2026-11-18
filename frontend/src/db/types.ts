// Local data model (data-model.md). ERPNext remains the source of truth for business state
// (Constitution Principle III); these types only describe the client-side cache.

export type DocumentType = 'purchase_order' | 'purchase_receipt';

// Transitions: pending -> syncing -> synced | failed; failed -> syncing (retry);
// pending -> removed (explicit discard, FR-004). See data-model.md for the full diagram.
export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export type ErpNextStatus = 'draft' | 'submitted' | 'cancelled';

export interface LocalDocumentLine {
  itemRef: string;
  quantity: number;
  // Only used by purchase_receipt lines; always null for purchase_order lines.
  warehouseRef: string | null;
  sourceOrderLineRef: string | null;
}

export interface LocalPurchaseDocument {
  localId: string;
  documentType: DocumentType;
  // Generated once on creation and never regenerated, even across edits/retries (FR-007).
  idempotencyKey: string;
  syncStatus: SyncStatus;
  erpnextName: string | null;
  erpnextStatus: ErpNextStatus | null;
  errorMessage: string | null;
  supplierRef: string | null;
  purchaseOrderRef: string | null;
  lines: LocalDocumentLine[];
  createdAt: string;
  updatedAt: string;
}

export interface CatalogSupplier {
  erpnextName: string;
  supplierName: string;
  fetchedAt: string;
}

export interface CatalogItem {
  erpnextName: string;
  itemName: string;
  stockUom: string;
  isStockItem: boolean;
  fetchedAt: string;
}
