import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { createAndSyncOrder, isBackendReachable, submitOrder } from './backendHelpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// All screenshots land in the repo's shared evidencias/ folder (coordinator-owned content, but
// this spec only ever writes image files there, never specs/docs) so the delivery PDF can be
// assembled straight from these numbered files.
const EVIDENCE_DIR = path.resolve(__dirname, '..', 'evidencias');
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

const ERPNEXT_URL = process.env.ERPNEXT_URL ?? 'http://lab.localhost:8080';
const ERPNEXT_ADMIN_USER = 'Administrator';
// Read only from the environment at run time: per CLAUDE.md's security rule this value must
// never be hardcoded here nor written to any file/log that could end up committed.
const ERPNEXT_ADMIN_PASSWORD = process.env.ERPNEXT_ADMIN_PASSWORD;

// This whole spec exists to produce real screenshots against the real stack (never a mock), so
// a numbered PNG in evidencias/ is the test's actual deliverable, not just a pass/fail assertion.
async function shot(target: Page, filename: string): Promise<void> {
  await target.screenshot({ path: path.join(EVIDENCE_DIR, filename), fullPage: true });
}

// Fills and saves the order form against the real downloaded catalog (never stubbed): always
// picks the first real supplier/item option, which this lab's fixtures guarantee exist.
async function fillOrderForm(page: Page, quantity: string, unitPrice: string): Promise<void> {
  const supplierRef = await page.getByTestId('supplier-select').locator('option').nth(1).getAttribute('value');
  const itemRef = await page.getByTestId('item-select').first().locator('option').nth(1).getAttribute('value');
  await page.getByTestId('supplier-select').selectOption(supplierRef ?? '');
  await page.getByTestId('item-select').first().selectOption(itemRef ?? '');
  await page.getByTestId('quantity-input').first().fill(quantity);
  await page.getByTestId('unit-price-input').first().fill(unitPrice);
  await page.getByTestId('order-form-save').click();
}

// Logs in to ERPNext's desk as Administrator exactly once for the whole spec; the password only
// ever lives in this process's environment variable, never on disk or in a committable log.
async function loginToErpnext(page: Page): Promise<void> {
  await page.goto(`${ERPNEXT_URL}/login`, { waitUntil: 'networkidle' });
  await page.fill('#login_email', ERPNEXT_ADMIN_USER);
  await page.fill('#login_password', ERPNEXT_ADMIN_PASSWORD as string);
  await page.click('button.btn-login');
  await page.waitForURL('**/app/**', { timeout: 20_000 });
}

// Frappe's desk form only prints the document's own name/folio in the <title> tag, which
// page.screenshot() never captures -- so this stamps the current URL onto the rendered page
// itself, making the folio (and any filter query) visible in the evidence image.
async function stampUrlBanner(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.getElementById('evidence-url-banner')?.remove();
    const banner = document.createElement('div');
    banner.id = 'evidence-url-banner';
    banner.textContent = `ERPNext (Administrator) - ${location.href}`;
    Object.assign(banner.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      right: '0',
      zIndex: '999999',
      background: '#111',
      color: '#0f0',
      padding: '6px 10px',
      fontSize: '13px',
      fontFamily: 'monospace',
    });
    document.body.prepend(banner);
  });
}

// Opens a Frappe desk document directly by doctype + name -- the automated equivalent of an
// Administrator finding that exact document by its folio -- and waits for the form to render.
async function openErpnextDoc(page: Page, doctypeSlug: string, name: string): Promise<void> {
  await page.goto(`${ERPNEXT_URL}/app/${doctypeSlug}/${encodeURIComponent(name)}`, {
    waitUntil: 'networkidle',
  });
  await page.waitForTimeout(1500);
  await stampUrlBanner(page);
}

