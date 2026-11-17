# Implementation Plan: Compras offline con sincronización a ERPNext

**Branch**: `001-compras-offline-sync` | **Date**: 2026-11-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-compras-offline-sync/spec.md`

## Summary

App web instalable (PWA) que permite capturar, editar y cancelar órdenes de
compra sin conexión, sincronizarlas automáticamente a ERPNext como borrador
al recuperar la red, y registrar recibos de compra (parciales y totales)
contra esas órdenes, todo protegido por una clave de idempotencia estable
para que ningún reintento duplique documentos en ERPNext. El frontend (React
+ TypeScript + Vite PWA + Dexie) nunca habla directo con ERPNext: toda
integración pasa por un backend Spring Boot que conserva las credenciales y
traduce los errores de ERPNext a mensajes comprensibles.

## Technical Context

**Language/Version**: TypeScript (frontend, Vite) y Java 21 LTS (Eclipse Adoptium Temurin, backend)

**Primary Dependencies**: Frontend: React, Vite (plugin PWA), Dexie (IndexedDB). Backend: Spring Boot 3.x, Spring Web (cliente HTTP hacia la API REST de ERPNext)

**Storage**: Dexie/IndexedDB en el cliente para catálogos, borradores locales y cola de sincronización. ERPNext/MariaDB es la fuente de verdad remota (fuera del alcance de esta feature; ver `002-infra-erpnext-replica`)

**Testing**: Playwright para los escenarios E2E de desconexión/reconexión (`e2e/`); pruebas unitarias con Vitest (frontend) y JUnit 5 (backend) para la lógica de idempotencia y traducción de errores

**Target Platform**: Navegador web moderno con soporte de Service Worker (PWA) + JVM 21 para el backend, todo en una sola máquina con Docker Desktop

**Project Type**: Aplicación web (frontend + backend separados, según Principio VIII de la constitución)

**Performance Goals**: Captura offline completa en <2 min (SC-001); sincronización automática en <10 s tras recuperar red (SC-003)

**Constraints**: Debe funcionar sin red durante la captura (offline-capable); ninguna escritura a ERPNext puede duplicarse ante reintentos (Principio II); las credenciales de ERPNext nunca llegan al frontend (Principio IV)

**Scale/Scope**: Catálogo pequeño (una empresa, un almacén, pocos proveedores/artículos); un solo usuario/dispositivo para la demostración (ver Assumptions de la spec)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Evaluación |
|---|---|
| I. Offline-first | PASA — FR-001/FR-002 exigen conservar la última captura local sin red |
| II. Idempotencia | PASA — FR-007/FR-008 exigen clave estable y recuperación de folio ante reintento |
| III. ERPNext como fuente de verdad | PASA — FR-006/FR-011 ceden el estado final a ERPNext |
| IV. Seguridad de credenciales | PASA — el backend es el único punto de integración con ERPNext; el frontend solo habla con el backend |
| V. Errores comprensibles | PASA — FR-016 exige traducción de errores |
| VI. Trazabilidad | PASA — Success Criteria medibles (SC-001 a SC-006) |
| VII. Reproducibilidad con datos ficticios | N/A para esta feature (cubierto por `002-infra-erpnext-replica`) |
| VIII. Convención de código | Se aplicará en implementación (inglés en código, comentarios de una línea, UI en español vía `frontend/src/i18n/es.ts`) |
| IX. Proceso Spec-Driven | PASA — spec → clarify → plan (este documento) → tasks → implementación |

Sin violaciones. No se requiere tabla de Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/001-compras-offline-sync/
├── plan.md              # Este archivo
├── research.md          # Fase 0: decisiones técnicas e idempotencia en ERPNext
├── data-model.md        # Fase 1: entidades locales (Dexie) y su ciclo de vida
├── contracts/           # Fase 1: contrato de datos app ↔ backend
│   └── backend-api.md
├── quickstart.md        # Fase 1: guía de validación end-to-end
└── tasks.md             # Fase 2 (/speckit-tasks, aún no generado)
```

### Source Code (repository root)

```text
backend/
├── src/main/java/com/omnia/compras/
│   ├── purchaseorder/   # Lectura/creación/edición/cancelación de Purchase Order
│   ├── purchasereceipt/ # Creación de Purchase Receipt vinculado a una orden
│   ├── catalog/         # Lectura de Supplier/Item desde ERPNext
│   ├── idempotency/      # Resolución de clave estable -> folio existente
│   └── erpnext/          # Cliente HTTP hacia la API REST de ERPNext + traducción de errores
└── src/test/java/com/omnia/compras/

frontend/
├── src/
│   ├── db/                # Esquema Dexie: catálogos, órdenes/recibos locales, cola de sync
│   ├── sync/               # Detección de conectividad + procesador de cola (por ítem, independiente)
│   ├── features/orders/    # Listado, detalle, formulario de órdenes
│   ├── features/receipts/  # Formulario de recibo de compra
│   └── i18n/es.ts          # Textos de UI en español, centralizados
└── tests/

e2e/
└── offline-sync.spec.ts    # Playwright: desconexión -> captura -> reconexión -> borrador en ERPNext
```

**Structure Decision**: Aplicación web con frontend y backend separados (Opción 2 del
template), ya materializada en Fase 1 como `backend/`, `frontend/` y `e2e/`
en la raíz del repositorio, con dueños definidos en `CLAUDE.md` (subagentes
`backend` y `frontend`).

## Complexity Tracking

No aplica — el Constitution Check no reportó violaciones.
