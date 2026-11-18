import { useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { StatusBadge } from '../../components/StatusBadge';
import { es } from '../../i18n/es';
import { useLocalOrder } from './useLocalOrders';

interface OrderDetailProps {
  localId: string;
  onEdit: () => void;
  onDiscard: () => Promise<void>;
  onBack: () => void;
}

export function OrderDetail({ localId, onEdit, onDiscard, onBack }: OrderDetailProps) {
  const order = useLocalOrder(localId);
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false);

  if (order === null) return null;
  if (order === undefined) return <p>{es.orderDetail.notFound}</p>;

  // Editing/discarding here only ever applies to a local-only capture (Historia 1 scope);
  // once a document has an ERPNext folio, editing/cancelling a synced order is Historia 3
  // (not implemented in this sprint), so those actions are hidden rather than attempted.
  const canModify = order.syncStatus === 'pending' || order.syncStatus === 'failed';

  async function handleConfirmDiscard(): Promise<void> {
    setIsConfirmingDiscard(false);
    await onDiscard();
  }

  return (
    <section className="order-detail" data-testid="order-detail">
      <button type="button" data-testid="back-button" onClick={onBack}>
        {es.orderDetail.backButton}
      </button>

      <h1>{es.orderDetail.title}</h1>
      <StatusBadge syncStatus={order.syncStatus} erpnextStatus={order.erpnextStatus} />

      <dl>
        <dt>{es.orderDetail.supplierLabel}</dt>
        <dd data-testid="order-supplier">{order.supplierRef}</dd>

        <dt>{es.orderDetail.folioLabel}</dt>
        <dd data-testid="order-folio-detail">{order.erpnextName ?? es.orderList.noFolioYet}</dd>

        <dt>{es.orderDetail.createdAtLabel}</dt>
        <dd>{new Date(order.createdAt).toLocaleString('es-MX')}</dd>

        <dt>{es.orderDetail.updatedAtLabel}</dt>
        <dd>{new Date(order.updatedAt).toLocaleString('es-MX')}</dd>
      </dl>

      {order.errorMessage && (
        <p className="error" role="alert" data-testid="order-error-message">
          <strong>{es.orderDetail.errorLabel}:</strong> {order.errorMessage}
        </p>
      )}

      <h2>{es.orderForm.itemsTitle}</h2>
      <ul data-testid="order-detail-lines">
        {order.lines.map((line, index) => (
          <li key={`${line.itemRef}-${index}`} data-testid="order-detail-line">
            {line.itemRef} — {es.orderForm.quantityLabel}:{' '}
            <span data-testid="order-detail-quantity">{line.quantity}</span>
          </li>
        ))}
      </ul>

      <div className="order-detail-actions">
        {canModify && (
          <button type="button" data-testid="edit-order-button" onClick={onEdit}>
            {es.orderDetail.editButton}
          </button>
        )}
        {canModify && (
          <button
            type="button"
            className="danger"
            data-testid="discard-order-button"
            onClick={() => setIsConfirmingDiscard(true)}
          >
            {es.orderDetail.discardButton}
          </button>
        )}
      </div>

      {isConfirmingDiscard && (
        <ConfirmDialog
          title={es.confirmDiscard.title}
          message={es.confirmDiscard.message}
          confirmLabel={es.confirmDiscard.confirmButton}
          cancelLabel={es.confirmDiscard.cancelButton}
          onConfirm={() => void handleConfirmDiscard()}
          onCancel={() => setIsConfirmingDiscard(false)}
        />
      )}
    </section>
  );
}