// Opens a Frappe desk list view filtered by one field=value query string (ERPNext's own
// mechanism for narrowing a list), used here to prove "exactly one document" for a given key.
async function openErpnextListFiltered(page: Page, doctypeSlug: string, query: string): Promise<void> {
  await page.goto(`${ERPNEXT_URL}/app/${doctypeSlug}?${query}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await stampUrlBanner(page);
}

// Reads this app's idempotency key straight off the ERPNext document (the custom field the
// backend writes it to), so the retry evidence never needs the frontend to expose it separately.
async function readIdempotencyKey(page: Page): Promise<string> {
  return page.locator('input[data-fieldname="custom_idempotency_key"]').first().inputValue();
}

test.describe('Evidencias Fase 6 (capturas 7-11 del PDF original)', () => {
  test('captura en vivo las evidencias 7 a 11 contra la app y ERPNext reales', async ({
    page,
    context,
    browser,
  }) => {
    test.setTimeout(10 * 60 * 1000);

    const reachable = await isBackendReachable();
    test.skip(
      !reachable,
      'Backend no disponible. Esta captura de evidencias requiere el backend real (y ERPNext detrás de él); no se simula con un mock.',
    );
    test.skip(
      !ERPNEXT_ADMIN_PASSWORD,
      'Falta ERPNEXT_ADMIN_PASSWORD en el entorno; no se puede navegar a ERPNext como Administrator.',
    );

    // Separate page/session for ERPNext, independent of the app's page, logged in once up front.
    const erpnextPage = await browser.newPage();
    await loginToErpnext(erpnextPage);

    // ================= Evidencia 7: captura offline y persistencia =================
    await page.goto('/');
    await expect(page.getByTestId('create-order-button')).toBeVisible();
    // The later offline page.reload() only works once the PWA service worker has actually
    // installed and activated (it precaches the app shell); without this wait, cutting the
    // network immediately after the first load is a race that intermittently fails the reload.
    await page.evaluate(() => navigator.serviceWorker.ready);

    await context.setOffline(true);
    await expect(page.getByTestId('connectivity-banner')).toHaveAttribute('data-status', 'offline');

    await page.getByTestId('create-order-button').click();
    await fillOrderForm(page, '10', '15');
    await expect(page.getByTestId('order-detail')).toBeVisible();
    await expect(page.getByTestId('order-status')).toContainText('Pendiente');
    await expect(page.getByTestId('order-detail-quantity')).toHaveText('10');
    await shot(page, '07a-offline-pendiente.png');

    // Edit the quantity while still offline.
    await page.getByTestId('edit-order-button').click();
    await page.getByTestId('quantity-input').first().fill('12');
    await page.getByTestId('order-form-save').click();
    await expect(page.getByTestId('order-detail-quantity')).toHaveText('12');

    // Reopen the app (full reload) while still offline: the PWA shell + Dexie must persist it.
    await page.reload();
    await expect(page.getByTestId('connectivity-banner')).toHaveAttribute('data-status', 'offline');
    await expect(page.getByTestId('order-list-item')).toHaveCount(1);
    await page.getByTestId('order-list-item').first().click();
    await expect(page.getByTestId('order-detail-quantity')).toHaveText('12');
    await expect(page.getByTestId('order-status')).toContainText('Pendiente');
    await shot(page, '07b-offline-cantidad-editada.png');

    // A second, unrelated capture: discard it with an explicit confirmation.
    await page.getByTestId('back-button').click();
    await page.getByTestId('create-order-button').click();
    await fillOrderForm(page, '5', '8');
    await page.getByTestId('discard-order-button').click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await shot(page, '07c-offline-descartar.png');
    await page.getByTestId('confirm-dialog-confirm').click();
    await expect(page.getByTestId('order-list-item')).toHaveCount(1);
    await shot(page, '07d-offline-tras-descartar.png');

    // ================= Evidencia 8: sincronización automática =================
    // No sync button exists anywhere in this app (FR-005): reconnecting is the only trigger.
    await context.setOffline(false);
    await page.getByTestId('order-list-item').first().click();
    await expect(page.getByTestId('order-folio-detail')).not.toHaveText('Sin folio todavía', {
      timeout: 10_000,
    });
    await expect(page.getByTestId('order-status')).toContainText('Sincronizada');
    const orderAFolio = (await page.getByTestId('order-folio-detail').innerText()).trim();
    await shot(page, '08a-sincronizada-app.png');

    await openErpnextDoc(erpnextPage, 'purchase-order', orderAFolio);
    await shot(erpnextPage, '08b-sincronizada-erpnext.png');

    // ================= Evidencia 9: edición y cancelación =================
    await page.getByTestId('edit-synced-order-button').click();
    await page.getByTestId('quantity-input').first().fill('20');
    await page.getByTestId('order-form-save').click();
    await expect(page.getByTestId('order-detail-quantity')).toHaveText('20');
    await shot(page, '09a-editado-app.png');

    await openErpnextDoc(erpnextPage, 'purchase-order', orderAFolio);
    await shot(erpnextPage, '09b-editado-erpnext.png');

    await page.getByTestId('submit-order-button').click();
    await expect(page.getByTestId('order-status')).toContainText('Presentada', { timeout: 10_000 });

    await page.getByTestId('cancel-order-button').click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await shot(page, '09c-cancelar-confirmacion.png');
    await page.getByTestId('confirm-dialog-confirm').click();
    await expect(page.getByTestId('order-status')).toContainText('Cancelada', { timeout: 10_000 });

    await openErpnextDoc(erpnextPage, 'purchase-order', orderAFolio);
    await shot(erpnextPage, '09d-cancelada-erpnext.png');

    // ================= Evidencia 10: recepción parcial y total =================
    await page.getByTestId('back-button').click();
    await createAndSyncOrder(page, '10', '11');
    await submitOrder(page);

    await page.getByTestId('receive-order-button').click();
    await expect(page.getByTestId('receipt-form')).toBeVisible();

    // GET /api/catalog/warehouses is beyond the documented contract; an empty result here is an
    // ERPNext permission/setup gap (infra), not something this evidence script can work around.
    const warehouseOptionCount = await page.getByTestId('receipt-warehouse-select').locator('option').count();
    test.skip(
      warehouseOptionCount < 2,
      'El catálogo de almacenes (GET /api/catalog/warehouses) no devolvió ningún almacén real; no se puede capturar la Evidencia 10.',
    );

    await page.getByTestId('receipt-warehouse-select').selectOption({ index: 1 });
    await page.getByTestId('receipt-quantity-input').first().fill('4');
    await page.getByTestId('receipt-form-save').click();
    await expect(page.getByTestId('receipt-result')).toBeVisible({ timeout: 15_000 });
    const receipt1Folio = (await page.getByTestId('receipt-folio').innerText()).trim();
    await expect(page.getByTestId('receipt-result-balance-line')).toContainText('6');
    await shot(page, '10a-recibo1-app.png');

    await page.getByTestId('receipt-register-another').click();
    await page.getByTestId('receipt-warehouse-select').selectOption({ index: 1 });
    await page.getByTestId('receipt-quantity-input').first().fill('6');
    await page.getByTestId('receipt-form-save').click();
    await expect(page.getByTestId('receipt-result')).toBeVisible({ timeout: 15_000 });
    const receipt2Folio = (await page.getByTestId('receipt-folio').innerText()).trim();
    await expect(page.getByTestId('receipt-result-balance-line')).toContainText('0');

    await page.getByTestId('receipt-back-to-order').click();
    await expect(page.getByTestId('receipt-list-item')).toHaveCount(2);
    await expect(page.getByTestId('order-balance-line')).toContainText('0');
    await shot(page, '10b-recibo2-app.png');

    // Both receipts side by side in one image: two same-origin iframes (ERPNext's
    // X-Frame-Options is SAMEORIGIN, which this satisfies) injected into an already-authenticated
    // desk page, each expanded via its row's "open row" panel so Warehouse (hidden from the
    // grid's default columns) and the linked Purchase Order are both visible, not just quantity.
    await erpnextPage.goto(`${ERPNEXT_URL}/app/home`, { waitUntil: 'networkidle' });
    await erpnextPage.evaluate(
      ([a, b]) => {
        document.body.innerHTML = `
          <div style="display:flex;flex-direction:column;gap:6px;background:#fff;">
            <div style="font:13px monospace;background:#111;color:#0f0;padding:4px;">Purchase Receipt 1 de 2: ${a}</div>
            <iframe src="/app/purchase-receipt/${a}" style="width:1260px;height:2200px;border:1px solid #ccc;"></iframe>
            <div style="font:13px monospace;background:#111;color:#0f0;padding:4px;">Purchase Receipt 2 de 2: ${b}</div>
            <iframe src="/app/purchase-receipt/${b}" style="width:1260px;height:2200px;border:1px solid #ccc;"></iframe>
          </div>`;
      },
      [receipt1Folio, receipt2Folio],
    );
    await erpnextPage.waitForTimeout(3000);
    for (const frame of erpnextPage.frames()) {
      const openRowButton = frame.locator('.btn-open-row').first();
      if (await openRowButton.count()) await openRowButton.click().catch(() => undefined);
    }
    await erpnextPage.waitForTimeout(2000);
    await shot(erpnextPage, '10c-recibos-erpnext.png');

    // ================= Evidencia 11: reintentos sin duplicados =================
    // Order retry: the lost response is simulated at the browser<->backend hop with
    // route.fetch()+route.abort() (same mechanism as retry-idempotency.spec.ts for receipts) --
    // the real POST still reaches the real backend/ERPNext, only the response back never does.
    // Recovery here must happen with no retry button at all: only the background sync queue's
    // own backoff polling (FR-005), proving this is a real automatic retry, not a manual one.
    await page.getByTestId('back-button').click();

    let orderPostAttempts = 0;
    await page.route('**/api/purchase-orders', async (route) => {
      if (route.request().method() !== 'POST' || orderPostAttempts > 0) {
        await route.continue();
        return;
      }
      orderPostAttempts += 1;
      await route.fetch().catch(() => undefined);
      await route.abort();
    });

    await page.getByTestId('create-order-button').click();
    await fillOrderForm(page, '8', '9');
    await expect(page.getByTestId('order-status')).toContainText('Pendiente');
    await expect(page.getByTestId('order-folio-detail')).not.toHaveText('Sin folio todavía', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('order-status')).toContainText('Sincronizada');
    const orderDFolio = (await page.getByTestId('order-folio-detail').innerText()).trim();
    await shot(page, '11a-retry-orden-app.png');
    await page.unroute('**/api/purchase-orders');

    await openErpnextDoc(erpnextPage, 'purchase-order', orderDFolio);
    const orderDKey = await readIdempotencyKey(erpnextPage);
    await openErpnextListFiltered(
      erpnextPage,
      'purchase-order',
      `custom_idempotency_key=${encodeURIComponent(orderDKey)}`,
    );
    await shot(erpnextPage, '11b-retry-orden-erpnext.png');

    // Receipt retry: a fresh submitted order with pending balance, then the exact
    // route.fetch()+route.abort() mechanism retry-idempotency.spec.ts already proved, followed
    // by the manual "Reintentar" button (receipts are direct calls, not queued like orders).
    await page.getByTestId('back-button').click();
    await createAndSyncOrder(page, '5', '7');
    await submitOrder(page);
    await page.getByTestId('receive-order-button').click();
    await expect(page.getByTestId('receipt-form')).toBeVisible();
    await page.getByTestId('receipt-warehouse-select').selectOption({ index: 1 });
    await page.getByTestId('receipt-quantity-input').first().fill('5');

    let receiptPostIntercepted = false;
    await page.route('**/api/purchase-receipts', async (route) => {
      if (receiptPostIntercepted) {
        await route.continue();
        return;
      }
      receiptPostIntercepted = true;
      await route.fetch().catch(() => undefined);
      await route.abort();
    });

    await page.getByTestId('receipt-form-save').click();
    await expect(page.getByTestId('receipt-send-error')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('receipt-retry-button').click();
    await expect(page.getByTestId('receipt-result')).toBeVisible({ timeout: 15_000 });
    const receiptEFolio = (await page.getByTestId('receipt-folio').innerText()).trim();
    await expect(page.getByTestId('receipt-result-balance-line')).toContainText('0');
    await shot(page, '11c-retry-recibo-app.png');
    await page.unroute('**/api/purchase-receipts');

    await openErpnextDoc(erpnextPage, 'purchase-receipt', receiptEFolio);
    const receiptEKey = await readIdempotencyKey(erpnextPage);
    await openErpnextListFiltered(
      erpnextPage,
      'purchase-receipt',
      `custom_idempotency_key=${encodeURIComponent(receiptEKey)}`,
    );
    await shot(erpnextPage, '11d-retry-recibo-erpnext.png');

    await erpnextPage.close();
  });
});
