# Feature Specification: Compras offline con sincronización a ERPNext

**Feature Branch**: `001-compras-offline-sync`

**Created**: 2026-11-17

**Status**: Draft

**Input**: User description: "App de compras offline-first para capturar, sincronizar, editar, cancelar y recibir órdenes de compra contra ERPNext."

## Clarifications

### Session 2026-11-17

- Q: ¿"Comprador" y "almacenista" son la misma persona/rol usando la misma app, o son dos roles distintos con permisos diferentes? → A: Es el mismo rol/usuario único; la app no diferencia permisos entre capturar órdenes y registrar recibos.
- Q: ¿"Sincronizada" es un estado transitorio distinto de "borrador-ERPNext", o es solo otro nombre para lo mismo? → A: Es el mismo estado; "sincronizada" es únicamente la palabra de UI para una orden que ya tiene folio (borrador-ERPNext o posterior), no hay un estado intermedio "enviándose".
- Q: Si una orden en la cola es rechazada por ERPNext por una razón real (no por pérdida de respuesta), ¿debe bloquear la sincronización de las demás órdenes pendientes? → A: No; la cola procesa cada orden de forma independiente. Una orden rechazada queda marcada con su error y las demás siguen sincronizándose con normalidad.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Captura offline (Priority: P1)

Un comprador, con proveedores y artículos de prueba ya disponibles en su
dispositivo, corta la conexión a internet, crea una orden de compra, modifica
cantidades y vuelve a abrir la app todavía sin conexión.

**Why this priority**: Es la base de todo el sistema: si la captura offline
no es confiable, ningún otro flujo importa. Sin esta historia no hay producto.

**Independent Test**: Puede probarse por completo sin conexión a internet:
crear una orden, editarla, cerrar y reabrir la app, y verificar que la última
versión capturada sigue ahí marcada como pendiente.

**Acceptance Scenarios**:

1. **Given** la app tiene catálogos de proveedores y artículos ya
   descargados y no hay conexión de red, **When** el comprador crea una
   orden de compra con uno o más artículos, **Then** la orden queda guardada
   localmente y marcada como "pendiente".
2. **Given** una orden pendiente guardada sin conexión, **When** el
   comprador modifica una cantidad y cierra la app sin haber recuperado la
   red, **Then** al reabrir la app todavía sin conexión, la orden muestra la
   cantidad editada, no la original.
3. **Given** dos o más órdenes pendientes en la cola local, **When** el
   comprador descarta una de ellas con confirmación explícita, **Then** esa
   orden desaparece de la cola de envío y no se sincroniza cuando vuelva la
   red.

---

### User Story 2 - Sincronización automática (Priority: P2)

Con la app abierta y la red restablecida, cada orden pendiente se envía a
ERPNext sin que el usuario pulse ningún botón, y si la respuesta del primer
intento se pierde, un reintento recupera el mismo documento en vez de
duplicarlo.

**Why this priority**: Es lo que convierte una captura local en un
documento real de negocio. Sin sincronización automática y sin protección
contra duplicados, la captura offline de la Historia 1 no tiene valor.

**Independent Test**: Puede probarse creando una orden sin red, restableciendo
la red y observando que llega a ERPNext como borrador sin ninguna acción
manual; y por separado, simulando una respuesta perdida y comprobando que el
reintento no crea un segundo documento.

**Acceptance Scenarios**:

1. **Given** una orden pendiente creada sin conexión, **When** la app
   recupera la conexión de red mientras sigue abierta, **Then** la orden se
   envía automáticamente a ERPNext y pasa a estado "borrador-ERPNext" con un
   folio visible, sin que el usuario haya pulsado ningún botón de
   sincronizar.
2. **Given** una orden que el usuario editó varias veces sin conexión,
   **When** se sincroniza al recuperar la red, **Then** la versión que llega
   a ERPNext es la última edición, no una intermedia.
3. **Given** que ERPNext ya guardó una orden pero la respuesta al cliente se
   perdió (por ejemplo, un corte de red justo después de guardar),
   **When** el cliente reintenta el envío con la misma clave de
   idempotencia, **Then** el sistema recupera el folio ya creado en vez de
   generar una segunda orden.

