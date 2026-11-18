import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback } from 'react';
import {
  createLocalOrder,
  discardLocalOrder,
  getLocalOrder,
  listLocalOrders,
  updateLocalOrder,
  type OrderLineInput,
} from '../../db/ordersRepository';
import type { LocalPurchaseDocument } from '../../db/types';
import { triggerImmediateSync } from '../../sync/syncQueue';

// Reactive list driven by Dexie's liveQuery: it re-renders by itself whenever the sync queue
// updates a record (syncStatus/erpnextName) in the background, with no manual refresh/polling
// wired into the component tree.
export function useLocalOrdersList(): LocalPurchaseDocument[] | undefined {
  return useLiveQuery(() => listLocalOrders(), []);
}

// null = still loading, undefined = confirmed not found, object = found. Distinguishing these
// (instead of collapsing "loading" and "not found" into the same falsy value) avoids a UI flash
// of "this order no longer exists" while the first Dexie read is still in flight.
export function useLocalOrder(
  localId: string | undefined,
): LocalPurchaseDocument | undefined | null {
  return useLiveQuery(
    () => (localId ? getLocalOrder(localId) : Promise.resolve(undefined)),
    [localId],
    null,
  );
}

export interface OrderActions {
  create: (supplierRef: string, lines: OrderLineInput[]) => Promise<LocalPurchaseDocument>;
  update: (localId: string, supplierRef: string, lines: OrderLineInput[]) => Promise<void>;
  discard: (localId: string) => Promise<void>;
}

// Wraps the repository writes with an immediate sync nudge: if the app happens to be online
// already, the new/edited order does not have to wait for the queue's next poll tick.
export function useOrderActions(): OrderActions {
  const create = useCallback(async (supplierRef: string, lines: OrderLineInput[]) => {
    const order = await createLocalOrder(supplierRef, lines);
    triggerImmediateSync();
    return order;
  }, []);

  const update = useCallback(
    async (localId: string, supplierRef: string, lines: OrderLineInput[]) => {
      await updateLocalOrder(localId, supplierRef, lines);
      triggerImmediateSync();
    },
    [],
  );

  const discard = useCallback(async (localId: string) => {
    await discardLocalOrder(localId);
  }, []);

  return { create, update, discard };
}
