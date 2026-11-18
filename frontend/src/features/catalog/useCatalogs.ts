import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { listCachedItems, listCachedSuppliers, refreshCatalogs } from '../../db/catalogRepository';
import type { CatalogItem, CatalogSupplier } from '../../db/types';

export interface UseCatalogsResult {
  suppliers: CatalogSupplier[];
  items: CatalogItem[];
  isDownloading: boolean;
  downloadError: string | null;
}

// Reads straight from Dexie (reactive via useLiveQuery) so the UI always has an answer even
// offline, and separately attempts one background refresh from the backend on mount. A failed
// refresh never clears what was already cached (FR-001: capture must work from catalogs
// "already downloaded"), it only surfaces a translated warning.
export function useCatalogs(): UseCatalogsResult {
  const suppliers = useLiveQuery(() => listCachedSuppliers(), [], []);
  const items = useLiveQuery(() => listCachedItems(), [], []);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsDownloading(true);
      try {
        await refreshCatalogs();
        if (!cancelled) setDownloadError(null);
      } catch (error) {
        if (!cancelled) setDownloadError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) setIsDownloading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { suppliers: suppliers ?? [], items: items ?? [], isDownloading, downloadError };
}
