# Research: Compras offline con sincronización a ERPNext

## Clave de idempotencia en ERPNext

**Decision**: Un Custom Field `custom_idempotency_key` (tipo `Data`, único) en
el DocType `Purchase Order` y otro equivalente en `Purchase Receipt`. El
backend genera o recibe del frontend un UUID v4 por captura, y antes de
crear un documento nuevo consulta primero
`GET /api/resource/Purchase Order?filters=[["custom_idempotency_key","=","<key>"]]`.
Si existe, devuelve el folio ya creado; si no existe, crea el documento con
ese Custom Field poblado.

**Rationale**: Un Custom Field indexado y único es el mecanismo soportado
por Frappe para extender un DocType sin tocar su núcleo, se consulta con la
misma API REST que el resto de la integración, y sobrevive a reinicios o
migraciones del sitio porque vive en la base de datos del documento mismo
(no en una tabla externa que podría desincronizarse).

**Alternatives considered**:
- *Tabla de idempotencia separada en el backend* (p. ej. una tabla SQL propia
  mapeando clave → folio): se descartó porque introduce una segunda fuente
  de verdad que puede desincronizarse de ERPNext (viola el Principio III);
  además no sobrevive a una restauración de ERPNext en un sitio distinto.
- *Usar el campo `name` de ERPNext como clave de idempotencia* (generarlo en
  el cliente y enviarlo como `name` al crear): se descartó porque el
  `naming series` de Purchase Order en ERPNext no está diseñado para aceptar
  nombres arbitrarios del cliente sin reconfigurar el DocType, lo que
  añadiría complejidad innecesaria para el alcance de esta prueba.

**Pendiente de verificación empírica (Fase 3)**: una vez desplegado ERPNext,
confirmar que el Custom Field puede crearse como único sin conflicto con la
convención de nombres (`naming_series`) existente, y medir el costo de la
consulta de pre-chequeo bajo el catálogo pequeño de esta prueba (se espera
despreciable).

## Operación para crear un Purchase Receipt desde una Purchase Order

**Decision**: Usar el endpoint genérico de creación de documentos
(`POST /api/resource/Purchase Receipt`) enviando explícitamente las
referencias de renglón (`purchase_order` y `purchase_order_item` en cada
`items[]`) en vez de depender de un endpoint de "mapeo" específico de la UI
de ERPNext (como `/api/method/erpnext.stock.doctype.purchase_receipt.purchase_receipt.make_purchase_receipt`,
que es el método que usa el botón "Create > Purchase Receipt" en la
interfaz web).

