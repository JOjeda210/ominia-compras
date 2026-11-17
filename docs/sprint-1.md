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
_Pendiente — se completa al cerrar la Fase 3._

## Retrospectiva
_Pendiente — se completa al cerrar la Fase 3._
