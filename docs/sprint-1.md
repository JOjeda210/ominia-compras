# Sprint 1 — Captura y primer borrador

## Objetivo
Cerrar el sprint con una orden de compra capturada sin conexión y sincronizada
automáticamente en ERPNext como borrador, sobre una infraestructura
reproducible con réplica GTID verificada.

## Alcance
1. Definir primero el contrato de datos app ↔ backend (endpoints, payloads,
   estados, clave de idempotencia, formato de errores) — bloquea el resto.
2. Infra: despliegue de ERPNext con Docker Compose a partir de
   `frappe/frappe_docker`, sitio de laboratorio con datos ficticios (Company,
   Warehouse, Supplier, Item con inventario y UoM), usuario de integración con
   API Key/Secret, réplica MariaDB con GTID por red privada de Docker,
   verificación Yes/Yes con 0 s de retraso.
3. Backend: lectura de catálogos (Supplier, Item) y creación/actualización de
   Purchase Order como borrador, con idempotencia.
4. Frontend: PWA con Dexie para catálogos y borradores, captura offline, cola
   de sincronización con envío automático al recuperar la red.
5. Prueba integrada Playwright: orden creada sin red → sincronizada como
   borrador en ERPNext al volver la red.

Trabajo en paralelo: infra arranca primero (ERPNext tarda en levantar);
backend y frontend avanzan en paralelo contra el contrato ya definido.

## Revisión del incremento

Incremento demostrado con evidencia real (no simulada):

- **Infra**: ERPNext v15.47.0 + MariaDB 10.6 desplegados con Docker Compose a
  partir de `frappe/frappe_docker`, primario y réplica en red privada,
  volúmenes separados. Replicación GTID verificada (`Slave_IO_Running: Yes`,
  `Slave_SQL_Running: Yes`, `Seconds_Behind_Master: 0`). Orden de prueba
  creada en el primario y confirmada con el mismo folio en la réplica.
  Despliegue completo cronometrado en ~17 min (bajo el límite de 30 min de
  SC-001). Sitio de laboratorio con Company, Warehouse, Suppliers e Items
  ficticios, y Custom Field `custom_idempotency_key` en Purchase Order y
  Purchase Receipt.
- **Backend**: catálogos (`GET /api/catalog/suppliers|items`) y creación
  idempotente de Purchase Order (`POST /api/purchase-orders`), probados
  contra el ERPNext real: una misma `idempotencyKey` enviada dos veces
  devolvió el mismo folio (`PUR-ORD-2026-00002`) y se confirmó en ERPNext que
  existe un único documento — Principio II cumplido con evidencia, no solo
  con pruebas unitarias (12/12 también en verde).
- **Frontend**: captura offline (crear, editar cantidad, reabrir sin red,
  descartar otra captura) y sincronización automática al reconectar,
  probadas con Playwright contra el stack real (infra + backend + ERPNext):
  `Historia 1` en 3.6 s, `Historia 2` en 4.3 s (bajo el límite de 10 s de
  SC-003), ambas en verde.
- **Cierre del sprint**: se repitió el flujo completo manualmente en el
  navegador — orden creada sin conexión, reconexión, sincronización
  automática sin pulsar ningún botón, folio visible en la app y en ERPNext
  con el mismo proveedor y cantidad.

## Retrospectiva

**Qué funcionó bien**
- Delegar infra/backend/frontend a subagentes en paralelo (contra un
  contrato ya cerrado en Fase 2) permitió que los tres avanzaran sin
  bloquearse entre sí; solo la prueba de integración final necesitó el stack
  completo arriba.
- Probar contra ERPNext real, no contra mocks, sacó a la luz problemas reales
  temprano en vez de en producción: el PDF ya anticipaba esto ("identificar
  los campos, estados y permisos que necesita la app").

**Qué no salió a la primera (y cómo se resolvió)**
- El build de Maven (`mvnw`) quedó bloqueado por el clasificador de permisos
  del modo automático en dos intentos del subagente `backend`; se resolvió
  teniendo al usuario corriendo el build directamente en su propia terminal.
- Cuatro bugs de integración reales, encontrados solo al probar en vivo:
  1. ERPNext exige el campo `company` en Purchase Order — no estaba en el
     contrato original ni en el payload del backend. Se agregó
     `ERPNEXT_DEFAULT_COMPANY` como configuración del backend.
  2. Desfase de huso horario entre la JVM del backend (hora local) y el
     contenedor de ERPNext (UTC): `schedule_date` quedaba un día antes de
     `transaction_date` en ciertas horas del día. Se corrigió enviando
     `transaction_date` explícito con el mismo valor que `schedule_date`.
  3. Faltaba configurar CORS en el backend para que el frontend (otro
     origen/puerto) pudiera llamarlo desde el navegador — se agregó
     `CorsConfig.java` acotado a `/api/**`.
  4. El frontend apuntaba por defecto al puerto 8080 (ocupado por ERPNext);
     el backend real quedó en 8081 — hubo que fijar `VITE_BACKEND_URL` y
     `BACKEND_PORT` explícitamente en los `.env` de cada carpeta.
- Dos sesiones de Claude Code coordinando en paralelo sobre el mismo
  subagente llevó a confusión momentánea (el coordinador perdió la
  referencia al subagente `backend` cuando la sesión original se reinició);
  el trabajo en disco no se perdió, solo el hilo de conversación con ese
  subagente específico.
- El estrangulamiento "Desconectado" del panel de Red del navegador no
  bloquea peticiones a `localhost` en varios navegadores; para probar
  desconexión real contra un backend local hay que detener el proceso del
  backend o usar una prueba automatizada (Playwright `context.setOffline`),
  no el DevTools del navegador.

**Para el Sprint 2**
- Repetir el patrón de probar cada endpoint nuevo contra ERPNext real apenas
  esté escrito, no al final, para encontrar requisitos de campos obligatorios
  (como `company`) lo antes posible.
- Documentar desde ya en `research.md`/contrato cualquier campo nuevo que
  ERPNext exija al implementar recibos de compra, para no repetir el mismo
  ciclo de descubrimiento tardío.
