# Omnia Compras — Prueba técnica

App de compras offline-first integrada con ERPNext. Captura órdenes de
compra sin red, las sincroniza a ERPNext como borrador, permite editar,
cancelar y registrar recibos de compra (parciales y totales), con
reintentos idempotentes que nunca duplican documentos. ERPNext corre
local con Docker Compose, con MariaDB primario + réplica GTID, cambio al
espejo y respaldos/restauración automatizados.

Ver `docs/WORK_PLAN.md` para el plan de trabajo completo por fases,
`specs/` para las especificaciones (Spec Kit), y `docs/backlog.md` /
`docs/sprint-1.md` / `docs/sprint-2.md` para el trabajo Scrum.

## Stack

- **Infra**: Docker Compose a partir de `frappe/frappe_docker`. ERPNext
  v15.47.0, MariaDB 10.6 (primario + réplica GTID).
- **Backend**: Java 21 (Eclipse Adoptium Temurin), Spring Boot 3.x.
- **Frontend**: React + TypeScript, Vite PWA, Dexie (IndexedDB).
- **E2E**: Playwright, contra el stack real (nunca mocks de ERPNext).

## Estructura

```
infra/      Docker Compose, replicación, respaldos/restauración (dueño: subagente infra)
backend/    Spring Boot, integración API REST ERPNext (dueño: subagente backend)
frontend/   React/TS/Vite PWA, Dexie (dueño: subagente frontend)
e2e/        Pruebas Playwright (dueño: subagente frontend)
specs/      Especificaciones Spec Kit (spec, plan, tareas, contratos)
docs/       Backlog, notas de sprint, plan de trabajo
evidencias/ Capturas para Evidencias.pdf
```

## Prerrequisitos

- Docker Desktop.
- Java 21 Temurin (`JAVA_HOME` apuntando a esa instalación).
- Node.js 22+.

## 1. Levantar la infraestructura (ERPNext + MariaDB)

```sh
cd infra
cp .env.example .env    # edita los valores ficticios si quieres cambiarlos
docker compose up -d
```

Espera a que todos los servicios estén `healthy`/`Up`:

```sh
docker compose ps
```

El sitio de laboratorio queda en `http://lab.localhost:8080` (agrega
`127.0.0.1 lab.localhost` a tu archivo de hosts si el navegador no lo
resuelve). Usuario `Administrator`, contraseña la que hayas puesto en
`ADMIN_PASSWORD` dentro de `infra/.env`.

Los datos ficticios (empresa, almacén, proveedores, artículos), el Custom
Field de idempotencia y el usuario de integración con su API Key/Secret
**no** se crean solos — corre estos tres scripts una vez, en orden, después
de que `docker compose up -d` termine de crear el sitio:

```sh
bash scripts/seed-demo-data.sh
bash scripts/setup-custom-fields.sh
bash scripts/create-integration-user.sh   # imprime el API Key/Secret reales
```

Ver `infra/README.md` para el detalle de qué hace cada uno.

Para verificar la réplica, el cambio al espejo, los respaldos y la
restauración, ver `infra/README.md` — tiene los comandos exactos de cada
operación, ya probados.

## 2. Levantar el backend

```sh
cd backend
cp .env.example .env
# Rellena ERPNEXT_BASE_URL, ERPNEXT_SITE_HOST, ERPNEXT_API_KEY/SECRET
# (los que generó create-integration-user.sh) y ERPNEXT_DEFAULT_COMPANY.
# 8080 ya lo usa ERPNext, así que deja BACKEND_PORT=8081.
export JAVA_HOME="<ruta a tu Temurin 21>"
./mvnw.cmd clean verify      # compila y corre las pruebas unitarias
./mvnw.cmd spring-boot:run   # levanta en el puerto 8081
```

## 3. Levantar el frontend

```sh
cd frontend
cp .env.example .env
# VITE_BACKEND_URL=http://localhost:8081
npm install
npm run dev
```

Abre la URL que imprima Vite (normalmente `http://localhost:5173`).

## 4. Probar

```sh
cd e2e
npm install
npx playwright install chromium   # solo la primera vez
VITE_BACKEND_URL=http://localhost:8081 npx playwright test
```

Corre 4 escenarios de principio a fin contra el backend y ERPNext reales:
captura offline, sincronización automática, recepción parcial/total, y
reintentos sin duplicados.

## Seguridad

Las credenciales de ERPNext viven solo en `backend/.env` (nunca en el
frontend, nunca en git). Los tres `.env` reales (`infra/`, `backend/`,
`frontend/`) están en `.gitignore`; usa siempre los `.env.example`
correspondientes como plantilla con valores ficticios.
