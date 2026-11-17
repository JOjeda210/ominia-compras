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
