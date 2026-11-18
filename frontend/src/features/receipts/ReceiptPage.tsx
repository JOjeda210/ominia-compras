import { useState } from 'react';
import { createLocalReceipt, getLocalReceipt, markReceiptFailed, markReceiptSynced } from '../../db/receiptsRepository';
import type { CatalogWarehouse, LocalPurchaseDocument } from '../../db/types';
import { es } from '../../i18n/es';
import { BackendApiError, createOrRecoverPurchaseReceipt, type PurchaseReceiptResult } from '../../sync/backendClient';
import { computeOrderBalance } from '../orders/balanceMath';
import { useLocalOrder } from '../orders/useLocalOrders';
import { ReceiptForm, type ReceiptFormSubmission } from './ReceiptForm';
import { ReceiptResult } from './ReceiptResult';
import { useReceiptsForOrder } from './useReceipts';

interface ReceiptPageProps {
  orderLocalId: string;
  warehouses: CatalogWarehouse[];
  onBack: () => void;
}

type Stage =
  | { kind: 'form' }
  | { kind: 'sending' }
  | { kind: 'error'; receiptLocalId: string; message: string }
  | { kind: 'success'; result: PurchaseReceiptResult };

// Orchestrates Historia 4/5: capture -> direct call to ERPNext -> result, keeping one
// persisted LocalPurchaseDocument (and its idempotencyKey) per attempt so a retry after a lost
// response can never create a second Purchase Receipt (FR-007/FR-008).
export function ReceiptPage({ orderLocalId, warehouses, onBack }: ReceiptPageProps) {
  const order = useLocalOrder(orderLocalId);
  const receipts = useReceiptsForOrder(order?.erpnextName ?? null);
  const [stage, setStage] = useState<Stage>({ kind: 'form' });

  if (order === null) return null;
  if (order === undefined) return <p>{es.orderDetail.notFound}</p>;
  if (!order.erpnextName || order.erpnextStatus !== 'submitted') {
    return <p>{es.receiptForm.notEligible}</p>;
  }
  if (!receipts) return null;

  // Narrowed alias: TS does not carry the guards above into nested function declarations that
  // close over `order`, so the handlers below read this instead.
  const currentOrder = order;
  const balance = computeOrderBalance(currentOrder, receipts);
  const formLines = currentOrder.lines.map((line) => ({
    itemRef: line.itemRef,
    orderedQuantity: line.quantity,
    pendingQuantity: balance.find((entry) => entry.itemRef === line.itemRef)?.pendingQuantity ?? null,
  }));

  async function attemptSend(doc: LocalPurchaseDocument): Promise<void> {
    setStage({ kind: 'sending' });
    try {
      const result = await createOrRecoverPurchaseReceipt(
        doc.idempotencyKey,
        doc.purchaseOrderRef as string,
        doc.lines.map((line) => ({
          itemRef: line.itemRef,
          quantity: line.quantity,
          warehouseRef: line.warehouseRef as string,
          sourceOrderLineRef: line.sourceOrderLineRef as string,
        })),
      );
      await markReceiptSynced(doc.localId, result.erpnextName);
      setStage({ kind: 'success', result });
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : es.errors.generic;
      // Only a real ERPNext/backend rejection is persisted as 'failed'; a transient network
      // failure leaves the record 'pending' so a later manual retry reuses the same key.
      const isTransient = sendError instanceof BackendApiError && sendError.errorCode === 'ERPNEXT_UNREACHABLE';
      if (!isTransient) await markReceiptFailed(doc.localId, message);
      setStage({ kind: 'error', receiptLocalId: doc.localId, message });
    }
  }

  async function handleSubmit(submission: ReceiptFormSubmission): Promise<void> {
    const erpnextName = currentOrder.erpnextName as string;
    const doc = await createLocalReceipt(
      erpnextName,
      submission.lines.map((line) => ({
        itemRef: line.itemRef,
        quantity: line.quantity,
        warehouseRef: submission.warehouseRef,
        sourceOrderLineRef: `${erpnextName}-${line.itemRef}`,
      })),
    );
    await attemptSend(doc);
  }

  async function handleRetry(receiptLocalId: string): Promise<void> {
    const doc = await getLocalReceipt(receiptLocalId);
    if (doc) await attemptSend(doc);
  }

  if (stage.kind === 'success') {
    return (
      <ReceiptResult
        result={stage.result}
        onBackToOrder={onBack}
        onRegisterAnother={() => setStage({ kind: 'form' })}
      />
    );
  }

  if (stage.kind === 'sending') {
    return <p data-testid="receipt-sending">{es.receiptForm.sending}</p>;
  }

  return (
    <div>
      {stage.kind === 'error' && (
        <p className="error" role="alert" data-testid="receipt-send-error">
          {stage.message}{' '}
          <button
            type="button"
            data-testid="receipt-retry-button"
            onClick={() => void handleRetry(stage.receiptLocalId)}
          >
            {es.receiptForm.retryButton}
          </button>
        </p>
      )}
      <ReceiptForm
        lines={formLines}
        warehouses={warehouses}
        onSubmit={(submission) => void handleSubmit(submission)}
        onCancel={onBack}
      />
    </div>
  );
}
