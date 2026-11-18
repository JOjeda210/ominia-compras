import { useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { StatusBadge } from '../../components/StatusBadge';
import { setOrderErrorMessage } from '../../db/ordersRepository';
import { es } from '../../i18n/es';
import { useReceiptsForOrder } from '../receipts/useReceipts';
import { CancelOrderDialog } from './CancelOrderDialog';
import { OrderBalance } from './OrderBalance';
import { useLocalOrder, useOrderActions } from './useLocalOrders';

interface OrderDetailProps {
  localId: string;
  onEdit: () => void;
  onEditSynced: () => void;
  onReceive: () => void;
  onDiscard: () => Promise<void>;
  onBack: () => void;
}

export function OrderDetail({
  localId,
  onEdit,
  onEditSynced,
  onReceive,
  onDiscard,
  onBack,
}: OrderDetailProps) {
  const order = useLocalOrder(localId);
  const { submitOrder } = useOrderActions();
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false);
  const [isConfirmingCancel, setIsConfirmingCancel] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const receipts = useReceiptsForOrder(order?.erpnextName ?? null);

  if (order === null) return null;
  if (order === undefined) return <p>{es.orderDetail.notFound}</p>;

  // Narrowed alias: TS does not carry the null/undefined guards above into nested function
  // declarations that close over `order`, so every handler below reads this instead.
  const currentOrder = order;

  // Historia 1 vs. Historia 3 (FR-009): editing/discarding a local-only capture never touches
  // ERPNext, while editing a synced draft calls PUT directly on the same folio.
  const canEditLocal = order.syncStatus === 'pending' || order.syncStatus === 'failed';
  const isSyncedDraft = order.syncStatus === 'synced' && order.erpnextStatus === 'draft';
  const isSubmitted = order.syncStatus === 'synced' && order.erpnextStatus === 'submitted';

  async function handleConfirmDiscard(): Promise<void> {
    setIsConfirmingDiscard(false);
    await onDiscard();
  }

  async function handleSubmitOrder(): Promise<void> {
    if (!currentOrder.erpnextName) return;
    setIsSubmitting(true);
    try {
      await submitOrder(currentOrder.localId, currentOrder.erpnextName);
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : es.errors.generic;
      await setOrderErrorMessage(currentOrder.localId, message);
    } finally {
      setIsSubmitting(false);
    }
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
            {line.unitPrice !== null && (
              <>
                {' '}
                — {es.orderForm.unitPriceLabel}:{' '}
                <span data-testid="order-detail-unit-price">{line.unitPrice}</span>
              </>
            )}
          </li>
        ))}
      </ul>

      {/* Balance only makes sense once the order has been submitted at least once (Historia 5). */}
      {order.erpnextName && isSubmitted && <OrderBalance order={order} />}

      {receipts && receipts.length > 0 && (
        <section data-testid="order-receipts">
          <h2>{es.orderDetail.receiptsTitle}</h2>
          <ul>
            {receipts.map((receipt) => (
              <li key={receipt.localId} data-testid="receipt-list-item">
                <span data-testid="receipt-list-folio">
                  {receipt.erpnextName ?? es.orderList.noFolioYet}
                </span>{' '}
                <StatusBadge syncStatus={receipt.syncStatus} erpnextStatus={receipt.erpnextStatus} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="order-detail-actions">
        {canEditLocal && (
          <button type="button" data-testid="edit-order-button" onClick={onEdit}>
            {es.orderDetail.editButton}
          </button>
        )}
        {canEditLocal && (
          <button
            type="button"
            className="danger"
            data-testid="discard-order-button"
            onClick={() => setIsConfirmingDiscard(true)}
          >
            {es.orderDetail.discardButton}
          </button>
        )}
        {isSyncedDraft && (
          <button type="button" data-testid="edit-synced-order-button" onClick={onEditSynced}>
            {es.orderDetail.editSyncedButton}
          </button>
        )}
        {isSyncedDraft && (
          <button
            type="button"
            data-testid="submit-order-button"
            disabled={isSubmitting}
            onClick={() => void handleSubmitOrder()}
          >
            {isSubmitting ? es.purchaseOrder.submitting : es.orderDetail.submitButton}
          </button>
        )}
        {isSubmitted && (
          <button
            type="button"
            className="danger"
            data-testid="cancel-order-button"
            onClick={() => setIsConfirmingCancel(true)}
          >
            {es.orderDetail.cancelOrderButton}
          </button>
        )}
        {isSubmitted && (
          <button type="button" data-testid="receive-order-button" onClick={onReceive}>
            {es.orderDetail.receiveButton}
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

      {isConfirmingCancel && order.erpnextName && (
        <CancelOrderDialog
          localId={order.localId}
          erpnextName={order.erpnextName}
          onCancelled={() => setIsConfirmingCancel(false)}
          onClose={() => setIsConfirmingCancel(false)}
        />
      )}
    </section>
  );
}
