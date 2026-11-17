# Quickstart: Compras offline con sincronización a ERPNext

Guía de validación end-to-end. Requiere que `002-infra-erpnext-replica` ya
esté desplegado (ERPNext accesible, catálogos de prueba cargados) y que el
backend tenga configuradas sus credenciales de integración en `.env`.

## Prerrequisitos

1. ERPNext corriendo y accesible (ver `specs/002-infra-erpnext-replica/quickstart.md`).
2. `backend/.env` con `ERPNEXT_BASE_URL`, `ERPNEXT_API_KEY`, `ERPNEXT_API_SECRET`.
3. Backend corriendo: `./mvnw spring-boot:run` (o el contenedor equivalente).
4. Frontend corriendo: `npm run dev` en `frontend/`.

## Escenario 1 — Captura offline y persistencia (US1)

1. Abrir la app, dejar que descargue catálogos de proveedores y artículos.
2. Cortar la red (modo avión / DevTools → Network → Offline).
3. Crear una orden con un proveedor y un artículo, cantidad 10.
4. Verificar que aparece en el listado marcada como "pendiente".
5. Editar la cantidad a 12, cerrar la pestaña y reabrirla (todavía offline).
6. **Esperado**: la orden muestra cantidad 12, sigue "pendiente".
7. Crear una segunda orden y descartarla con confirmación.
8. **Esperado**: la segunda orden desaparece del listado.

## Escenario 2 — Sincronización automática (US2)

1. Con la orden pendiente del escenario 1, restablecer la red.
2. **Esperado**: sin pulsar ningún botón, la orden pasa a mostrar un folio
   de ERPNext (`PUR-ORD-...`) en menos de 10 segundos.
3. Verificar en ERPNext (`/app/purchase-order`) que existe ese folio en
   estado Draft, con la cantidad 12.

## Escenario 3 — Reintento sin duplicados (US6, orden)

1. Con el backend corriendo, simular una respuesta perdida: cortar la
   conexión del backend hacia ERPNext justo después de que ERPNext
   confirme la creación (o usar un proxy/mock que descarte la respuesta).
2. Reintentar el envío con la misma `idempotencyKey` (la app lo hace
   automáticamente al reintentar la cola).
3. **Esperado**: en ERPNext existe un único Purchase Order para esa
   captura; el folio devuelto en el reintento coincide con el ya creado.

## Escenario 4 — Edición y cancelación (US3)

1. Editar la orden sincronizada del escenario 2 (cambiar cantidad).
2. **Esperado**: el mismo folio en ERPNext refleja el nuevo valor.
3. Presentar (`Submit`) la orden desde la app.
4. Intentar cancelarla sin recibos vinculados: confirmar en el diálogo.
5. **Esperado**: estado final `cancelled`, reflejando lo que reporta
   ERPNext.

## Escenario 5 — Recepción parcial y total (US4, US5)

1. Presentar una nueva orden de 10 unidades.
2. Registrar un recibo de 4 unidades, almacén de prueba.
3. **Esperado**: la app muestra folio del recibo y saldo pendiente de 6.
4. Registrar un segundo recibo por las 6 restantes.
5. **Esperado**: saldo pendiente 0; en ERPNext existen exactamente dos
   Purchase Receipt vinculados a la orden, con las cantidades y almacén
   correctos.

## Escenario 6 — Reintento sin duplicados (US6, recibo)

1. Repetir el mecanismo del Escenario 3 pero sobre un `POST
   /api/purchase-receipts`.
2. **Esperado**: un único Purchase Receipt en ERPNext para esa
   `idempotencyKey`; la entrada de inventario no se duplica.

## Prueba automatizada

`e2e/offline-sync.spec.ts` (Playwright) debe automatizar al menos los
Escenarios 1 y 2 usando el modo offline del contexto de navegador de
Playwright (`context.setOffline(true)`).
