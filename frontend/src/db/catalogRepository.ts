import { fetchItemCatalog, fetchSupplierCatalog } from '../sync/backendClient';
import { db } from './schema';
import type { CatalogItem, CatalogSupplier } from './types';

// Catalogs are small, read-only, and have no local edits to preserve, so a full replace is
// simpler and safer than diffing individual records (unlike LocalPurchaseDocument, which must
// never be overwritten carelessly per the offline-first principle).
export async function refreshCatalogs(): Promise<void> {
  const fetchedAt = new Date().toISOString();
  const [suppliers, items] = await Promise.all([fetchSupplierCatalog(), fetchItemCatalog()]);
  await db.transaction('rw', db.catalogSuppliers, db.catalogItems, async () => {
    await db.catalogSuppliers.clear();
    await db.catalogItems.clear();
    await db.catalogSuppliers.bulkAdd(suppliers.map((supplier) => ({ ...supplier, fetchedAt })));
    await db.catalogItems.bulkAdd(items.map((item) => ({ ...item, fetchedAt })));
  });
}

export function listCachedSuppliers(): Promise<CatalogSupplier[]> {
  return db.catalogSuppliers.toArray();
}

export function listCachedItems(): Promise<CatalogItem[]> {
  return db.catalogItems.toArray();
}
