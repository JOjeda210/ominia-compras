import Dexie, { type Table } from 'dexie';
import type { CatalogItem, CatalogSupplier, LocalPurchaseDocument } from './types';

// Single Dexie database for the whole app. localPurchaseDocuments doubles as the sync queue
// (research.md): any record with syncStatus 'pending' or 'failed' IS the pending work, so the
// document and its queue entry can never drift apart.
export class OmniaComprasDb extends Dexie {
  catalogSuppliers!: Table<CatalogSupplier, string>;
  catalogItems!: Table<CatalogItem, string>;
  localPurchaseDocuments!: Table<LocalPurchaseDocument, string>;

  constructor() {
    super('omnia-compras');
    this.version(1).stores({
      catalogSuppliers: 'erpnextName',
      catalogItems: 'erpnextName',
      // syncStatus and documentType are indexed so the queue processor can select pending
      // work without scanning every local document.
      localPurchaseDocuments: 'localId, idempotencyKey, syncStatus, documentType',
    });
  }
}

export const db = new OmniaComprasDb();
