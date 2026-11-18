import type { LocalPurchaseDocument } from '../../db/types';

export interface OrderBalanceLine {
  itemRef: string;
  pendingQuantity: number;
}

// Reconstructs the pending balance entirely from local Dexie data: ordered quantity per item
// minus every *synced* receipt's quantity for that item. Each receipt only reaches 'synced'
// after ERPNext confirmed it (returning this same tally in its own response), so this mirrors
// ERPNext's bookkeeping without depending on GET /api/purchase-orders/{erpnextName} -- that
// endpoint is documented in contracts/backend-api.md but not implemented by the backend yet.
export function computeOrderBalance(
  order: LocalPurchaseDocument,
  receipts: LocalPurchaseDocument[],
): OrderBalanceLine[] {
  const receivedByItem = new Map<string, number>();
  for (const receipt of receipts) {
    if (receipt.syncStatus !== 'synced') continue;
    for (const line of receipt.lines) {
      receivedByItem.set(line.itemRef, (receivedByItem.get(line.itemRef) ?? 0) + line.quantity);
    }
  }
  return order.lines.map((line) => ({
    itemRef: line.itemRef,
    pendingQuantity: line.quantity - (receivedByItem.get(line.itemRef) ?? 0),
  }));
}