**Rationale**: El endpoint de método de mapeo (`make_purchase_receipt`) es
cómodo desde la UI pero no es un contrato API estable documentado para
integraciones externas entre versiones de ERPNext; construir el documento
directamente con las referencias de renglón usa la misma API REST genérica
que el resto de la integración (Supplier, Item, Purchase Order) y dejamos
que ERPNext valide el documento (cantidades, estado de la orden) al
guardarlo, tal como exige el PDF original de la prueba ("deja que ERPNext
valide el documento").

**Alternatives considered**:
- *Usar el método de mapeo de la UI* (`make_purchase_receipt`): se descartó
  como decisión por defecto porque su disponibilidad y firma exacta pueden
  variar entre versiones de ERPNext/Frappe; se deja documentado como
  alternativa a probar en Fase 3 si el enfoque genérico presenta
  fricción.

**Pendiente de verificación empírica (Fase 3)**: el PDF original pide
explícitamente "verifica en tu versión de ERPNext la operación soportada
para generar un recibo desde una orden y confirmarlo". Esta decisión es la
base de partida, pero se confirmará o ajustará contra la versión real de
ERPNext una vez desplegada, y el resultado se documentará en este mismo
archivo (actualización, no archivo nuevo).

## Estructura de la cola de sincronización offline (Dexie)

**Decision**: Tres tablas Dexie: `catalogSuppliers`, `catalogItems` (copias
de solo lectura de los catálogos de ERPNext) y `localPurchaseDocuments`
(una tabla única para órdenes y recibos locales, discriminada por un campo
`documentType`), donde cada registro lleva su `idempotencyKey`, su
`syncStatus` (`pending` / `syncing` / `synced` / `failed`) y, una vez
sincronizado, el `erpnextName` (folio). La cola de envío es una vista
derivada de esta tabla (todo registro con `syncStatus = pending` o
`failed`), no una tabla aparte.

**Rationale**: Mantener una sola tabla para el documento y su estado de
sincronización evita duplicar el dato entre una "tabla de documentos" y una
"tabla de cola" que podrían desincronizarse entre sí; es consistente con la
decisión de la clarificación de que la cola procesa cada documento de forma
independiente (un `syncStatus = failed` en un registro no bloquea a los
demás).

**Alternatives considered**:
- *Cola FIFO separada de los documentos*: se descartó por el riesgo de que
  el documento y su entrada de cola diverjan (p. ej. el documento se edita
  pero la cola conserva una versión vieja en tránsito).

## Detección de conectividad y disparo de sincronización

**Decision**: Combinar el evento `online` del navegador con una verificación
activa (`fetch` ligero al backend) antes de marcar la conexión como
disponible, para evitar falsos positivos de redes cautivas o conexiones
intermitentes. Al confirmarse la conexión, se procesa la cola completa una
vez; si una sincronización individual falla por timeout, se reintenta con
backoff exponencial acotado (reintentos limitados, visibles al usuario como
"pendiente", nunca silenciosamente descartados).

**Rationale**: `navigator.onLine` por sí solo es conocido por dar falsos
positivos (indica "conectado" incluso sin acceso real a internet); una
verificación activa contra el propio backend confirma que la ruta completa
app→backend→ERPNext es alcanzable antes de intentar sincronizar.

**Alternatives considered**:
- *Solo `navigator.onLine`*: se descartó por su tasa conocida de falsos
  positivos, que generaría intentos de sincronización fallidos y una
  experiencia confusa para el usuario.

## Presentar y cancelar un Purchase Order (Fase 4)

**Decision**: `PUT /api/resource/Purchase Order/<name>` con cuerpo
`{"docstatus": 1}` para presentar y `{"docstatus": 2}` para cancelar, usando
el mismo endpoint genérico de recursos que el resto de la integración (no un
método dedicado de Frappe).

**Rationale**: Confirmado empíricamente contra la instancia real de ERPNext
desplegada en Fase 3: el endpoint genérico de actualización, al recibir un
cambio de `docstatus`, dispara la validación y transición de estado normal
de ERPNext (incluida la verificación de datos obligatorios al presentar, y
el `LinkExistsError` al cancelar una orden con un recibo de compra
**presentado** vinculado). No fue necesario `/api/method/frappe.client.submit`
ni ningún método adicional.

**Alternatives considered**:
- *`POST /api/method/frappe.client.submit` con el documento completo*: no se
  probó porque la alternativa más simple (PUT con `docstatus`) funcionó al
  primer intento y es consistente con el resto del cliente (`ErpNextClient`
  ya tenía `createResource`/`getResource`/`listResource` sobre `/api/resource`,
  así que añadir `updateResource` sobre el mismo endpoint genérico evita un
  segundo estilo de llamada).

**Verificado en vivo**: creación, presentación y cancelación de una orden sin
recibo vinculado (`PUR-ORD-2026-00010`); edición de un borrador vía `PUT` con
`items` (`PUR-ORD-2026-00011`). La cancelación bloqueada por `LinkExistsError`
(409) **no** se reprodujo en vivo porque requiere un Purchase Receipt
**presentado** vinculado, y el recibo de prueba no pudo presentarse por el
hallazgo de "Fiscal Year" de más abajo; el mapeo 409/`LinkExistsError` ya
estaba cubierto por `ErpNextErrorTranslatorTest` (prueba unitaria existente)
y es el mismo código que usan `submit`/`cancel`, por lo que no es una ruta
nueva sin probar, solo sin reproducir end-to-end contra ERPNext real en esta
fase.

## Creación de un Purchase Receipt desde una Purchase Order (Fase 4, confirmación empírica)

**Decision confirmada**: el endpoint genérico `POST /api/resource/Purchase Receipt`
sí acepta `items[].purchase_order` y `items[].purchase_order_item` (el `name`
real del renglón de la Purchase Order) exactamente como se documentó como
decisión de partida; no fue necesario `make_purchase_receipt`. Verificado en
vivo: el documento creado (`MAT-PRE-2026-00001`) quedó correctamente
vinculado (`purchase_order: "PUR-ORD-2026-00009"`,
`purchase_order_item: "rvpgi3oqgi"`).

**Resolución del renglón de origen de un Purchase Receipt**: el contrato
(`contracts/backend-api.md`) pide `sourceOrderLineRef` por renglón, pero el
`name` interno de un `Purchase Order Item` (p. ej. `rvpgi3oqgi`) es un
identificador opaco generado por ERPNext que el frontend nunca recibe (la
respuesta de `POST`/`PUT /api/purchase-orders` no lo expone, solo
`itemRef`/`quantity`/`unitPrice`/`receivedQuantity`). El backend por lo tanto
resuelve el renglón real haciendo `GET` a la Purchase Order referenciada y
buscando, por cada línea solicitada, el `item_code` que coincide con
`itemRef`; si además `sourceOrderLineRef` coincide con el `name` real de esa
misma fila (y solo si ambos coinciden a la vez), se usa esa coincidencia
exacta en lugar de la primera por `item_code` — así, si el frontend llega a
conocer el `name` real en el futuro (por ejemplo si se decide exponerlo en el
contrato), el backend ya lo prioriza sin cambios; mientras tanto, el valor
que el frontend envíe en `sourceOrderLineRef` es tratado como opaco y no se
valida su formato. **Limitación conocida de esta implementación**: si una
orden tuviera dos renglones con el mismo `item_code` (no ocurre con los
catálogos de prueba de esta demo, que no repiten artículos por orden), la
resolución por `item_code` tomaría el primero; no se resolvió una
desambiguación más fina por quedar fuera del alcance de esta demo.

**Confirmación de validación de cantidad**: `Stock Settings.over_delivery_receipt_allowance`
es `0` en esta instancia (sin tolerancia de sobre-recepción), consistente con
la validación `QUANTITY_EXCEEDS_BALANCE` que el backend aplica *antes* de
llamar a ERPNext.

**Creación y presentación en un solo paso**: el backend crea el Purchase
Receipt como borrador y **lo presenta de inmediato** (mismo mecanismo
`PUT .../docstatus: 1` que Purchase Order) dentro de la misma operación de
`POST /api/purchase-receipts`, antes de responder al cliente. **Confirmado
en vivo que esto es necesario**: un Purchase Receipt en borrador (`docstatus
0`) no actualiza `received_qty` en la Purchase Order ni afecta el inventario;
solo la presentación (`docstatus 1`) dispara `update_prevdoc_status()` en
ERPNext, que sí recalcula el saldo. Sin este paso, `orderBalance` (FR-014)
quedaría siempre igual al saldo antes del recibo.

**Limitación conocida de idempotencia (crear-y-presentar)**: si ERPNext
guarda el Purchase Receipt (borrador) pero la llamada de presentación
subsecuente falla (verificado en vivo: ocurrió por el hallazgo de "Fiscal
Year" de más abajo), el documento queda en ERPNext en borrador
permanentemente. Un reintento con la misma `idempotencyKey` lo **recupera**
tal cual (en borrador, sin duplicarlo — se confirmó en vivo que
`createResource` no se vuelve a llamar), pero el backend actual no reintenta
automáticamente la presentación pendiente. Esto cumple la garantía central
de la Fase 2/Principio II (nunca se duplica el documento ni su efecto en
inventario), pero no repara por sí solo un recibo que quedó "a medias"; se
deja documentado como mejora futura (reintentar la presentación si se
recupera un documento con `docstatus = 0`) en lugar de resolverse en esta
fase, dado que el bloqueo real encontrado fue de infraestructura (ver
siguiente hallazgo), no de lógica de la aplicación.

**Hallazgo bloqueante de infraestructura — Fiscal Year ausente**: esta
instancia de ERPNext no tiene ningún registro de `Fiscal Year` (`GET
/api/resource/Fiscal Year` devuelve una lista vacía). Presentar un Purchase
Receipt genera asientos de inventario/contables que ERPNext valida contra un
año fiscal activo para la fecha de contabilización; sin uno, la presentación
falla con `"Date <fecha> is not in any active Fiscal Year for <company>"`
(mapeado por el backend como `ERPNEXT_VALIDATION_ERROR` 400, correctamente
traducido pero no es el problema real). Esto **no bloquea** Purchase Order
(crear/editar/presentar/cancelar), que no genera asientos contables. El
usuario de integración (`ERPNEXT_API_KEY`) tampoco tiene permiso de rol para
leer `Company` ni `Warehouse` directamente (solo se pudo determinar el
almacén por defecto, `Almacen Central - OCD`, indirectamente vía
`Item.item_defaults`), por lo que no fue posible ni crear el `Fiscal Year`
ni diagnosticar más a fondo con las credenciales del backend. **Se necesita
que alguien con credenciales de Administrador de ERPNext cree un Fiscal Year
que cubra la fecha actual** (y revise si el usuario de integración debería
tener permiso de lectura sobre `Warehouse`, usado por el nuevo endpoint
`GET /api/catalog/warehouses`) antes de poder verificar en vivo, de punta a
punta, la presentación de un Purchase Receipt y el bloqueo de cancelación
por `LinkExistsError`.

## Permiso de lectura de Warehouse y Company para el usuario de integración (ajuste de infraestructura, 18 de noviembre)

**Hallazgo confirmado empíricamente**: el usuario de integración
(`integration@omnia-compras.local`, roles originales `Purchase Manager` +
`Stock Manager`) recibía `403 PermissionError` ("does not have doctype
access via role permission") al leer `Warehouse` y `Company` vía
`GET /api/resource/...`, aunque podía leer `Supplier`, `Item`,
`Purchase Order`, `Purchase Receipt` y `Stock Settings` sin problema. Al
inspeccionar el `DocPerm`/`Custom DocPerm` real de esta instancia para
ambos DocTypes se confirmó que ni `Purchase Manager` ni `Stock Manager`
aparecen en la lista de roles con `read=1` para `Warehouse` ni para
`Company` (es un comportamiento estándar de ERPNext: estos roles de
"manager" no incluyen automáticamente el permiso de lectura de esos dos
DocTypes). En cambio, el rol `Purchase User` sí tiene `read=1` en ambos,
además de en `Supplier`, `Item`, `Purchase Order` y `Purchase Receipt` (sin
ampliar permisos de escritura más allá de los que `Purchase Manager` ya
otorga).

**Decision**: agregar el rol `Purchase User` al usuario de integración (no
una regla de permiso personalizada), por ser la opción más simple y
consistente con el patrón ya usado en
`infra/scripts/create-integration-user.sh` (asignar roles estándar de
ERPNext, no `Custom DocPerm` ad-hoc). `infra/scripts/create-integration-user.sh`
se actualizó para incluir `Purchase User` junto con `Purchase Manager` y
`Stock Manager`, de forma idempotente, para que un despliegue reproducido
desde cero ya incluya el permiso sin pasos manuales adicionales.

**Verificado en vivo (18 de noviembre, tras el reinicio de contenedores de
hoy)**:
- Antes del ajuste: `GET /api/resource/Warehouse` y
  `GET /api/resource/Company` devuelven `403`
  (`frappe.exceptions.PermissionError`) con las credenciales reales del
  usuario de integración.
- Tras agregar el rol `Purchase User` y confirmar con `frappe.db.commit()`
  (mismo cuidado que ya documentaba este archivo para `api_key`/`api_secret`,
  aquí aplicado a la tabla de roles del usuario): ambas llamadas devuelven
  `200 OK`. `Warehouse` lista los 5 almacenes esperados (incluido
  `Almacen Central - OCD`) y `Company` lista `Omnia Compras Demo`.
- `Fiscal Year` 2026 (creado manualmente el 17 de noviembre) y los datos
  ficticios (Company `Omnia Compras Demo`, 2 proveedores, 2 artículos,
  almacén `Almacen Central - OCD`) se confirmaron intactos tras el reinicio
  de contenedores de hoy: el volumen de `mariadb-primary` preservó el
  estado, como se esperaba, pero se verificó con consultas reales en vez de
  asumirlo.

**Consecuencia para `backend/`**: el hallazgo original de esta sección (más
abajo, "Hallazgo bloqueante de infraestructura — Fiscal Year ausente") ya no
aplica en la parte de permisos: `GET /api/catalog/warehouses` puede ahora
leer `Warehouse` con las credenciales reales del backend. No se tocó ningún
archivo de `backend/`; este ajuste vive enteramente en `infra/` (rol del
usuario de integración en ERPNext).

## Verificación en vivo del flujo completo de recibos (Fase 4, 18 de noviembre — tarde)

**Contexto**: con el `Fiscal Year` 2026 ya creado por el coordinador y el
permiso de `Purchase User` ya aplicado (sección anterior), se repitió en
vivo el flujo bloqueado el 17 de noviembre: crear orden, presentarla, crear
un recibo parcial, completar el saldo con un segundo recibo, intentar
cancelar una orden con un recibo presentado vinculado, y reintentar con la
misma `idempotencyKey` un recibo ya creado.

**Resultados verificados en vivo**:
- `POST /api/purchase-orders` crea `PUR-ORD-2026-00015` (`201`, `draft`).
- `POST /api/purchase-orders/PUR-ORD-2026-00015/submit` la presenta (`200`,
  `submitted`). El hallazgo de `Fiscal Year` del 17 de noviembre ya no
  bloquea esta parte (nunca la bloqueó directamente; afecta solo a
  Purchase Receipt, ver más abajo).
- `POST /api/purchase-receipts` para 4 de 10 unidades devuelve `400`
  `ERPNEXT_VALIDATION_ERROR` con `erpnextDetail: "Please set default Stock
  Received But Not Billed in Company Omnia Compras Demo"` — **un hallazgo
  bloqueante nuevo, distinto al de Fiscal Year** (ver sección siguiente).
- A pesar del error, ERPNext sí conservó un Purchase Receipt en borrador
  (`MAT-PRE-2026-00003`, `docstatus 0`, `custom_idempotency_key` poblado):
  esto confirma en vivo, por primera vez, la "Limitación conocida de
  idempotencia (crear-y-presentar)" ya documentada arriba como hallazgo
  teórico del 17 de noviembre.
- Reintentar `POST /api/purchase-receipts` con la **misma** `idempotencyKey`
  devolvió `200` con el mismo `erpnextName: "MAT-PRE-2026-00003"` (no se creó
  un segundo documento) — confirmado también consultando ERPNext
  directamente (`GET /api/resource/Purchase Receipt?filters=[["custom_idempotency_key","=","<key>"]]`
  devuelve exactamente un registro). La recuperación no reintenta la
  presentación pendiente (comportamiento ya documentado, no un bug nuevo):
  por eso `orderBalance` en la respuesta recuperada sigue mostrando el
  saldo completo (10), no 6.
- `POST /api/purchase-orders/PUR-ORD-2026-00015/cancel` con el recibo
  **en borrador** (no presentado) todavía vinculado devolvió `200`
  (`cancelled`), **sin** bloqueo. Esto confirma que el `LinkExistsError`
  (409) documentado el 17 de noviembre requiere específicamente un
  documento vinculado **presentado** (`docstatus 1`); un vínculo en
  borrador no es suficiente para que ERPNext bloquee la cancelación de la
  orden.

**No se pudo verificar en vivo** (bloqueado por el hallazgo nuevo de abajo,
no por código del backend): la presentación exitosa de un Purchase Receipt,
el recálculo real de `orderBalance` tras un recibo presentado, un segundo
recibo completando el saldo a 0, el bloqueo de cancelación por
`LinkExistsError` con un recibo **presentado**, y el reintento de
idempotencia de un recibo ya presentado con éxito. Todas estas rutas de
código ya estaban cubiertas por pruebas unitarias (`PurchaseReceiptServiceTest`,
`ErpNextErrorTranslatorTest`) antes de este intento; lo que falta es solo la
confirmación end-to-end contra ERPNext real, pendiente de que se resuelva el
hallazgo siguiente.

## Hallazgo bloqueante de infraestructura — cuentas contables por defecto de la Company sin configurar (18 de noviembre)

**Hallazgo**: `Company "Omnia Compras Demo"` tiene `enable_perpetual_inventory: 1`
pero ninguna de las cuentas contables por defecto que ERPNext exige para
contabilizar un Purchase Receipt bajo inventario perpetuo está configurada:
`default_inventory_account`, `stock_received_but_not_billed`,
`default_cost_center`/`cost_center`, `stock_adjustment_account`,
`round_off_account` y `write_off_account` están todos vacíos (confirmado con
`GET /api/resource/Company/Omnia Compras Demo` solicitando esos campos
explícitamente). Solo `default_receivable_account` y
`default_payable_account` están configurados. La cuenta que el primer error
pide (`Stock Received But Not Billed - OCD`) ya **existe** en el plan de
cuentas de la Company (confirmado con `GET /api/resource/Account?filters=[["company","=","Omnia Compras Demo"],["account_type","=","Stock Received But Not Billed"]]`),
solo falta vincularla como valor por defecto en el documento `Company`.

**Por qué no lo corrigió el backend**: esto es configuración maestra de
ERPNext (el documento `Company`), no un payload del backend ni un Custom
Field de esta integración; corresponde a la misma categoría que el
`Fiscal Year` ausente del 17 de noviembre (alguien con credenciales de
Administrador debe completarlo desde la UI de ERPNext o vía API con un
usuario con permiso de escritura sobre `Company`, que el usuario de
integración del backend no tiene ni debería tener). Un intento de corregirlo
vía la API del usuario de integración desde este backend fue
intencionalmente no realizado por quedar fuera del alcance de `backend/`
(cambiar configuración contable de la Company es una decisión de negocio/
infraestructura, no de la integración).

**No bloquea** Purchase Order (crear/editar/presentar/cancelar), que no
contabiliza inventario. **Sí bloquea** cualquier intento de presentar un
Purchase Receipt mientras no se complete: el backend seguirá creando el
borrador correctamente, pero el `PUT .../docstatus: 1` interno fallará con
`ERPNEXT_VALIDATION_ERROR` (400) hasta que la Company tenga, como mínimo,
`default_inventory_account`, `stock_received_but_not_billed` y un
`cost_center` por defecto configurados (ERPNext suele pedir las cuentas una
por una conforme se corrige cada error, por lo que puede haber más de una
ronda de ajustes antes de que la presentación tenga éxito).

**Resuelto (18 de noviembre, más tarde el mismo día)**: el coordinador
completó la configuración contable de la Company directamente (`bench
console`, con `frappe.db.commit()` explícito, mismo cuidado que los
ajustes anteriores): llamó al método propio de ERPNext
`Company.create_default_cost_center()` (creó `Main - OCD` y lo fijó como
`cost_center`) y fijó por `db_set` las cuentas ya existentes en el plan de
cuentas: `default_inventory_account = "Stock In Hand - OCD"`,
`stock_received_but_not_billed = "Stock Received But Not Billed - OCD"`,
`stock_adjustment_account = "Stock Adjustment - OCD"`,
`round_off_account = "Round Off - OCD"`, `write_off_account = "Write Off - OCD"`
(no existe un campo `default_cost_center` en este DocType, solo `cost_center`,
que ya quedó cubierto por `create_default_cost_center()`).

**Verificación real de punta a punta** (orden nueva, no el recibo huérfano
`MAT-PRE-2026-00003` de la ronda anterior, que quedó inservible porque su
orden ya estaba cancelada): `PUR-ORD-2026-00023` creada y presentada,
`MAT-PRE-2026-00009` creado y presentado con 4 de 10 unidades,
`received_qty` de la orden actualizado correctamente a 4/10. Además, con
esta orden y este recibo (ambos presentados, no en borrador) se reprodujo
por primera vez el bloqueo de cancelación esperado:
`LinkExistsError: Cannot delete or cancel because Purchase Order
PUR-ORD-2026-00023 is linked with Purchase Receipt MAT-PRE-2026-00009` —
confirma en vivo el mapeo 409 `ERPNEXT_CONFLICT` del backend contra un
caso real, no solo contra el mock de la prueba unitaria.

**Reproducibilidad (resuelto)**: `infra/scripts/seed-demo-data.sh` ya
automatiza estos tres pasos (`create_default_cost_center()` + los 5
`db_set` de cuentas por defecto), de forma idempotente, para que un
despliegue desde cero quede listo para presentar un Purchase Receipt sin
pasos manuales.

## Catálogo de almacenes (Fase 4, no documentado originalmente en el contrato)

**Decision**: se agregó `GET /api/catalog/warehouses` (respaldado por `GET
/api/resource/Warehouse`), análogo a `/suppliers` e `/items`, aunque
`contracts/backend-api.md` solo documentaba Supplier e Item.

**Rationale**: `PurchaseReceiptLineRequest.warehouseRef` (FR-012,
`data-model.md`) requiere que el frontend conozca un nombre de almacén real
de ERPNext; `spec.md` Assumptions garantiza que existe exactamente uno
**no-grupo** para esta demo, pero ese nombre (`Almacen Central - OCD`) es
un dato real del sitio, no algo que el frontend deba adivinar o hardcodear.
Formalizado en `contracts/backend-api.md` (`GET /api/catalog/warehouses`) y
`data-model.md` (entidad `CatalogWarehouse`).

**Ajuste encontrado al probar en vivo con el frontend real (18 de
noviembre)**: la primera versión de `listWarehouses()` devolvía TODOS los
`Warehouse`, incluidos los nodos de grupo del árbol (p. ej.
`All Warehouses - OCD`). ERPNext acepta leerlos, pero **rechaza usarlos
como almacén de una transacción** (`Group node warehouse is not allowed to
select for transactions`) — el formulario de recibo del frontend tomaba el
primer almacén de la lista sin saber que podía ser un grupo. Corregido
filtrando `is_group=0` en el backend (`ErpNextClient.listResourceWithFields`
ganó un parámetro de filtros de igualdad, reutilizable por otros catálogos
si hiciera falta). Verificado en vivo: `GET /api/catalog/warehouses` ahora
solo devuelve los 4 almacenes hoja del sitio (incluido `Almacen Central -
OCD`), y la suite completa de Playwright (`receipts.spec.ts`,
`retry-idempotency.spec.ts`) pasa de punta a punta contra ERPNext real.

## Formato de errores traducidos (backend → frontend)

**Decision**: El backend responde los errores de integración con un cuerpo
JSON consistente: `{"errorCode": "<código interno estable>", "message":
"<mensaje en español listo para mostrar>", "erpnextDetail": "<detalle
técnico original, solo para logs/depuración>"}`. El frontend muestra
siempre `message`; `erpnextDetail` nunca se renderiza directamente en la UI
(se registra en consola/logs si se necesita depurar).

**Rationale**: Separar el mensaje para el usuario del detalle técnico
permite cumplir el Principio V (errores comprensibles) sin perder la causa
raíz que exige el Principio VI (trazabilidad) para depuración.
