import { fetchItemCatalog, fetchSupplierCatalog, fetchWarehouseCatalog } from '../sync/backendClient';
import { db } from './schema';
import type { CatalogItem, CatalogSupplier, CatalogWarehouse } from './types';

// Catalogs are small, read-only, and have no local edits to preserve, so a full replace is
// simpler and safer than diffing individual records (unlike LocalPurchaseDocument, which must
// never be overwritten carelessly per the offline-first principle).
//
// Suppliers/Item are required for Historia 1 (FR-001) and must throw on failure so the caller
// can warn the user; Warehouse is an extra catalog beyond the documented contract (added by the
// backend for the receipt flow) and its own failure (e.g. a missing ERPNext role permission)
// must never block the supplier/item download that offline capture depends on.
export async function refreshCatalogs(): Promise<void> {
  const fetchedAt = new Date().toISOString();
  const [suppliers, items] = await Promise.all([fetchSupplierCatalog(), fetchItemCatalog()]);
  await db.transaction('rw', [db.catalogSuppliers, db.catalogItems], async () => {
    await db.catalogSuppliers.clear();
    await db.catalogItems.clear();
    await db.catalogSuppliers.bulkAdd(suppliers.map((supplier) => ({ ...supplier, fetchedAt })));
    await db.catalogItems.bulkAdd(items.map((item) => ({ ...item, fetchedAt })));
  });

  try {
    const warehouses = await fetchWarehouseCatalog();
    await db.transaction('rw', db.catalogWarehouses, async () => {
      await db.catalogWarehouses.clear();
      await db.catalogWarehouses.bulkAdd(warehouses.map((warehouse) => ({ ...warehouse, fetchedAt })));
    });
  } catch {
    // Swallowed on purpose: the receipt flow degrades to an empty warehouse list (its own
    // "select a warehouse" placeholder) rather than taking down catalog refresh entirely.
  }
}

export function listCachedSuppliers(): Promise<CatalogSupplier[]> {
  return db.catalogSuppliers.toArray();
}

export function listCachedItems(): Promise<CatalogItem[]> {
  return db.catalogItems.toArray();
}

export function listCachedWarehouses(): Promise<CatalogWarehouse[]> {
  return db.catalogWarehouses.toArray();
}
