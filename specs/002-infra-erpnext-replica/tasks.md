---

description: "Task list for Infraestructura ERPNext con réplica y continuidad"
---

# Tasks: Infraestructura ERPNext con réplica y continuidad

**Input**: Design documents from `specs/002-infra-erpnext-replica/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/operational-checks.md, quickstart.md

**Tests**: No hay pruebas de software (es infraestructura); la verificación es por comandos reales documentados como evidencia (ver `contracts/operational-checks.md`).

**Dueño**: subagente `infra` para todas las tareas, salvo donde se indique.

## Format: `[ID] [P?] [Story] Description (dueño: ...)`

---

## Phase 1: Setup

- [x] T001 Crear la estructura de `infra/` (`docker-compose.yml`, `mariadb-primary/`, `mariadb-replica/`, `scripts/`, `.env.example`) según `plan.md` (dueño: infra)
- [x] T002 [P] Elegir y registrar las versiones exactas de ERPNext y MariaDB a usar, documentadas como comentario en `infra/docker-compose.yml` (dueño: infra)
- [x] T003 [P] Escribir `infra/.env.example` con valores ficticios para credenciales de MariaDB y del usuario de integración de ERPNext (dueño: infra)

**Checkpoint**: estructura de archivos lista, versiones decididas.

---

## Phase 2: Foundational (bloqueante para todas las historias)

**⚠️ CRITICAL**: ninguna historia de usuario puede verificarse sin esto.

- [x] T004 Escribir `infra/docker-compose.yml` partiendo de `frappe/frappe_docker` (no del `pwd.yml` desechable, según `research.md`), con el servicio ERPNext y dos instancias MariaDB (`MariaDbInstance.role = primary` y `replica`, cada una con su `MariaDbInstance.containerName` y su propio `MariaDbInstance.volumeName`, `data-model.md`), conectadas por una red Docker privada (dueño: infra)
- [x] T005 [P] Configurar `infra/mariadb-primary/conf.d/gtid.cnf` (`server_id`, `gtid_strict_mode=ON`, `log_bin`) (dueño: infra)
- [x] T006 [P] Configurar `infra/mariadb-replica/conf.d/gtid.cnf` (`server_id` distinto, preparado para `CHANGE MASTER TO ... MASTER_USE_GTID`) (dueño: infra)
- [x] T007 Crear `infra/scripts/check-replication.sh`, que reporta `ReplicationState.ioThreadRunning`, `sqlThreadRunning` y `secondsBehindMaster` (`data-model.md`) a partir de `SHOW SLAVE STATUS` (dueño: infra)

**Checkpoint**: Compose levanta ERPNext + primario + réplica; el script de verificación corre (aunque la réplica aún no esté configurada).

---

## Phase 3: User Story 1 - Despliegue reproducible de ERPNext (Priority: P1) 🎯 MVP

**Goal**: levantar ERPNext desde cero, con datos ficticios, siguiendo solo documentación.

**Independent Test**: Quickstart, sección "Despliegue (US1)".

- [x] T008 [P] [US1] Escribir `infra/README.md` con los pasos exactos de despliegue desde cero (prerequisitos, comandos, verificación) (dueño: infra)
- [x] T009 [US1] Crear `infra/scripts/seed-demo-data.sh` que configure una `ErpnextSite` con `ErpnextSite.siteName` y `ErpnextSite.purpose = lab` (`data-model.md`) con una Company, un Warehouse, proveedores y artículos (con control de inventario y UoM) ficticios (depende de T004) (dueño: infra)
- [x] T010 [US1] Verificar y documentar como evidencia la salida de `docker compose ps` y el sitio abierto en el navegador (`contracts/operational-checks.md`, sección "Contenedores activos"/"ERPNext en funcionamiento"), cronometrando el despliegue completo desde cero y registrando que tomó menos de 30 minutos (SC-001) (dueño: infra)

**Checkpoint**: un administrador nuevo puede levantar el laboratorio completo siguiendo solo `infra/README.md`.

---

## Phase 4: User Story 2 - Réplica con GTID (Priority: P2)

**Goal**: verificar replicación GTID Yes/Yes con 0 s de retraso, y que una orden llega a la réplica.

**Independent Test**: Quickstart, sección "Réplica GTID (US2)".

- [x] T011 [US2] Crear `infra/scripts/setup-replication.sh`: usuario de replicación dedicado (privilegio `REPLICATION SLAVE` únicamente) y `CHANGE MASTER TO ... MASTER_USE_GTID` para que la instancia `MariaDbInstance.role = replica` (`data-model.md`) empiece a replicar del primario (depende de T005, T006) (dueño: infra)
- [x] T012 [US2] Ejecutar `check-replication.sh` (T007) contra la réplica configurada y confirmar `Yes`/`Yes` y `secondsBehindMaster = 0`, registrando `ReplicationState.checkedAt` (`data-model.md`); guardar la salida como evidencia (dueño: infra)
- [x] T013 [US2] Crear una orden de prueba en el sitio `lab` y verificar, con el comando de `contracts/operational-checks.md` ("Orden visible en la réplica"), que el mismo folio existe en la réplica (dueño: infra)

**Checkpoint**: réplica funcionando y verificada con evidencia reproducible.

---

## Phase 5: User Story 3 - Cambio al espejo ante caída del primario (Priority: P3)

**Goal**: ERPNext sigue operando contra la réplica tras detener el primario, y este último no diverge al reiniciarse.

**Independent Test**: Quickstart, sección "Cambio al espejo (US3)".

- [x] T014 [P] [US3] Crear `infra/scripts/switch-to-mirror.sh` que reconfigura la conexión de ERPNext hacia `mariadb-replica` y reinicia el contenedor de la app (según la decisión de `research.md`) (depende de T004) (dueño: infra)
- [x] T015 [US3] Ajustar `infra/mariadb-primary/conf.d/gtid.cnf` para que, al reiniciarse después de una democión, arranque con `read_only=1` y `super_read_only=1` (`MariaDbInstance.readOnly = true`, `data-model.md`, FR-007) (dueño: infra)
- [x] T016 [US3] Ejecutar la prueba completa: detener el primario, correr `switch-to-mirror.sh`, actualizar `ErpnextSite.activeDbInstance = replica` (`data-model.md`), consultar la orden de T013 y crear una orden nueva usando la réplica; reiniciar el antiguo primario, intentar un `INSERT`/`UPDATE` real contra él para confirmar que lo rechaza (SC-005, no basta con leer la bandera) y confirmar `read_only`/`super_read_only` en `ON` (`contracts/operational-checks.md`); guardar ambos folios como evidencia (depende de T014, T015) (dueño: infra)

**Checkpoint**: continuidad ante caída del primario demostrada y documentada.

---

## Phase 6: User Story 4 - Respaldos automáticos (Priority: P4)

**Goal**: respaldos diarios de base de datos y archivos del sitio, sin intervención manual, en un destino separado de los volúmenes.

**Independent Test**: Quickstart, sección "Respaldos automáticos (US4)".

- [x] T017 [P] [US4] Crear `infra/scripts/backup.sh` usando `bench backup --with-files`, guardando el resultado en `infra/backups/<fecha>/` como un `Backup` (`databaseDumpPath`, `siteFilesPath`, `location`, `sourceInstance`, `data-model.md`) (dueño: infra)
- [x] T018 [US4] Configurar la programación diaria (decisión de Clarify) del respaldo (cron del contenedor o del host) en `infra/docker-compose.yml` (depende de T017) (dueño: infra)
- [x] T019 [US4] Verificar una ejecución automática (sin disparo manual) y documentar `Backup.generatedAt`/`location` como evidencia (`contracts/operational-checks.md`, "Respaldo automático") (dueño: infra)

**Checkpoint**: al menos un respaldo automático identificable, generado sin intervención manual.

---

## Phase 7: User Story 5 - Restauración verificable (Priority: P5)

**Goal**: restaurar un respaldo en un segundo site de Frappe y consultar una orden que existía al generarlo.

**Independent Test**: Quickstart, sección "Restauración (US5)".

- [x] T020 [P] [US5] Crear `infra/scripts/restore.sh`: `bench new-site` + `bench restore --with-private-files --with-public-files`, creando una `ErpnextSite` con `siteName` nuevo y `purpose = restore-test` (`data-model.md`, decisión de Clarify) (depende de T017) (dueño: infra)
- [x] T021 [US5] Ejecutar la restauración con un respaldo de T019, abrir el site `restore-test` y consultar una orden que existía al generar ese respaldo; documentar folio y datos como evidencia (`contracts/operational-checks.md`, "Restauración") (depende de T020) (dueño: infra)

**Checkpoint**: ciclo completo de recuperación ante desastre verificado.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [x] T022 [P] Escribir el mapa de arquitectura en texto (servicios, imágenes/versiones, redes, volúmenes, puertos, variables de entorno) en `infra/README.md`, según el punto 3 del Modo de Trabajo de `CLAUDE.md` (dueño: infra)
- [x] T023 Pase del subagente `reviewer` contra los criterios de aceptación de `spec.md`, verificando que no haya secretos expuestos en ninguna evidencia (dueño: reviewer)

---

## Dependencies & Execution Order

- **Setup (Phase 1)** → **Foundational (Phase 2)**: bloquea todo lo demás.
- **US1 (Phase 3)**: depende solo de Foundational; es el MVP (laboratorio desplegado).
- **US2 (Phase 4)**: depende de Foundational (primario+réplica ya en Compose) y de US1 (necesita una orden real para verificar replicación).
- **US3 (Phase 5)**: depende de US2 (la réplica debe estar sincronizada antes de poder promoverla).
- **US4 (Phase 6)**: depende solo de US1 (necesita un sitio con datos para respaldar); puede avanzar en paralelo con US2/US3.
- **US5 (Phase 7)**: depende de US4 (necesita al menos un respaldo generado).
- **Polish**: depende de que todas las historias deseadas estén completas.

### Parallel Opportunities

- T002/T003 (Setup) en paralelo.
- T005/T006 (Foundational, configuración de cada instancia) en paralelo.
- T014 (US3) puede prepararse en paralelo con T011–T013 (US2), aunque su prueba (T016) depende de que US2 esté verificado.
- T017 (US4) puede prepararse en paralelo con US2/US3; solo su verificación (T019) necesita datos ya cargados (US1).
- T020 (US5) puede prepararse en paralelo; su prueba (T021) depende de T019.

## Implementation Strategy

### MVP primero (User Story 1)

1. Fase 1 (Setup) → Fase 2 (Foundational) → Fase 3 (US1).
2. Validar que ERPNext abre con datos de prueba, documentado y reproducible.

### Entrega incremental

1. Foundational listo → Compose con primario+réplica (aún sin replicar).
2. US1 → laboratorio reproducible con datos ficticios.
3. US2 → réplica GTID verificada (cierra el primer hito de infra en Fase 3 de `WORK_PLAN.md`).
4. US3, US4, US5 → Fase 5 de `WORK_PLAN.md` (infra final): cambio al espejo, respaldos, restauración.
