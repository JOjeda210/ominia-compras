import { useState, type FormEvent } from 'react';
import type { CatalogWarehouse } from '../../db/types';
import { es } from '../../i18n/es';

export interface ReceiptFormLine {
  itemRef: string;
  orderedQuantity: number;
  // null when the pending balance is not locally known yet; in that case client-side
  // validation is skipped and ERPNext's own 409 (QUANTITY_EXCEEDS_BALANCE) is the final guard.
  pendingQuantity: number | null;
}

export interface ReceiptFormSubmission {
  warehouseRef: string;
  lines: { itemRef: string; quantity: number }[];
}

interface ReceiptFormProps {
  lines: ReceiptFormLine[];
  warehouses: CatalogWarehouse[];
  onSubmit: (submission: ReceiptFormSubmission) => void;
  onCancel: () => void;
}

// Captures quantity received per order line and a warehouse from the downloaded catalog
// (GET /api/catalog/warehouses; spec.md Assumptions: a single Warehouse exists for the demo,
// so the select below effectively has one option). A partial receipt is expected and valid:
// lines left at 0 are simply omitted from the request (FR-012, FR-015).
export function ReceiptForm({ lines, warehouses, onSubmit, onCancel }: ReceiptFormProps) {
  const [warehouseRef, setWarehouseRef] = useState(warehouses[0]?.erpnextName ?? '');
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((line) => [line.itemRef, ''])),
  );
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    setError(null);
    if (!warehouseRef) {
      setError(es.receiptForm.validation.warehouseRequired);
      return;
    }
    const submittedLines: { itemRef: string; quantity: number }[] = [];
    for (const line of lines) {
      const raw = quantities[line.itemRef];
      if (!raw) continue;
      const quantity = Number(raw);
      if (!Number.isFinite(quantity) || quantity < 0) {
        setError(es.receiptForm.validation.quantityNotNegative);
        return;
      }
      if (quantity === 0) continue;
      if (line.pendingQuantity !== null && quantity > line.pendingQuantity) {
        setError(es.receiptForm.validation.quantityExceedsBalance(line.itemRef));
        return;
      }
      submittedLines.push({ itemRef: line.itemRef, quantity });
    }
    if (submittedLines.length === 0) {
      setError(es.receiptForm.validation.atLeastOneQuantity);
      return;
    }
    onSubmit({ warehouseRef, lines: submittedLines });
  }

  return (
    <form className="receipt-form" onSubmit={handleSubmit} data-testid="receipt-form">
      <h1>{es.receiptForm.title}</h1>

      <label htmlFor="receipt-form-warehouse">{es.receiptForm.warehouseLabel}</label>
      <select
        id="receipt-form-warehouse"
        data-testid="receipt-warehouse-select"
        value={warehouseRef}
        onChange={(event) => setWarehouseRef(event.target.value)}
      >
        <option value="">{es.receiptForm.warehousePlaceholder}</option>
        {warehouses.map((warehouse) => (
          <option key={warehouse.erpnextName} value={warehouse.erpnextName}>
            {warehouse.warehouseName}
          </option>
        ))}
      </select>
      <p className="hint">{es.receiptForm.warehouseHelp}</p>

      <ul className="receipt-form-lines" data-testid="receipt-form-lines">
        {lines.map((line) => (
          <li key={line.itemRef} className="receipt-form-line" data-testid="receipt-form-line">
            <span className="receipt-form-line-item">{line.itemRef}</span>
            <span>
              {es.receiptForm.orderedQuantityLabel}: {line.orderedQuantity}
            </span>
            {line.pendingQuantity !== null && (
              <span data-testid="receipt-form-line-pending">
                {es.receiptForm.pendingQuantityLabel}: {line.pendingQuantity}
              </span>
            )}
            <label htmlFor={`receipt-quantity-${line.itemRef}`}>
              {es.receiptForm.receivedQuantityLabel}
            </label>
            <input
              id={`receipt-quantity-${line.itemRef}`}
              data-testid="receipt-quantity-input"
              type="number"
              min="0"
              step="any"
              value={quantities[line.itemRef] ?? ''}
              onChange={(event) =>
                setQuantities((current) => ({ ...current, [line.itemRef]: event.target.value }))
              }
            />
          </li>
        ))}
      </ul>

      {error && (
        <p className="error" role="alert" data-testid="receipt-form-error">
          {error}
        </p>
      )}

      <div className="order-form-actions">
        <button type="button" data-testid="receipt-form-cancel" onClick={onCancel}>
          {es.receiptForm.cancelButton}
        </button>
        <button type="submit" data-testid="receipt-form-save">
          {es.receiptForm.saveButton}
        </button>
      </div>
    </form>
  );
}