---

### User Story 3 - Edición y cancelación (Priority: P3)

Con conexión, el comprador edita un borrador ya sincronizado y cancela una
orden presentada cuando corresponde, viendo siempre el estado real que
reporta ERPNext y una explicación comprensible ante cualquier bloqueo.

**Why this priority**: Una orden capturada rara vez es definitiva a la
primera; el comprador necesita poder corregirla o cancelarla sin perder la
trazabilidad del folio.

**Independent Test**: Puede probarse editando un borrador ya sincronizado y
verificando que el mismo folio se actualiza en ERPNext; y cancelando una
orden presentada sin recibos vinculados, verificando el nuevo estado.

**Acceptance Scenarios**:

1. **Given** un borrador ya sincronizado con un folio de ERPNext, **When**
   el comprador edita una cantidad con conexión, **Then** ERPNext actualiza
   ese mismo documento (mismo folio), no uno nuevo.
2. **Given** una orden presentada sin recibos vinculados, **When** el
   comprador solicita cancelarla, **Then** la app pide una confirmación
   explícita antes de ejecutar la cancelación y, al confirmar, el estado
   final mostrado es el que reporta ERPNext.
3. **Given** una orden presentada con un recibo de compra vinculado,
   **When** el comprador intenta cancelarla, **Then** la app explica en
   lenguaje comprensible el motivo del bloqueo reportado por ERPNext, sin
   mostrar un código de error técnico sin traducir.

---

### User Story 4 - Recibo de compra (Priority: P4)

Desde una orden presentada y pendiente de recibir, el almacenista captura
las cantidades recibidas por artículo y almacén, y registra un recibo de
compra vinculado a la orden de origen.

**Why this priority**: Cierra el ciclo de compra: sin registrar la
recepción, la orden nunca refleja que la mercancía efectivamente llegó.

**Independent Test**: Puede probarse presentando una orden en ERPNext,
registrando un recibo desde la app con conexión y verificando en ERPNext que
el recibo quedó vinculado a la orden y a su renglón.

**Acceptance Scenarios**:

1. **Given** una orden presentada y pendiente de recibir, **When** el
   almacenista captura una cantidad recibida por artículo y almacén y
   confirma el recibo con conexión, **Then** el recibo se crea en ERPNext
   vinculado a la orden y a su renglón original.
2. **Given** un recibo recién creado, **When** la app muestra el resultado,
   **Then** se ve el folio del recibo y el saldo pendiente actualizado de la
   orden.

---

### User Story 5 - Recepción parcial y cierre (Priority: P5)

El almacenista recibe una orden de 10 unidades en dos partes: primero 4,
luego las 6 restantes, y verifica que ERPNext refleja ambos recibos y un
saldo final en cero sin duplicar inventario.

**Why this priority**: Las recepciones parciales son el caso real más común
en compras; validar que el saldo y el inventario se calculan correctamente
en más de un recibo es necesario para confiar en el sistema.

**Independent Test**: Puede probarse de principio a fin con una sola orden
de 10 unidades, registrando dos recibos sucesivos y comprobando el saldo en
la app y en ERPNext después de cada uno.

**Acceptance Scenarios**:

1. **Given** una orden presentada de 10 unidades sin recibos previos,
   **When** el almacenista registra un recibo de 4 unidades, **Then** la
   app y ERPNext muestran un saldo pendiente de 6 unidades.
2. **Given** la misma orden con 6 unidades pendientes, **When** el
   almacenista registra un segundo recibo por las 6 restantes, **Then** la
   app y ERPNext muestran un saldo pendiente de 0 y existen exactamente dos
   recibos vinculados a la orden, con las cantidades y el almacén
   correspondientes.

---

### User Story 6 - Reintentos sin duplicados (Priority: P6)

Toda captura de orden o solicitud de recepción lleva una clave estable
generada por el cliente, de modo que un reintento tras una respuesta
perdida recupera el documento ya creado en vez de registrar uno nuevo.

**Why this priority**: Es una garantía transversal que protege a las
Historias 2, 4 y 5 de duplicar documentos o inventario ante fallas de red;
se separa como historia propia porque se prueba explícitamente de forma
aislada para ambos tipos de documento.

