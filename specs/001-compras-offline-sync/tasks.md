---

description: "Task list for Compras offline con sincronización a ERPNext"
---

# Tasks: Compras offline con sincronización a ERPNext

**Input**: Design documents from `specs/001-compras-offline-sync/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/backend-api.md, quickstart.md

**Tests**: Incluidos porque la spec exige verificación explícita de idempotencia y del flujo offline (Playwright, pruebas de idempotencia en backend).

**Dueños**: `backend` (Java/Spring Boot), `frontend` (React/Vite/Dexie, incluye `e2e/`). Cada tarea indica su dueño entre paréntesis.

## Format: `[ID] [P?] [Story] Description (dueño: ...)`

---

## Phase 1: Setup

- [ ] T001 Inicializar proyecto Spring Boot (Maven, Java 21, `spring-boot-starter-web`) en `backend/pom.xml` y estructura de paquetes de `plan.md` (dueño: backend)
- [ ] T002 [P] Inicializar proyecto Vite + React + TypeScript con plugin PWA en `frontend/package.json` y `frontend/vite.config.ts` (dueño: frontend)
- [ ] T003 [P] Agregar dependencia Dexie y configurar linting/formatting (ESLint + Prettier) en `frontend/package.json` (dueño: frontend)
- [ ] T004 [P] Configurar Playwright en `e2e/playwright.config.ts` apuntando al frontend local (dueño: frontend)

**Checkpoint**: estructura de ambos proyectos compila/arranca en vacío.

---

## Phase 2: Foundational (bloqueante para todas las historias)

**⚠️ CRITICAL**: ninguna historia de usuario puede implementarse sin esto.

- [ ] T005 Definir esquema Dexie para `CatalogSupplier`, `CatalogItem`, `LocalPurchaseDocument` y `LocalDocumentLine` según `data-model.md` (todos los campos y la tabla de transiciones de `syncStatus`) en `frontend/src/db/schema.ts` (dueño: frontend)
- [ ] T006 [P] Implementar cliente HTTP hacia ERPNext (`Authorization: token key:secret`, credenciales solo desde `.env`) en `backend/src/main/java/com/omnia/compras/erpnext/ErpNextClient.java` (dueño: backend)
- [ ] T007 [P] Implementar el formato de error estándar (`errorCode`/`message`/`erpnextDetail` de `contracts/backend-api.md`) en `backend/src/main/java/com/omnia/compras/erpnext/ErpNextErrorTranslator.java` (dueño: backend)
- [ ] T008 Implementar el resolutor de idempotencia (consulta por `custom_idempotency_key` antes de crear, según la decisión de `research.md`) en `backend/src/main/java/com/omnia/compras/idempotency/IdempotencyResolver.java` (dueño: backend)
- [ ] T009 [P] Crear `frontend/src/i18n/es.ts` con las claves de texto base (pendiente, sincronizada, presentada, cancelada, confirmaciones) (dueño: frontend)
- [ ] T010 Implementar el detector de conectividad (evento `online` + verificación activa contra el backend, según `research.md`) y el esqueleto del procesador de cola — cada `LocalPurchaseDocument` se procesa de forma independiente (`data-model.md`, `LocalPurchaseDocument.syncStatus`) — en `frontend/src/sync/syncQueue.ts` (dueño: frontend)

**Checkpoint**: base de datos local, cliente ERPNext e idempotencia listos; las historias pueden empezar.

---

## Phase 3: User Story 1 - Captura offline (Priority: P1) 🎯 MVP

**Goal**: crear, editar y descartar una orden sin conexión, conservando siempre la última versión.

**Independent Test**: Quickstart "Escenario 1" — crear orden sin red, editar cantidad, reabrir todavía sin red, descartar otra captura.

- [ ] T011 [P] [US1] Implementar `GET /api/catalog/suppliers` y `GET /api/catalog/items` (respaldados por `GET /api/resource/Supplier` e `Item`) en `backend/src/main/java/com/omnia/compras/catalog/CatalogController.java` (dueño: backend)
- [ ] T012 [P] [US1] Implementar descarga y caché de catálogos en Dexie (`CatalogSupplier.erpnextName/supplierName/fetchedAt`, `CatalogItem.erpnextName/itemName/stockUom/isStockItem/fetchedAt`, `data-model.md`) en `frontend/src/db/catalogRepository.ts` (dueño: frontend)
- [ ] T013 [US1] Implementar creación/edición local de una orden: generar `LocalPurchaseDocument.localId`/`idempotencyKey` una sola vez, fijar `documentType = purchase_order`, `supplierRef` y mantener `createdAt`/`updatedAt` al editar (`data-model.md`), persistiendo `LocalDocumentLine.itemRef/quantity` en `frontend/src/features/orders/useLocalOrders.ts` (depende de T005, T012) (dueño: frontend)
- [ ] T014 [US1] Implementar listado y detalle de órdenes mostrando `LocalPurchaseDocument.syncStatus = pending` como "pendiente" (`data-model.md`) en `frontend/src/features/orders/OrderList.tsx` y `OrderDetail.tsx` (dueño: frontend)
- [ ] T015 [US1] Implementar descarte de una captura pendiente con confirmación explícita (FR-004), eliminando el registro de Dexie, en `frontend/src/features/orders/useLocalOrders.ts` (dueño: frontend)
- [ ] T016 [US1] Prueba Playwright del Escenario 1 de `quickstart.md` (offline → crear → editar → reabrir → descartar); la prueba DEBE cronometrar el paso de creación y aserar que concluye en menos de 2 minutos (SC-001) en `e2e/offline-sync.spec.ts` (dueño: frontend)

**Checkpoint**: la captura offline funciona de punta a punta sin backend disponible.

---

## Phase 4: User Story 2 - Sincronización automática (Priority: P2)

**Goal**: sincronizar automáticamente al recuperar red, sin botón, con recuperación idempotente ante respuesta perdida.

**Independent Test**: Quickstart "Escenario 2" (sync automática) y "Escenario 3" (reintento de orden).

- [ ] T017 [P] [US2] Implementar `POST /api/purchase-orders` (crear o recuperar por `idempotencyKey`, FR-007/FR-008) en `backend/src/main/java/com/omnia/compras/purchaseorder/PurchaseOrderController.java` + `PurchaseOrderService.java`, usando T006 y T008 (dueño: backend)
- [ ] T018 [US2] Activar el procesador de cola de T010 para enviar cada `LocalPurchaseDocument` pendiente de forma independiente al confirmar conexión (FR-005; un rechazo no bloquea a los demás, según Clarifications de `spec.md`) en `frontend/src/sync/syncQueue.ts` (depende de T010, T017) (dueño: frontend)
- [ ] T019 [US2] Actualizar `LocalPurchaseDocument.erpnextName`/`erpnextStatus` tras una sincronización exitosa (`data-model.md`) en `frontend/src/db/ordersRepository.ts` (dueño: frontend)
- [ ] T020 [US2] Prueba Playwright del Escenario 2 de `quickstart.md` (reconexión → borrador en ERPNext sin botón); la prueba DEBE cronometrar desde la reconexión hasta que aparece el folio y aserar que toma menos de 10 segundos (SC-003) en `e2e/offline-sync.spec.ts` (dueño: frontend)

**Checkpoint**: una orden capturada sin red llega sola a ERPNext como borrador.

---

## Phase 5: User Story 3 - Edición y cancelación (Priority: P3)

**Goal**: editar un borrador ya sincronizado y cancelar una orden presentada, con bloqueos de ERPNext explicados.

**Independent Test**: Quickstart "Escenario 4".

- [ ] T021 [P] [US3] Implementar `PUT /api/purchase-orders/{erpnextName}` en `PurchaseOrderController`/`Service` (dueño: backend)
- [ ] T022 [P] [US3] Implementar `POST /api/purchase-orders/{erpnextName}/submit` y `/cancel`, propagando el formato de error de T007 en caso de bloqueo (FR-011) en `PurchaseOrderController`/`Service` (dueño: backend)
- [ ] T023 [US3] Implementar edición de un borrador sincronizado actualizando el mismo `erpnextName` en `frontend/src/features/orders/OrderDetail.tsx` (depende de T021) (dueño: frontend)
- [ ] T024 [US3] Implementar diálogo de confirmación de cancelación, guardando el `message` comprensible en `LocalPurchaseDocument.errorMessage` (`data-model.md`) cuando ERPNext bloquea la operación, y mostrándolo en `frontend/src/features/orders/CancelOrderDialog.tsx` (depende de T022) (dueño: frontend)

**Checkpoint**: edición y cancelación funcionan contra ERPNext real, con errores traducidos.

---

## Phase 6: User Story 4 - Recibo de compra (Priority: P4)

**Goal**: registrar un recibo de compra vinculado a una orden presentada.

**Independent Test**: Quickstart "Escenario 5" (primera parte).

- [ ] T025 [P] [US4] Implementar `POST /api/purchase-receipts`, validando `purchaseOrderRef` obligatorio (FR-012/FR-013) y referenciando `LocalDocumentLine.sourceOrderLineRef` (`data-model.md`) en `backend/src/main/java/com/omnia/compras/purchasereceipt/PurchaseReceiptController.java` + `PurchaseReceiptService.java` (dueño: backend)
- [ ] T026 [US4] Implementar formulario de recepción con cantidad por artículo y `LocalDocumentLine.warehouseRef` (`data-model.md`) en `frontend/src/features/receipts/ReceiptForm.tsx` (depende de T025) (dueño: frontend)
- [ ] T027 [US4] Mostrar folio del recibo y `orderBalance` (saldo pendiente, FR-014) en `frontend/src/features/receipts/ReceiptResult.tsx` (dueño: frontend)

**Checkpoint**: un recibo de compra se crea y se ve su saldo pendiente.

---

## Phase 7: User Story 5 - Recepción parcial y cierre (Priority: P5)

**Goal**: dos recepciones sucesivas (4 + 6 de 10) dejan el saldo en cero sin duplicar inventario.

**Independent Test**: Quickstart "Escenario 5" completo.

- [ ] T028 [US5] Implementar validación de cantidad recibida contra saldo pendiente (409 `QUANTITY_EXCEEDS_BALANCE`, edge case de `spec.md`) en `PurchaseReceiptService` (depende de T025) (dueño: backend)
- [ ] T029 [US5] Mostrar el saldo acumulado tras múltiples recibos en `frontend/src/features/orders/OrderBalance.tsx` (depende de T027) (dueño: frontend)
- [ ] T030 [US5] Prueba Playwright del Escenario 5 de `quickstart.md` (4 de 10, luego 6, saldo 0, dos recibos) en `e2e/receipts.spec.ts` (dueño: frontend)

**Checkpoint**: recepción parcial y total verificadas de punta a punta.

---

## Phase 8: User Story 6 - Reintentos sin duplicados (Priority: P6)

**Goal**: ningún reintento, para orden o recibo, crea un segundo documento.

**Independent Test**: Quickstart "Escenario 3" (orden) y "Escenario 6" (recibo).

- [ ] T031 [P] [US6] Prueba de idempotencia de `POST /api/purchase-orders` simulando respuesta perdida tras guardado exitoso en `backend/src/test/java/com/omnia/compras/idempotency/PurchaseOrderIdempotencyTest.java` (depende de T017) (dueño: backend)
- [ ] T032 [P] [US6] Prueba de idempotencia de `POST /api/purchase-receipts` en `backend/src/test/java/com/omnia/compras/idempotency/PurchaseReceiptIdempotencyTest.java` (depende de T025) (dueño: backend)
- [ ] T033 [US6] Prueba Playwright/script de reintento sin duplicados end-to-end (Escenarios 3 y 6 de `quickstart.md`) en `e2e/retry-idempotency.spec.ts` (dueño: frontend)

**Checkpoint**: idempotencia verificada para ambos tipos de documento.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [ ] T034 [P] Revisar que todos los textos de UI pasen por `frontend/src/i18n/es.ts` (ninguno hardcodeado en componentes) (dueño: frontend)
- [ ] T035 [P] Agregar logging de decisiones de idempotencia y de traducción de errores (comentario de una línea por bloque, Principio VIII) en `backend/src/main/java/com/omnia/compras/` (dueño: backend)
- [ ] T036 Ejecutar manualmente `quickstart.md` completo contra una ERPNext real desplegada en Fase 3 y registrar evidencia (dueño: coordinador, con `backend`+`frontend`)
- [ ] T037 Pase del subagente `reviewer` contra los criterios de aceptación de `spec.md` y la constitución (dueño: reviewer)

---

## Dependencies & Execution Order

- **Setup (Phase 1)** → **Foundational (Phase 2)**: bloquea todo lo demás.
- **US1 (Phase 3)**: solo depende de Foundational; es el MVP.
- **US2 (Phase 4)**: depende de Foundational y de T010 (cola) y reutiliza T006/T008; puede avanzar en paralelo con US1 en cuanto exista `POST /api/purchase-orders` (T017), pero su prueba E2E necesita US1 completo.
- **US3 (Phase 5)**: depende de que exista una orden sincronizada (US2).
- **US4 (Phase 6)**: depende de que exista una orden presentada (US3, `submit`).
- **US5 (Phase 7)**: depende de US4 (primer recibo) para la segunda recepción.
- **US6 (Phase 8)**: depende de T017 (orden) y T025 (recibo) ya implementados; se prueba de forma aislada por tipo de documento.
- **Polish**: depende de que todas las historias deseadas estén completas.

### Parallel Opportunities

- T001–T004 (Setup) en paralelo entre sí.
- T006, T007, T009 (Foundational) en paralelo; T005, T008, T010 tienen dependencias señaladas.
- T011/T012 (US1, backend/frontend) en paralelo.
- T021/T022 (US3, backend) en paralelo entre sí.
- T031/T032 (US6, backend) en paralelo entre sí.
- `backend` y `frontend` pueden trabajar US1/US2 en paralelo una vez cerrada la Fase 2 (ver Fase 3 de `WORK_PLAN.md`: infra arranca primero, backend y frontend en paralelo contra el contrato).

## Implementation Strategy

### MVP primero (User Story 1)

1. Fase 1 (Setup) → Fase 2 (Foundational) → Fase 3 (US1).
2. Validar US1 de forma aislada (sin backend corriendo, todo en Dexie).
3. Demostrar captura offline antes de tocar sincronización real.

### Entrega incremental

1. Foundational listo → base para todo.
2. US1 → demo de captura offline.
3. US2 → demo de sincronización automática (cierre de Sprint 1, según `docs/sprint-1.md`).
4. US3, US4, US5, US6 → Sprint 2 (`docs/sprint-2.md`).
