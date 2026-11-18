import { useEffect, useState } from 'react';
import { ConnectivityBanner } from './components/ConnectivityBanner';
import { useCatalogs } from './features/catalog/useCatalogs';
import type { OrderLineInput } from './db/ordersRepository';
import { OrderDetail } from './features/orders/OrderDetail';
import { OrderForm } from './features/orders/OrderForm';
import { OrderList } from './features/orders/OrderList';
import { useLocalOrder, useOrderActions } from './features/orders/useLocalOrders';
import { es } from './i18n/es';
import { startSyncQueue } from './sync/syncQueue';

type View =
  | { type: 'list' }
  | { type: 'detail'; localId: string }
  | { type: 'create' }
  | { type: 'edit'; localId: string };

// No router dependency: the app's navigation needs (list / create / edit / detail) are a
// simple finite set of screens, and state is never persisted in the URL because the source of
// truth is Dexie, not the current route.
export default function App() {
  const [view, setView] = useState<View>({ type: 'list' });
  const { suppliers, items, downloadError } = useCatalogs();
  const { create, update, discard } = useOrderActions();
  const editingOrder = useLocalOrder(view.type === 'edit' ? view.localId : undefined);

  // Starts the connectivity-driven queue processor once for the app's lifetime (FR-005).
  useEffect(() => startSyncQueue(), []);

  async function handleCreate(supplierRef: string, lines: OrderLineInput[]): Promise<void> {
    const order = await create(supplierRef, lines);
    setView({ type: 'detail', localId: order.localId });
  }

  async function handleUpdate(
    localId: string,
    supplierRef: string,
    lines: OrderLineInput[],
  ): Promise<void> {
    await update(localId, supplierRef, lines);
    setView({ type: 'detail', localId });
  }

  async function handleDiscard(localId: string): Promise<void> {
    await discard(localId);
    setView({ type: 'list' });
  }

  return (
    <div className="app">
      <ConnectivityBanner />
      <header className="app-header">
        <h1>{es.app.title}</h1>
        <p>{es.app.subtitle}</p>
      </header>
      {downloadError && (
        // A failed catalog refresh never clears what Dexie already had cached; this only
        // warns the user that today's copy may be stale (offline-first: never block on it).
        <p className="warning" role="alert" data-testid="catalog-download-warning">
          {es.catalog.downloadError}
        </p>
      )}
      <main>
        {view.type === 'list' && (
          <OrderList
            onSelect={(localId) => setView({ type: 'detail', localId })}
            onCreate={() => setView({ type: 'create' })}
          />
        )}

        {view.type === 'create' && (
          <OrderForm
            suppliers={suppliers}
            items={items}
            isEdit={false}
            onSubmit={handleCreate}
            onCancel={() => setView({ type: 'list' })}
          />
        )}

        {view.type === 'edit' && editingOrder && (
          <OrderForm
            suppliers={suppliers}
            items={items}
            isEdit
            initialSupplierRef={editingOrder.supplierRef ?? undefined}
            initialLines={editingOrder.lines.map((line) => ({
              itemRef: line.itemRef,
              quantity: line.quantity,
            }))}
            onSubmit={(supplierRef, lines) => handleUpdate(view.localId, supplierRef, lines)}
            onCancel={() => setView({ type: 'detail', localId: view.localId })}
          />
        )}

        {view.type === 'detail' && (
          <OrderDetail
            localId={view.localId}
            onEdit={() => setView({ type: 'edit', localId: view.localId })}
            onDiscard={() => handleDiscard(view.localId)}
            onBack={() => setView({ type: 'list' })}
          />
        )}
      </main>
    </div>
  );
}
