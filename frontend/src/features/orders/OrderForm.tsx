import { useState, type FormEvent } from 'react';
import type { CatalogItem, CatalogSupplier } from '../../db/types';
import { es } from '../../i18n/es';
import type { OrderLineInput } from '../../db/ordersRepository';

// 'create': Historia 1, new local capture. 'editLocal': Historia 1, editing a capture that is
// still only local (pending/failed). 'editSynced': Historia 3, editing a draft that already has
// an ERPNext folio -- same form, but the supplier is locked (PUT does not support changing it)
// and onSubmit talks directly to the backend instead of just writing to Dexie.
type OrderFormMode = 'create' | 'editLocal' | 'editSynced';

interface OrderFormProps {
  suppliers: CatalogSupplier[];
  items: CatalogItem[];
  initialSupplierRef?: string;
  initialLines?: OrderLineInput[];
  mode: OrderFormMode;
  onSubmit: (supplierRef: string, lines: OrderLineInput[]) => Promise<void>;
  onCancel: () => void;
}

interface DraftLine {
  key: string;
  itemRef: string;
  quantity: string;
  unitPrice: string;
}

function createEmptyLine(): DraftLine {
  return { key: crypto.randomUUID(), itemRef: '', quantity: '', unitPrice: '' };
}

function toDraftLines(lines: OrderLineInput[] | undefined): DraftLine[] {
  if (!lines || lines.length === 0) return [createEmptyLine()];
  return lines.map((line) => ({
    key: crypto.randomUUID(),
    itemRef: line.itemRef,
    quantity: String(line.quantity),
    unitPrice: String(line.unitPrice),
  }));
}

// Shared form for both creating and editing a local order. Validation happens entirely on the
// client against the cached catalogs/quantities; ERPNext-side validation (e.g. stock rules) is
// out of scope here and handled later by the backend when the queue syncs the document.
export function OrderForm({
  suppliers,
  items,
  initialSupplierRef,
  initialLines,
  mode,
  onSubmit,
  onCancel,
}: OrderFormProps) {
  const [supplierRef, setSupplierRef] = useState(initialSupplierRef ?? '');
  const [lines, setLines] = useState<DraftLine[]>(() => toDraftLines(initialLines));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function updateLine(key: string, patch: Partial<DraftLine>): void {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function addLine(): void {
    setLines((current) => [...current, createEmptyLine()]);
  }

  function removeLine(key: string): void {
    setLines((current) => current.filter((line) => line.key !== key));
  }

  function validate(): OrderLineInput[] | null {
    if (!supplierRef) {
      setError(es.orderForm.validation.supplierRequired);
      return null;
    }
    if (lines.length === 0) {
      setError(es.orderForm.validation.atLeastOneLine);
      return null;
    }
    const parsedLines: OrderLineInput[] = [];
    for (const line of lines) {
      if (!line.itemRef) {
        setError(es.orderForm.validation.itemRequired);
        return null;
      }
      const quantity = Number(line.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        setError(es.orderForm.validation.quantityPositive);
        return null;
      }
      const unitPrice = Number(line.unitPrice);
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        setError(es.orderForm.validation.unitPricePositive);
        return null;
      }
      parsedLines.push({ itemRef: line.itemRef, quantity, unitPrice });
    }
    return parsedLines;
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    const parsedLines = validate();
    if (!parsedLines) return;
    setIsSaving(true);
    try {
      await onSubmit(supplierRef, parsedLines);
    } catch (submitError) {
      // Only the 'editSynced' path can reach a real backend call that rejects (e.g. ERPNext
      // unreachable); 'create'/'editLocal' only ever write to Dexie and never throw here.
      setError(submitError instanceof Error ? submitError.message : es.errors.generic);
    } finally {
      setIsSaving(false);
    }
  }

  const supplierLocked = mode === 'editSynced';
  const title =
    mode === 'create'
      ? es.orderForm.titleCreate
      : mode === 'editSynced'
        ? es.orderForm.titleEditSynced
        : es.orderForm.titleEditLocal;

  return (
    <form className="order-form" onSubmit={handleSubmit} data-testid="order-form">
      <h1>{title}</h1>

      {suppliers.length === 0 && items.length === 0 && (
        <p className="warning" data-testid="no-catalog-warning">
          {es.orderForm.noCatalogWarning}
        </p>
      )}

      <label htmlFor="order-form-supplier">{es.orderForm.supplierLabel}</label>
      <select
        id="order-form-supplier"
        data-testid="supplier-select"
        value={supplierRef}
        disabled={supplierLocked}
        onChange={(event) => setSupplierRef(event.target.value)}
      >
        <option value="">{es.orderForm.supplierPlaceholder}</option>
        {suppliers.map((supplier) => (
          <option key={supplier.erpnextName} value={supplier.erpnextName}>
            {supplier.supplierName}
          </option>
        ))}
      </select>
      {supplierLocked && <p className="hint">{es.orderForm.supplierLockedNote}</p>}

      <h2>{es.orderForm.itemsTitle}</h2>
      {lines.map((line, index) => (
        <div className="order-form-line" key={line.key} data-testid="order-form-line">
          <label htmlFor={`order-form-item-${line.key}`}>{es.orderForm.itemLabel}</label>
          <select
            id={`order-form-item-${line.key}`}
            data-testid="item-select"
            value={line.itemRef}
            onChange={(event) => updateLine(line.key, { itemRef: event.target.value })}
          >
            <option value="">{es.orderForm.itemPlaceholder}</option>
            {items.map((item) => (
              <option key={item.erpnextName} value={item.erpnextName}>
                {item.itemName}
              </option>
            ))}
          </select>

          <label htmlFor={`order-form-quantity-${line.key}`}>{es.orderForm.quantityLabel}</label>
          <input
            id={`order-form-quantity-${line.key}`}
            data-testid="quantity-input"
            type="number"
            min="0"
            step="any"
            value={line.quantity}
            onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
          />

          <label htmlFor={`order-form-price-${line.key}`}>{es.orderForm.unitPriceLabel}</label>
          <input
            id={`order-form-price-${line.key}`}
            data-testid="unit-price-input"
            type="number"
            min="0"
            step="any"
            value={line.unitPrice}
            onChange={(event) => updateLine(line.key, { unitPrice: event.target.value })}
          />

          <button
            type="button"
            data-testid="remove-line-button"
            onClick={() => removeLine(line.key)}
            disabled={lines.length === 1}
          >
            {es.orderForm.removeLineButton} {index + 1}
          </button>
        </div>
      ))}
      <button type="button" data-testid="add-line-button" onClick={addLine}>
        {es.orderForm.addLineButton}
      </button>

      {error && (
        <p className="error" role="alert" data-testid="order-form-error">
          {error}
        </p>
      )}

      <div className="order-form-actions">
        <button type="button" data-testid="order-form-cancel" onClick={onCancel}>
          {es.orderForm.cancelButton}
        </button>
        <button type="submit" data-testid="order-form-save" disabled={isSaving}>
          {es.orderForm.saveButton}
        </button>
      </div>
    </form>
  );
}
