# Implementation Plan: Infraestructura ERPNext con réplica y continuidad

**Branch**: `002-infra-erpnext-replica` | **Date**: 2026-11-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-infra-erpnext-replica/spec.md`

## Summary

Laboratorio local de ERPNext en una sola máquina, desplegado con Docker
Compose a partir de `frappe/frappe_docker`, con dos instancias MariaDB
(primario + réplica) conectadas por una red privada de Docker y replicación
GTID verificable (Yes/Yes, 0 s de retraso). Incluye el procedimiento de
cambio al espejo ante caída del primario (manteniéndolo sin escritura al
reiniciarlo), respaldos automáticos diarios de base de datos y archivos del
sitio a un destino separado de los volúmenes, y restauración verificable en
un segundo site de Frappe dentro del mismo bench.

## Technical Context

**Language/Version**: Configuración de infraestructura (Docker Compose YAML, scripts shell); sin código de aplicación propio en esta feature

**Primary Dependencies**: `frappe/frappe_docker` (ERPNext + Frappe bench), MariaDB (versión a registrar al desplegar en Fase 3), Docker Compose

**Storage**: Volúmenes Docker separados para primario y réplica; destino de respaldos en `infra/backups/` (bind mount local, fuera de los volúmenes de los contenedores)

**Testing**: Verificación por comandos reales (estado de replicación, `docker compose ps`, consultas SQL/API) documentada como evidencia; sin pruebas automatizadas de software (es infraestructura, no código de aplicación)

**Target Platform**: Una sola máquina con Docker Desktop (Windows), todos los contenedores en la misma red privada de Docker

**Project Type**: Infraestructura (no aplica la plantilla de "web application"; ver Project Structure)

**Performance Goals**: Retraso de replicación de 0 s en operación normal (SC-002); despliegue reproducible en <30 min (SC-001)

**Constraints**: Todo en una sola máquina (sin alta disponibilidad real ni multi-nodo, ver Out of Scope); datos ficticios; respaldos deben quedar fuera de los volúmenes de los contenedores (FR-009)

**Scale/Scope**: Una empresa, un almacén, catálogo pequeño de proveedores/artículos (suficiente para demostrar los escenarios, no para producción)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Evaluación |
|---|---|
| I. Offline-first | N/A — esta feature es infraestructura server-side, no la captura offline (cubierta por `001-compras-offline-sync`) |
| II. Idempotencia | N/A para esta feature (aplica a escrituras de negocio, no a infraestructura) |
| III. ERPNext como fuente de verdad | PASA — el cambio al espejo (FR-006) preserva las órdenes ya aceptadas antes de la promoción |
| IV. Seguridad de credenciales | PASA — las credenciales de integración viven en `.env` del backend; esta feature no las introduce en el frontend |
| V. Errores comprensibles | N/A — el actor es un administrador técnico, no el usuario final de la app |
| VI. Trazabilidad | PASA — Success Criteria medibles (SC-001 a SC-007), evidencias guardadas por el subagente `infra` |
| VII. Reproducibilidad con datos ficticios | PASA — FR-001/FR-002 exigen despliegue reproducible con datos ficticios |
| VIII. Convención de código | Aplica a los scripts/Compose: inglés, comentario de una línea por bloque relevante |
| IX. Proceso Spec-Driven | PASA — spec → clarify → plan (este documento) → tasks → implementación |

Sin violaciones. No se requiere tabla de Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/002-infra-erpnext-replica/
├── plan.md              # Este archivo
├── research.md          # Fase 0: decisiones de replicación, cambio al espejo y respaldos
├── data-model.md         # Fase 1: entidades de infraestructura (instancias, respaldos, sitios)
├── contracts/            # Fase 1: "contrato" operativo (comandos de verificación, no API)
│   └── operational-checks.md
├── quickstart.md         # Fase 1: guía de validación end-to-end
└── tasks.md              # Fase 2 (/speckit-tasks, aún no generado)
```

### Source Code (repository root)

```text
infra/
├── docker-compose.yml       # ERPNext + MariaDB primario + MariaDB réplica, red privada
├── docker-compose.override.yml  # Overrides locales si aplica (p. ej. puertos)
├── mariadb-primary/
│   └── conf.d/gtid.cnf       # server_id, gtid_mode, log_bin, etc.
├── mariadb-replica/
│   └── conf.d/gtid.cnf
├── scripts/
│   ├── check-replication.sh  # Verifica Yes/Yes y Seconds_Behind_Master
│   ├── switch-to-mirror.sh   # Detiene primario, promueve réplica, reconfigura ERPNext
│   ├── backup.sh              # Respaldo de DB + archivos del sitio -> infra/backups/
│   └── restore.sh             # Restaura un respaldo en un site de prueba nuevo
├── .env.example
└── backups/                   # Destino de respaldos (fuera de los volúmenes), en .gitignore
```

**Structure Decision**: Toda la infraestructura vive en `infra/` (dueño:
subagente `infra`, ya definido en `CLAUDE.md`). No hay "backend"/"frontend"
de aplicación en esta feature; es exclusivamente configuración y scripts
operativos.

## Complexity Tracking

No aplica — el Constitution Check no reportó violaciones.
