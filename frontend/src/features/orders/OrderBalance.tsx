import { es } from '../../i18n/es';
import type { LocalPurchaseDocument } from '../../db/types';
import { useReceiptsForOrder } from '../receipts/useReceipts';
import { computeOrderBalance } from './balanceMath';

interface OrderBalanceProps {
  order: LocalPurchaseDocument;
}

// Reactive via Dexie liveQuery (useReceiptsForOrder): re-renders by itself the moment a new
// receipt is marked 'synced', with no manual refresh needed (Historia 5: "saldo acumulado").
export function OrderBalance({ order }: OrderBalanceProps) {
  const receipts = useReceiptsForOrder(order.erpnextName);
  if (!receipts) return null;

  const balance = computeOrderBalance(order, receipts);

  return (
    <section data-testid="order-balance">
      <h2>{es.orderDetail.balanceTitle}</h2>
      <ul>
        {balance.map((line) => (
          <li key={line.itemRef} data-testid="order-balance-line">
            {es.orderDetail.balanceLine(line.itemRef, line.pendingQuantity)}
          </li>
        ))}
      </ul>
    </section>
  );
}