**Independent Test**: Puede probarse simulando, por separado para una orden
y para un recibo, que ERPNext guarda el documento pero la respuesta al
cliente se pierde, y verificando que el reintento con la misma clave
recupera el folio existente.

**Acceptance Scenarios**:

1. **Given** una solicitud de creación de orden cuya respuesta se pierde
   después de que ERPNext ya guardó el documento, **When** el cliente
   reintenta con la misma clave de idempotencia, **Then** ERPNext devuelve
   el folio ya existente y no existe una segunda orden con los mismos datos.
2. **Given** una solicitud de recepción cuya respuesta se pierde después de
   que ERPNext ya guardó el recibo, **When** el cliente reintenta con la
   misma clave de idempotencia, **Then** ERPNext devuelve el folio del
   recibo ya existente y no se duplica la entrada de inventario.

---

### Edge Cases

- ¿Qué pasa si el comprador edita la misma orden pendiente varias veces sin
  conexión antes de tener oportunidad de sincronizar? Debe prevalecer
  siempre la última edición local.
- ¿Qué pasa si la conexión se pierde a mitad de la sincronización de una
  orden? Al recuperar la red, el sistema debe reintentar con la misma clave
  de idempotencia sin duplicar el documento.
- ¿Qué pasa si el almacenista intenta registrar un recibo por una cantidad
  mayor al saldo pendiente de la orden? El sistema debe prevenir el envío o
  mostrar de forma comprensible el rechazo de ERPNext.
- ¿Qué pasa si el comprador intenta cancelar una orden que ya tiene un
  recibo vinculado? ERPNext bloquea la cancelación y el motivo se explica en
  la interfaz, sin un código de error crudo.
- ¿Qué pasa si dos solicitudes de recepción para la misma orden se generan
  casi al mismo tiempo (por ejemplo, justo tras reconectar)? Cada solicitud
  debe llevar su propia clave de idempotencia y no debe mezclar cantidades
  entre ellas.
- ¿Qué pasa si ERPNext rechaza una orden de la cola por una razón real (no
  por pérdida de respuesta), como un dato obligatorio faltante? Esa orden
  queda marcada con su error comprensible, pero no bloquea la
  sincronización de las demás órdenes pendientes en la cola.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE permitir crear una orden de compra sin
  conexión a partir de catálogos de proveedores y artículos ya descargados
  localmente.
- **FR-002**: El sistema DEBE conservar siempre la versión más reciente de
  una orden editada localmente sin conexión, incluso después de cerrar y
  reabrir la app todavía sin red.
- **FR-003**: El sistema DEBE marcar visualmente toda orden no sincronizada
  como "pendiente".
- **FR-004**: Los usuarios DEBEN poder descartar una captura pendiente con
  una confirmación explícita, lo que la remueve de la cola de envío.
- **FR-005**: El sistema DEBE sincronizar automáticamente, sin acción manual
  del usuario, toda orden pendiente en cuanto detecta conexión de red
  disponible, procesando cada orden de la cola de forma independiente: el
  rechazo de una orden por parte de ERPNext no debe impedir que las demás
  órdenes pendientes continúen sincronizándose.
- **FR-006**: El sistema DEBE crear la orden sincronizada en ERPNext en
  estado borrador, conservando el folio asignado por ERPNext para ediciones
  futuras del mismo documento.
- **FR-007**: El sistema DEBE asignar una clave de idempotencia estable,
  generada en el cliente antes del primer intento de envío, a cada captura
  de orden y a cada solicitud de recepción.
- **FR-008**: Ante un reintento con la misma clave de idempotencia, el
  sistema DEBE recuperar el documento ya creado en ERPNext en lugar de crear
  uno nuevo, tanto para órdenes como para recibos.
- **FR-009**: Los usuarios DEBEN poder editar, con conexión, un borrador ya
  sincronizado, de forma que se actualice el mismo documento en ERPNext
  (mismo folio).
- **FR-010**: Los usuarios DEBEN poder cancelar una orden presentada,
  mediante una confirmación explícita antes de ejecutar la acción.
