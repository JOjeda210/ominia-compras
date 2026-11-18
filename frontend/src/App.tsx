import { useEffect, useState } from 'react';
import { ConnectivityBanner } from './components/ConnectivityBanner';
import { useCatalogs } from './features/catalog/useCatalogs';
import type { OrderLineInput } from './db/ordersRepository';
import { OrderDetail } from './features/orders/OrderDetail';
import { OrderForm } from './features/orders/OrderForm';
import { OrderList } from './features/orders/OrderList';
import { useLocalOrder, useOrderActions } from './features/orders/useLocalOrders';
import { ReceiptPage } from './features/receipts/ReceiptPage';
import { es } from './i18n/es';
import { startSyncQueue } from './sync/syncQueue';

type View =
  | { type: 'list' }
  | { type: 'detail'; localId: string }
  | { type: 'create' }
  // Historia 1: editing a capture that only exists locally (pending/failed).
  | { type: 'editLocal'; localId: string }
  // Historia 3: editing a draft that already has an ERPNext folio (PUT, direct call).
  | { type: 'editSynced'; localId: string }
  // Historia 4/5: capturing a receipt against a submitted order.
  | { type: 'receipt'; localId: string };

// No router dependency: the app's navigation needs (list / create / edit / detail) are a
// simple finite set of screens, and state is never persisted in the URL because the source of
// truth is Dexie, not the current route.
export default function App() {
  const [view, setView] = useState<View>({ type: 'list' });
  const { suppliers, items, warehouses, downloadError } = useCatalogs();
  const { create, update, discard, editSynced } = useOrderActions();
  const editingOrder = useLocalOrder(
    view.type === 'editLocal' || view.type === 'editSynced' ? view.localId : undefined,
  );

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

  // Historia 3: the form's supplier field is locked for this mode, but onSubmit still receives
  // it for signature parity with handleCreate/handleUpdate -- it is simply ignored here since
  // PUT /api/purchase-orders/{erpnextName} never changes the supplier.
  async function handleUpdateSynced(
    localId: string,
    erpnextName: string,
    idempotencyKey: string,
    lines: OrderLineInput[],
  ): Promise<void> {
    await editSynced(localId, erpnextName, idempotencyKey, lines);
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
            mode="create"
            onSubmit={handleCreate}
            onCancel={() => setView({ type: 'list' })}
          />
        )}

        {view.type === 'editLocal' && editingOrder && (
          <OrderForm
            suppliers={suppliers}
            items={items}
            mode="editLocal"
            initialSupplierRef={editingOrder.supplierRef ?? undefined}
            initialLines={editingOrder.lines.map((line) => ({
              itemRef: line.itemRef,
              quantity: line.quantity,
              unitPrice: line.unitPrice ?? 0,
            }))}
            onSubmit={(supplierRef, lines) => handleUpdate(view.localId, supplierRef, lines)}
            onCancel={() => setView({ type: 'detail', localId: view.localId })}
          />
        )}

        {view.type === 'editSynced' && editingOrder && editingOrder.erpnextName && (
          <OrderForm
            suppliers={suppliers}
            items={items}
            mode="editSynced"
            initialSupplierRef={editingOrder.supplierRef ?? undefined}
            initialLines={editingOrder.lines.map((line) => ({
              itemRef: line.itemRef,
              quantity: line.quantity,
              unitPrice: line.unitPrice ?? 0,
            }))}
            onSubmit={(_supplierRef, lines) =>
              handleUpdateSynced(
                view.localId,
                // Non-null asserted by the guard above; kept narrow instead of threading an
                // optional type through handleUpdateSynced's signature.
                editingOrder.erpnextName as string,
                editingOrder.idempotencyKey,
                lines,
              )
            }
            onCancel={() => setView({ type: 'detail', localId: view.localId })}
          />
        )}

        {view.type === 'receipt' && (
          <ReceiptPage
            orderLocalId={view.localId}
            warehouses={warehouses}
            onBack={() => setView({ type: 'detail', localId: view.localId })}
          />
        )}

        {view.type === 'detail' && (
          <OrderDetail
            localId={view.localId}
            onEdit={() => setView({ type: 'editLocal', localId: view.localId })}
            onEditSynced={() => setView({ type: 'editSynced', localId: view.localId })}
            onReceive={() => setView({ type: 'receipt', localId: view.localId })}
            onDiscard={() => handleDiscard(view.localId)}
            onBack={() => setView({ type: 'list' })}
          />
        )}
      </main>
    </div>
  );
}
