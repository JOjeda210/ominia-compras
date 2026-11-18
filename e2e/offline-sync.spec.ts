import { expect, type Page, test } from '@playwright/test';

// Fixed catalog fixture used in place of a live backend download: quickstart.md Escenario 1
// assumes catalogs "already downloaded" before going offline, so stubbing the GET endpoints
// while still online reproduces that precondition without requiring the real backend (which
// Historia 1 is explicitly supposed to work without, per tasks.md T016's checkpoint).
const FAKE_SUPPLIER = { erpnextName: 'SUP-0001', supplierName: 'Proveedor Ficticio SA' };
const FAKE_ITEM = { erpnextName: 'ITEM-0001', itemName: 'Tornillo 1/4"', stockUom: 'Unidad', isStockItem: true };

async function stubCatalogEndpoints(page: Page): Promise<void> {
  await page.route('**/api/catalog/suppliers', (route) =>
    route.fulfill({ json: { suppliers: [FAKE_SUPPLIER] } }),
  );
  await page.route('**/api/catalog/items', (route) => route.fulfill({ json: { items: [FAKE_ITEM] } }));
}

async function fillOrderForm(page: Page, quantity: string, unitPrice = '10'): Promise<void> {
  await page.getByTestId('supplier-select').selectOption(FAKE_SUPPLIER.erpnextName);
  await page.getByTestId('item-select').first().selectOption(FAKE_ITEM.erpnextName);
  await page.getByTestId('quantity-input').first().fill(quantity);
  await page.getByTestId('unit-price-input').first().fill(unitPrice);
  await page.getByTestId('order-form-save').click();
}

// Historia 1 (US1, P1): offline capture must work end to end with no backend reachable at all
// -- the checkpoint in tasks.md is explicit about this ("funciona de punta a punta sin backend
// disponible"). The catalog stub above is the only network interaction in this whole test.
test.describe('Historia 1: captura offline', () => {
  test('crear, editar, reabrir sin red y descartar otra captura (SC-001, SC-002)', async ({
    page,
    context,
  }) => {
    await stubCatalogEndpoints(page);
    await page.goto('/');

    // Confirm the catalog actually downloaded while still online, before cutting the network.
    await expect(page.getByTestId('create-order-button')).toBeVisible();
    await page.getByTestId('create-order-button').click();
    await expect(page.getByTestId('supplier-select').locator('option')).toHaveCount(2);
    await page.getByTestId('order-form-cancel').click();

    // Cut the network: simulates the buyer working in the field with no connectivity at all.
    await context.setOffline(true);
    await expect(page.getByTestId('connectivity-banner')).toHaveAttribute('data-status', 'offline');

    // SC-001: creating a full order offline must take under 2 minutes.
    const creationStartedAt = Date.now();
    await page.getByTestId('create-order-button').click();
    await fillOrderForm(page, '10');
    await expect(page.getByTestId('order-detail')).toBeVisible();
    const creationElapsedMs = Date.now() - creationStartedAt;
    expect(creationElapsedMs).toBeLessThan(120_000);

    // FR-003: an unsynced order must be visibly marked "pendiente".
    await expect(page.getByTestId('order-status')).toContainText('Pendiente');
    await expect(page.getByTestId('order-detail-quantity')).toHaveText('10');

    // FR-002: editing while still offline must persist the latest edit, not the original value.
    await page.getByTestId('edit-order-button').click();
    await page.getByTestId('quantity-input').first().fill('12');
    await page.getByTestId('order-form-save').click();
    await expect(page.getByTestId('order-detail-quantity')).toHaveText('12');

    // SC-002: close/reopen the app (full reload) while still offline; the PWA service worker
    // must serve the app shell from cache, and Dexie (IndexedDB) must still show the edit.
    await page.reload();
    await expect(page.getByTestId('connectivity-banner')).toHaveAttribute('data-status', 'offline');
    await expect(page.getByTestId('order-list-item')).toHaveCount(1);
    await page.getByTestId('order-list-item').first().click();
    await expect(page.getByTestId('order-detail-quantity')).toHaveText('12');
    await expect(page.getByTestId('order-status')).toContainText('Pendiente');

    // FR-004: a second, unrelated capture can be discarded with an explicit confirmation and
    // never reappears in the queue.
    await page.getByTestId('back-button').click();
    await page.getByTestId('create-order-button').click();
    await fillOrderForm(page, '5');
    await page.getByTestId('discard-order-button').click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await page.getByTestId('confirm-dialog-confirm').click();

    await expect(page.getByTestId('order-list-item')).toHaveCount(1);
    await page.getByTestId('order-list-item').first().click();
    await expect(page.getByTestId('order-detail-quantity')).toHaveText('12');
  });
});

// Historia 2 (US2, P2): requires the real backend (Spring Boot) and a real ERPNext behind it,
// since it validates that reconnection produces a genuine ERPNext draft folio -- not just that
// the frontend reacts correctly to a hand-crafted response. Per tasks.md T020, this is written
// and structured correctly now and will run for real once backend + infra are up; it must not
// be made to pass against a stub that pretends to be ERPNext.
test.describe('Historia 2: sincronización automática', () => {
  test.beforeEach(async () => {
    const backendUrl = process.env.VITE_BACKEND_URL ?? 'http://localhost:8080';
    const reachable = await fetch(`${backendUrl}/api/catalog/suppliers`)
      .then((response) => response.ok)
      .catch(() => false);
    test.skip(
      !reachable,
      `Backend no disponible en ${backendUrl}. Esta prueba requiere el backend real (y ERPNext detrás de él) corriendo según contracts/backend-api.md; no se simula con un mock.`,
    );
  });

  test('una orden pendiente se sincroniza sola al recuperar la red, con folio de ERPNext (SC-003)', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await expect(page.getByTestId('create-order-button')).toBeVisible();

    await context.setOffline(true);
    await page.getByTestId('create-order-button').click();

    const supplierRef = await page.getByTestId('supplier-select').locator('option').nth(1).getAttribute('value');
    const itemRef = await page.getByTestId('item-select').first().locator('option').nth(1).getAttribute('value');
    await page.getByTestId('supplier-select').selectOption(supplierRef ?? '');
    await page.getByTestId('item-select').first().selectOption(itemRef ?? '');
    await page.getByTestId('quantity-input').first().fill('7');
    await page.getByTestId('unit-price-input').first().fill('10');
    await page.getByTestId('order-form-save').click();
    await expect(page.getByTestId('order-status')).toContainText('Pendiente');

    // Reconnection must sync automatically -- no sync button exists in this app (FR-005).
    const reconnectedAt = Date.now();
    await context.setOffline(false);

    await expect(page.getByTestId('order-folio-detail')).not.toHaveText('Sin folio todavía', {
      timeout: 10_000,
    });
    const syncElapsedMs = Date.now() - reconnectedAt;
    expect(syncElapsedMs).toBeLessThan(10_000);

    await expect(page.getByTestId('order-status')).toContainText('Sincronizada');
    await expect(page.getByTestId('order-folio-detail')).toContainText('PUR-ORD');
  });
});
