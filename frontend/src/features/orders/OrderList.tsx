import { StatusBadge } from '../../components/StatusBadge';
import { es } from '../../i18n/es';
import { useLocalOrdersList } from './useLocalOrders';

interface OrderListProps {
  onSelect: (localId: string) => void;
  onCreate: () => void;
}

// Most recently edited order first, so the capture the buyer just finished (possibly still
// offline) is always the one visible at the top without scrolling.
export function OrderList({ onSelect, onCreate }: OrderListProps) {
  const orders = useLocalOrdersList();

  return (
    <section className="order-list-page">
      <header className="list-header">
        <h1>{es.orderList.title}</h1>
        <button type="button" data-testid="create-order-button" onClick={onCreate}>
          {es.orderList.createButton}
        </button>
      </header>

      {orders && orders.length === 0 && <p>{es.orderList.empty}</p>}

      {orders && orders.length > 0 && (
        <ul className="order-list" data-testid="order-list">
          {orders
            .slice()
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .map((order) => (
              <li key={order.localId}>
                <button
                  type="button"
                  className="order-list-item"
                  data-testid="order-list-item"
                  data-local-id={order.localId}
                  onClick={() => onSelect(order.localId)}
                >
                  <span className="order-folio" data-testid="order-folio">
                    {order.erpnextName ?? es.orderList.noFolioYet}
                  </span>
                  <span className="order-items">{es.orderList.itemCount(order.lines.length)}</span>
                  <StatusBadge syncStatus={order.syncStatus} erpnextStatus={order.erpnextStatus} />
                </button>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
