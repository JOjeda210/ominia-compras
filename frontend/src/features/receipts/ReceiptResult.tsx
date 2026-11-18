import { es } from '../../i18n/es';
import type { PurchaseReceiptResult } from '../../sync/backendClient';

interface ReceiptResultProps {
  result: PurchaseReceiptResult;
  onBackToOrder: () => void;
  onRegisterAnother: () => void;
}

// Shown right after a receipt syncs (FR-014): folio plus the orderBalance ERPNext returned in
// the same response, so the user does not have to navigate elsewhere to see the effect.
export function ReceiptResult({ result, onBackToOrder, onRegisterAnother }: ReceiptResultProps) {
  return (
    <section className="receipt-result" data-testid="receipt-result">
      <h1>{es.receiptResult.title}</h1>
      <dl>
        <dt>{es.receiptResult.folioLabel}</dt>
        <dd data-testid="receipt-folio">{result.erpnextName}</dd>
      </dl>

      <h2>{es.receiptResult.balanceTitle}</h2>
      <ul data-testid="receipt-result-balance">
        {result.orderBalance.map((line) => (
          <li key={line.itemRef} data-testid="receipt-result-balance-line">
            {es.orderDetail.balanceLine(line.itemRef, line.pendingQuantity)}
          </li>
        ))}
      </ul>

      <div className="order-form-actions">
        <button type="button" data-testid="receipt-back-to-order" onClick={onBackToOrder}>
          {es.receiptResult.backToOrderButton}
        </button>
        <button type="button" data-testid="receipt-register-another" onClick={onRegisterAnother}>
          {es.receiptResult.registerAnotherButton}
        </button>
      </div>
    </section>
  );
}
