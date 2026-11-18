import { useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { setOrderErrorMessage } from '../../db/ordersRepository';
import { es } from '../../i18n/es';
import { useOrderActions } from './useLocalOrders';

interface CancelOrderDialogProps {
  localId: string;
  erpnextName: string;
  onCancelled: () => void;
  onClose: () => void;
}

// Dedicated dialog for Historia 3's cancellation flow (FR-010/FR-011): a blocked cancellation
// (e.g. a linked Purchase Receipt) must surface the backend's translated message in place, not
// just close silently, so this owns its own error state instead of a plain ConfirmDialog.
export function CancelOrderDialog({
  localId,
  erpnextName,
  onCancelled,
  onClose,
}: CancelOrderDialogProps) {
  const { cancelOrder } = useOrderActions();
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm(): Promise<void> {
    if (isCancelling) return;
    setIsCancelling(true);
    setError(null);
    try {
      await cancelOrder(localId, erpnextName);
      onCancelled();
    } catch (cancelError) {
      // ERPNext's block reason (e.g. a linked receipt) must reach the user as-is: it is already
      // translated by the backend (contracts/backend-api.md error shape), never a raw code.
      const message = cancelError instanceof Error ? cancelError.message : es.errors.generic;
      setError(message);
      await setOrderErrorMessage(localId, message);
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <ConfirmDialog
      title={es.confirmCancelOrder.title}
      message={error ?? es.confirmCancelOrder.message}
      confirmLabel={isCancelling ? es.purchaseOrder.cancelling : es.confirmCancelOrder.confirmButton}
      cancelLabel={es.confirmCancelOrder.cancelButton}
      onConfirm={() => void handleConfirm()}
      onCancel={onClose}
    />
  );
}
