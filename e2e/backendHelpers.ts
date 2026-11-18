import { expect, type Page } from '@playwright/test';

export const BACKEND_URL = process.env.VITE_BACKEND_URL ?? 'http://localhost:8080';

// Shared precondition for every test in this file that needs the real backend (and ERPNext
// behind it): per CLAUDE.md/tasks.md these scenarios must never run against a mock, so a
// missing backend is a skip, not a failure.
export async function isBackendReachable(): Promise<boolean> {
  return fetch(`${BACKEND_URL}/api/catalog/suppliers`)
    .then((response) => response.ok)
    .catch(() => false);
}

// Historia 2/3 precondition reused here: creates an order online using whatever real
// Supplier/Item the backend's catalog returns (never a stub), and waits for the automatic sync
// to assign an ERPNext folio.
export async function createAndSyncOrder(
  page: Page,
  quantity: string,
  unitPrice = '10',
): Promise<void> {
  await page.getByTestId('create-order-button').click();
  const supplierRef = await page.getByTestId('supplier-select').locator('option').nth(1).getAttribute('value');
  const itemRef = await page.getByTestId('item-select').first().locator('option').nth(1).getAttribute('value');
  await page.getByTestId('supplier-select').selectOption(supplierRef ?? '');
  await page.getByTestId('item-select').first().selectOption(itemRef ?? '');
  await page.getByTestId('quantity-input').first().fill(quantity);
  await page.getByTestId('unit-price-input').first().fill(unitPrice);
  await page.getByTestId('order-form-save').click();
  await expect(page.getByTestId('order-folio-detail')).not.toHaveText('Sin folio todavía', {
    timeout: 10_000,
  });
}

// Historia 3: presents the synced draft so Historia 4/5's receipt flow becomes available.
export async function submitOrder(page: Page): Promise<void> {
  await page.getByTestId('submit-order-button').click();
  await expect(page.getByTestId('order-status')).toContainText('Presentada', { timeout: 10_000 });
}
