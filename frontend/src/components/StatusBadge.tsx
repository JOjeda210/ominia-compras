import type { ErpNextStatus, SyncStatus } from '../db/types';
import { es } from '../i18n/es';

interface StatusBadgeProps {
  syncStatus: SyncStatus;
  erpnextStatus: ErpNextStatus | null;
}

// "Sincronizada" is only a UI label for a document that already has an ERPNext folio
// (syncStatus === 'synced'); it is never stored as its own syncStatus value (spec
// Clarifications: no intermediate "sending" state exists in the data model).
export function StatusBadge({ syncStatus, erpnextStatus }: StatusBadgeProps) {
  if (syncStatus === 'synced' && erpnextStatus) {
    return (
      <span
        className={`status-badge status-${erpnextStatus}`}
        data-testid="order-status"
        data-sync-status={syncStatus}
        data-erpnext-status={erpnextStatus}
      >
        {es.syncStatus.synced} · {es.erpnextStatus[erpnextStatus]}
      </span>
    );
  }
  return (
    <span
      className={`status-badge status-${syncStatus}`}
      data-testid="order-status"
      data-sync-status={syncStatus}
    >
      {es.syncStatus[syncStatus]}
    </span>
  );
}
