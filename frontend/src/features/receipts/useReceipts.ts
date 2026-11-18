import { useLiveQuery } from 'dexie-react-hooks';
import { getLocalReceipt, listReceiptsForOrder } from '../../db/receiptsRepository';
import type { LocalPurchaseDocument } from '../../db/types';

// Reactive list of every receipt attempt (any syncStatus) against one order, used by
// OrderDetail to show "Recibos registrados" (Historia 5).
export function useReceiptsForOrder(purchaseOrderRef: string | null): LocalPurchaseDocument[] | undefined {
  return useLiveQuery(
    () => (purchaseOrderRef ? listReceiptsForOrder(purchaseOrderRef) : Promise.resolve([])),
    [purchaseOrderRef],
  );
}

// Same null/undefined/object convention as useLocalOrder: null while loading, undefined once
// confirmed missing, so ReceiptPage never flashes a "not found" state during the first read.
export function useLocalReceipt(localId: string | undefined): LocalPurchaseDocument | undefined | null {
  return useLiveQuery(
    () => (localId ? getLocalReceipt(localId) : Promise.resolve(undefined)),
    [localId],
    null,
  );
}
