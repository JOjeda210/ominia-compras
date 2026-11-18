# Sprint 2 — Gestión y recepción

## Objetivo
Completar edición, cancelación, recepción de compra (parcial y total) y
reintentos idempotentes sin duplicados, verificados por el subagente
reviewer contra los criterios de aceptación.

## Alcance
1. Edición de un borrador ya sincronizado (misma orden en ERPNext) y
   cancelación con confirmaciones y reglas de estado de ERPNext, con errores
   comprensibles ante bloqueos.
2. Purchase Receipt vinculado a su Purchase Order y renglón, con recepción
   parcial (4 de 10 → saldo 6) y total (6 restantes → saldo 0), sin duplicar
   inventario.
3. Reintentos sin duplicados para orden y recibo, simulando una respuesta
   perdida tras guardar el documento en ERPNext.
4. Verificación integrada con el subagente reviewer; corrección de hallazgos.
5. Cierre de infraestructura final (Fase 5): cambio al espejo y
   restauración, a cargo del subagente infra.

## Revisión del incremento

Incremento demostrado con evidencia real (no simulada) contra el stack
completo (infra + backend en 8081 + ERPNext real en 8080):

- **Edición y cancelación**: `PUT /api/purchase-orders/{erpnextName}` edita
  el mismo folio sin pasar por idempotencia (es una edición, no una
  creación). `submit`/`cancel` confirmados en vivo: `PUR-ORD-2026-00023`
  presentada, y su cancelación bloqueada con `LinkExistsError` → 409
  `ERPNEXT_CONFLICT` al tener un Purchase Receipt presentado vinculado
  (`MAT-PRE-2026-00009`) — el mensaje comprensible llega hasta
  `CancelOrderDialog.tsx`, nunca el detalle crudo.
- **Recibo de compra y recepción parcial/total**: `POST
  /api/purchase-receipts` crea y presenta el recibo en un solo paso,
  vinculado a la orden y a su renglón de origen (`purchase_order_item`
  resuelto por `item_code`, documentado en `research.md`). Probado de punta
  a punta con Playwright real (`receipts.spec.ts`): 4 de 10 → saldo 6 →
  6 restantes → saldo 0, dos recibos listados (SC-006).
- **Reintentos sin duplicados**: tanto para Purchase Order (ya cerrado en
  Fase 3) como para Purchase Receipt, verificado con prueba unitaria
  (`PurchaseReceiptServiceTest`) y con Playwright real simulando una
  respuesta perdida (`retry-idempotency.spec.ts`): el reintento con la
  misma `idempotencyKey` recupera el mismo folio, nunca duplica.
- **Suite E2E completa**: 4/4 pruebas Playwright en verde contra el stack
  real (offline, sincronización automática, recepción parcial/total,
  reintento de recibo), corridas varias veces para confirmar estabilidad
  tras cada corrección.
- **Verificación del subagente `reviewer`**: recorrió FR-001 a FR-017 y
  SC-001 a SC-006 contra el código real. Encontró 1 hallazgo real (faltaba
  logging SLF4J de la causa raíz de errores de ERPNext en el backend —
  T035 de `tasks.md` no estaba implementada) y 2 cosméticos (comentario
  desactualizado, referencias en español dentro de comentarios en inglés).
  **Los 3 corregidos** antes de este commit: logging agregado en
  `ErpNextErrorTranslator`/`IdempotencyResolver`, comentarios ajustados.
- **Infra final (cambio al espejo, respaldos, restauración)**: NO se tocó
  en este sprint, queda explícitamente para la Fase 5, tal como define
  `WORK_PLAN.md` (el punto 5 original de este documento se adelantó por
  error al redactar el plan en Fase 2; se corrige aquí la referencia).

## Retrospectiva

**Qué funcionó bien**
- Probar cada endpoint nuevo contra ERPNext real inmediatamente después de
  escribirlo (no al final) siguió sacando a la luz huecos reales temprano,
  tal como recomendaba la retro de Sprint 1.
- El pase de `reviewer` encontró un hallazgo real (logging) que ni los
  subagentes de implementación ni el coordinador habían notado — justifica
  tenerlo como paso obligatorio antes de cerrar una fase.

**Qué no salió a la primera (y cómo se resolvió)**
- **Falta de cuentas contables por defecto en la Company**: ERPNext
  bloqueaba presentar cualquier Purchase Receipt ("Please set default Stock
  Received But Not Billed...") porque la Company se creó por API en Fase 3,
  saltándose lo que el Setup Wizard configura automáticamente. Resuelto
  llamando a los métodos propios de ERPNext (`create_default_cost_center()`
  + `db_set` de 5 cuentas ya existentes en el plan de cuentas) y
  automatizado en `infra/scripts/seed-demo-data.sh` para que no se repita
  en un despliegue nuevo.
- **Almacenes de grupo rechazados por ERPNext**: `GET
  /api/catalog/warehouses` devolvía también los nodos de grupo del árbol
  (p. ej. "All Warehouses - OCD"); el formulario de recibo tomaba el primero
  de la lista sin saber que podía ser un grupo, y ERPNext rechazaba la
  transacción ("Group node warehouse is not allowed..."). Resuelto
  filtrando `is_group=0` en el backend.
- **Permiso de `Warehouse`/`Company` faltante** para el usuario de
  integración (roles `Purchase Manager`/`Stock Manager` no incluyen lectura
  de esos DocTypes en ERPNext estándar). Resuelto agregando el rol
  `Purchase User`, reflejado en `infra/scripts/create-integration-user.sh`.
- **Coordinación entre sesiones**: el trabajo de esta fase se repartió
  entre dos sesiones de Claude Code (una se cortó por un límite de uso a
  medio camino de las pruebas Playwright de recibos). El trabajo en disco
  no se perdió — solo el hilo de conversación con el subagente de esa
  sesión —, y la sesión siguiente pudo retomarlo leyendo el working tree
  en vez de rehacerlo. Lección: preguntar explícitamente "¿qué ya existe
  en el working tree?" antes de delegar es más rápido que asumir que no
  hay nada.
- **Prefijo de folio asumido incorrectamente**: una prueba asumía que todo
  folio de ERPNext empieza con "PUR" (cierto para Purchase Order, falso
  para Purchase Receipt, que usa "MAT-PRE-..." en esta instancia). Corregido
  verificando solo que el folio no esté vacío, sin asumir un prefijo.

**Para la Fase 5**
- Antes de tocar el cambio al espejo, confirmar que los datos de prueba
  ficticios (varias órdenes/recibos de las rondas de depuración de hoy)
  no interfieren con la demostración; limpiarlos si hace falta antes de
  armar las evidencias finales.
- Aplicar el mismo patrón de "probar en vivo apenas esté listo, no al
  final" al cambio al espejo y a la restauración.