- **FR-011**: El sistema DEBE reflejar en la interfaz el estado que
  determine ERPNext para una orden (borrador, presentada, cancelada), y
  explicar en lenguaje comprensible cualquier bloqueo que ERPNext reporte
  (por ejemplo, una cancelación bloqueada por un recibo vinculado).
- **FR-012**: Los usuarios DEBEN poder registrar, con conexión, un recibo de
  compra desde una orden presentada y pendiente de recibir, capturando
  cantidad por artículo y almacén.
- **FR-013**: El sistema DEBE vincular cada recibo de compra a su orden de
  origen y al renglón específico recibido.
- **FR-014**: El sistema DEBE mostrar, tras registrar un recibo, su folio y
  el saldo pendiente actualizado de la orden.
- **FR-015**: El sistema DEBE permitir registrar más de un recibo sobre la
  misma orden hasta que el saldo pendiente llegue a cero, sin duplicar
  entradas de inventario entre recibos.
- **FR-016**: El sistema DEBE traducir cualquier error devuelto por ERPNext
  a un mensaje comprensible para el usuario, preservando la causa original
  para fines de diagnóstico.
- **FR-017**: El sistema DEBE capturar un precio unitario por renglón al
  crear o editar una orden de compra, de forma que el valor total de la
  orden en ERPNext refleje un costo real y no quede en cero.

### Key Entities *(include if feature involves data)*

- **Orden de compra local**: captura hecha por el usuario, con su clave de
  idempotencia, estado (pendiente / borrador-ERPNext / presentada /
  cancelada) y, una vez existe, el folio asignado por ERPNext.
  "Sincronizada" no es un estado adicional: es la forma en que la UI
  describe a una orden que ya salió de "pendiente" y tiene folio (es decir,
  que está en estado borrador-ERPNext o posterior).
- **Recibo de compra local**: solicitud de recepción con su propia clave de
  idempotencia, cantidades por artículo y almacén, referencia a la orden y
  al renglón de origen, y el folio de ERPNext una vez confirmado.
- **Catálogo de proveedores**: lista de proveedores descargada al
  dispositivo para poder capturar órdenes sin conexión.
- **Catálogo de artículos**: lista de artículos descargada al dispositivo,
  con su unidad de medida y si llevan control de inventario.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un usuario puede crear una orden de compra completa sin
  conexión en menos de 2 minutos usando solo catálogos ya descargados.
- **SC-002**: El 100% de las órdenes editadas sin conexión conservan la
  última edición del usuario al reabrir la app, incluso sin red.
- **SC-003**: Toda orden pendiente se sincroniza en ERPNext dentro de los 10
  segundos posteriores a recuperar la conexión, sin intervención del
  usuario.
- **SC-004**: Ningún reintento de sincronización, bajo ninguna condición de
  prueba (incluida la pérdida de respuesta tras un guardado exitoso),
  produce más de un documento por operación en ERPNext.
- **SC-005**: El 100% de los bloqueos o errores devueltos por ERPNext se
  muestran al usuario en un mensaje comprensible, sin códigos técnicos
  crudos.
- **SC-006**: Una recepción parcial (4 de 10) seguida de la recepción del
  saldo restante (6) deja el saldo pendiente en cero y exactamente dos
  recibos vinculados a la orden, sin duplicar entradas de inventario.

## Assumptions

- Un solo usuario y un solo dispositivo operan la app durante la prueba; no
  se evalúan conflictos de edición concurrente entre múltiples dispositivos.
  "Comprador" y "almacenista" son el mismo rol de usuario único: la app no
  diferencia permisos entre capturar/editar órdenes y registrar recibos.
- Los catálogos de proveedores y artículos ya existen en ERPNext y se
  descargan al dispositivo antes de iniciar la captura offline; la app no
  crea proveedores ni artículos nuevos.
- Existe una única empresa (Company) y un único almacén (Warehouse) para la
  demostración.
- Se asume que siempre existe una ventana de conectividad posterior a la
  captura offline para sincronizar; no se evalúa el comportamiento ante una
  pérdida de conectividad permanente.
- La autenticación de usuarios finales de la app no forma parte de esta
  prueba; se opera con un único usuario de prueba sin control de acceso
  adicional.
