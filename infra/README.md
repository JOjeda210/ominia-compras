# Infraestructura: ERPNext + MariaDB primario/réplica (GTID)

Laboratorio local de ERPNext en una sola máquina, construido con Docker
Compose a partir de `frappe/frappe_docker` (su Compose de producción, no el
`pwd.yml` desechable — ver `specs/002-infra-erpnext-replica/research.md`).
Este documento cubre únicamente el Sprint 1 de infraestructura: despliegue
reproducible (US1) y réplica GTID verificada (US2). El cambio al espejo,
los respaldos y la restauración (US3-US5) se documentan en una fase
posterior de este mismo README.

## Versiones exactas usadas

| Componente | Versión | Nota |
|---|---|---|
| ERPNext / Frappe | `v15.47.0` | Imagen `frappe/erpnext:v15.47.0`, línea v15 estable |
| MariaDB | `10.6` (`10.6.28-MariaDB`) | Mínimo definido en `research.md` para soporte GTID completo |

Ambas versiones quedan fijadas en `infra/.env` (`ERPNEXT_VERSION`,
`MARIADB_VERSION`), nunca hardcodeadas en `docker-compose.yml`.

## Prerrequisitos

1. Docker Desktop corriendo (verificado con `docker compose version`), con
   al menos ~4 GiB de RAM libres para los contenedores.
2. Copiar `infra/.env.example` a `infra/.env` y reemplazar los valores
   ficticios de contraseñas (nunca commitear `infra/.env`; ya está
   cubierto por el `.gitignore` de la raíz del repo, patrón `.env`).

```sh
cp infra/.env.example infra/.env
# editar infra/.env con tu editor y poner contraseñas ficticias propias
```

## Despliegue desde cero (US1)

```sh
cd infra
docker compose up -d
```

Esto levanta, en orden de dependencias: `mariadb-primary` → `mariadb-replica`
(healthcheck) → `redis-cache`/`redis-queue` → `configurator` (escribe
`db_host`/`redis` en `sites/common_site_config.json` y sale) →
`create-site` (crea el site de Frappe e instala ERPNext; tarda varios
minutos: migra DocTypes y corre fixtures) → `backend`/`frontend`/
`websocket`/`queue-short`/`queue-long`/`scheduler`.

Verificar que todo subió:

```sh
docker compose ps
```

Esperar a que `create-site` termine (contenedor `Exited (0)`, no
`Exited` con otro código):

```sh
docker compose logs --no-log-prefix --tail=50 create-site
```

Abrir ERPNext en el navegador: `http://localhost:8080` (usuario
`Administrator`, contraseña = `ADMIN_PASSWORD` de `infra/.env`). El host
virtual del site es el valor de `SITE_NAME` en `infra/.env`
(`lab.localhost` por defecto); si el navegador no resuelve ese host,
verificar vía `curl -H "Host: lab.localhost" http://localhost:8080/`.

### Datos ficticios de prueba

```sh
bash scripts/seed-demo-data.sh
```

Crea, de forma idempotente (seguro re-ejecutar), una Company
("Omnia Compras Demo"), un Warehouse ("Almacen Central - OCD"), dos
Suppliers ficticios y dos Items con control de inventario (`is_stock_item`)
y UoM (`Nos`). **Nota de Fase 3** (ver `research.md`): antes de crear estos
registros, el script llama a la misma función que usa el Setup Wizard de
ERPNext para instalar los maestros base (`Item Group`, `UOM`,
`Supplier Group`), porque `bench new-site --install-app erpnext` no los crea
por sí solo al no pasar por el wizard del navegador.

### Custom Fields de idempotencia (requeridos por `backend/`)

```sh
bash scripts/setup-custom-fields.sh
```

Crea el campo `custom_idempotency_key` (tipo `Data`, único) en los DocTypes
`Purchase Order` y `Purchase Receipt`, vía `bench console` (reproducible,
sin clics manuales en "Customize Form"). Es la base del Principio II
(Idempotencia) de la constitución del proyecto: el backend usa este campo
para reconocer un reintento y recuperar el documento ya creado en vez de
duplicarlo.

### Usuario de integración y API Key/Secret

```sh
bash scripts/create-integration-user.sh
```

Crea (idempotente) el usuario `integration@omnia-compras.local` con los
roles `Purchase Manager`, `Stock Manager` y `Purchase User`, y genera su API
Key/Secret. `Purchase Manager`/`Stock Manager` cubren Supplier, Item,
Purchase Order y Purchase Receipt; `Purchase User` se agregó el 18 de
noviembre porque, contra esta versión real de ERPNext, ni `Purchase
Manager` ni `Stock Manager` tienen permiso de lectura de rol sobre
`Warehouse` ni `Company` (confirmado con `403 PermissionError` en vivo),
mientras que `Purchase User` sí lo tiene para ambos sin ampliar permisos de
escritura. Ver el hallazgo completo, con evidencia antes/después, en
`specs/001-compras-offline-sync/research.md`.

**Seguridad**: el script imprime el API Key/Secret en la terminal una sola
vez (Frappe solo devuelve el secreto en texto plano al generarlo; después
solo guarda su hash). Copiar ambos valores a `ERPNEXT_INTEGRATION_API_KEY`
/ `ERPNEXT_INTEGRATION_API_SECRET` en `infra/.env` inmediatamente. **Nunca**
pegar esos valores en un archivo versionado, en este README o en cualquier
evidencia. El subagente `backend` recibe estas credenciales directamente
del coordinador, no leyéndolas de un archivo de git.

### Verificación cronometrada (SC-001: menos de 30 minutos)

Evidencia real registrada en `infra/evidence/us1-containers-and-site.txt`.
Tiempos medidos con `docker inspect` (sin contar la descarga inicial de
imágenes, que depende del ancho de banda de cada máquina):

- `mariadb-primary` creado: `2026-11-17T23:23:18Z`
- `create-site` terminado (`bench new-site --install-app erpnext` incluido):
  `2026-11-17T23:40:40Z`
- Total: **~17 minutos** desde el primer contenedor hasta el site listo,
  dentro del límite de 30 minutos de SC-001.

## Réplica GTID (US2)

### Configuración (una sola vez por despliegue)

```sh
bash scripts/setup-replication.sh
```

Crea en `mariadb-primary` un usuario dedicado de replicación
(`MARIADB_REPLICATION_USER`, privilegio `REPLICATION SLAVE` únicamente) y
ejecuta en `mariadb-replica`:

```sql
CHANGE MASTER TO
  MASTER_HOST='mariadb-primary',
  MASTER_PORT=3306,
  MASTER_USER='repl_user',
  MASTER_PASSWORD='...',
  MASTER_USE_GTID=slave_pos;
START SLAVE;
```

Esta sintaxis se confirmó empírica y directamente contra MariaDB 10.6 en
Fase 3 (sin ajustes respecto a lo previsto en `research.md`).

### Verificar el estado de replicación

```sh
bash scripts/check-replication.sh
```

Salida esperada (evidencia real en `infra/evidence/replication-status.txt`):

```text
Slave_IO_Running: Yes
Slave_SQL_Running: Yes
Seconds_Behind_Master: 0
REPLICATION_OK
```

**Nota de Fase 3**: justo después de `setup-replication.sh`, el retraso
reportado puede ser alto (cientos de segundos) mientras la réplica aplica
el backlog completo de binlog generado durante la instalación de ERPNext;
baja a `0` en menos de un minuto. Esto es esperado, no un error (ver
`research.md`).

### Confirmar que una orden llega a la réplica con el mismo folio

1. Crear una orden de compra en el primario (UI o API REST, usando el
   usuario de integración):

   ```sh
   curl -s -X POST \
     -H "Authorization: token <API_KEY>:<API_SECRET>" \
     -H "Content-Type: application/json" \
     -H "Host: lab.localhost" \
     "http://localhost:8080/api/resource/Purchase%20Order" \
     -d '{
       "company": "Omnia Compras Demo",
       "supplier": "Proveedor Ficticio Uno",
       "schedule_date": "2026-11-20",
       "items": [{"item_code": "ART-001", "qty": 10, "rate": 100,
                  "schedule_date": "2026-11-20",
                  "warehouse": "Almacen Central - OCD"}]
     }'
   ```

2. Consultar el mismo folio directamente en la réplica:

   ```sh
   source infra/.env
   DB_NAME=$(docker compose exec -T backend bash -c \
     "python3 -c \"import json;print(json.load(open('sites/$SITE_NAME/site_config.json'))['db_name'])\"")
   docker compose exec -T mariadb-replica mariadb -u root -p"$MARIADB_ROOT_PASSWORD" "$DB_NAME" \
     -e "SELECT name, docstatus, supplier, transaction_date FROM \`tabPurchase Order\` WHERE name='<folio>';"
   ```

Evidencia real (folio `PUR-ORD-2026-00001`, idéntico en primario y réplica)
guardada en `infra/evidence/us2-replication-and-order.txt`.

## Evidencia guardada

| Archivo | Contenido |
|---|---|
| `infra/evidence/us1-containers-and-site.txt` | `docker compose ps` + sitio respondiendo HTTP 200 |
| `infra/evidence/replication-status.txt` | Primera corrida de `check-replication.sh` en estado OK |
| `infra/evidence/us2-replication-and-order.txt` | Estado de replicación + folio de la orden de prueba visible en primario y réplica |

Ninguno de estos archivos contiene contraseñas ni API keys (los scripts que
las usan nunca las imprimen en la salida que se guarda como evidencia).

## Mapa de arquitectura

```
                         Host (Windows, Docker Desktop)
                         ───────────────────────────────
                         Puerto publicado: 8080 (HTTP_PUBLISH_PORT)
                                   │
                                   ▼
┌─────────────────────────── red privada "omnia-erpnext-net" (bridge) ───────────────────────────┐
│                                                                                                  │
│   ┌────────────┐      ┌────────────┐      ┌────────────┐      ┌────────────┐                   │
│   │  frontend  │─────▶│  backend   │◀────▶│ mariadb-   │      │ mariadb-   │                    │
│   │  (nginx)   │      │ (gunicorn) │      │  primary   │─────▶│  replica   │  (replicación GTID) │
│   │ :8080→host │      │            │      │ :3306      │      │ :3306      │                    │
│   └─────┬──────┘      └──────┬─────┘      └─────┬──────┘      └─────┬──────┘                    │
│         │                    │                  │ vol:              │ vol:                      │
│         ▼                    ▼                  │ mariadb-primary-  │ mariadb-replica-          │
│   ┌────────────┐      ┌────────────┐             │ data              │ data                      │
│   │ websocket  │      │ queue-short│             └───────────────────┴───────────────────────────┤
│   │            │      │ queue-long │                 (nunca comparten volumen; FR-003)            │
│   └────────────┘      │ scheduler  │                                                              │
│                        └────────────┘                                                              │
│         ▲                    ▲                                                                     │
│         │ vol: sites, logs   │ vol: sites, logs                                                    │
│         └────────────────────┴──────── (compartidos entre todos los servicios ERPNext/Frappe)      │
│                                                                                                     │
│   ┌────────────┐      ┌────────────┐                                                               │
│   │ redis-cache│      │ redis-queue│  vol: redis-queue-data                                        │
│   └────────────┘      └────────────┘                                                               │
│                                                                                                     │
│   (one-shot, ya terminados) configurator, create-site                                              │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Servicios, para qué sirven, y cómo se comunican

- **mariadb-primary**: base de datos activa de ERPNext en operación normal.
  Imagen `mariadb:10.6`. Volumen dedicado `mariadb-primary-data`, nunca
  compartido. No publica puertos al host (solo accesible vía
  `docker compose exec` o desde otros contenedores de `omnia-erpnext-net`).
  Variables clave: `MARIADB_ROOT_PASSWORD`. Configuración GTID en
  `infra/mariadb-primary/conf.d/gtid.cnf` (`server_id=1`, `log_bin`,
  `gtid_domain_id=1`).
- **mariadb-replica**: copia de solo lectura (`read_only=1` permanente,
  independiente del futuro cambio al espejo) que recibe los cambios del
  primario vía replicación GTID. Imagen `mariadb:10.6`. Volumen dedicado
  `mariadb-replica-data`, nunca compartido con el primario. Tampoco
  publica puertos al host. Configuración en
  `infra/mariadb-replica/conf.d/gtid.cnf` (`server_id=2`).
- **redis-cache** / **redis-queue**: caché en memoria y cola de trabajos
  que todo proceso de Frappe/ERPNext necesita. Sin persistencia relevante
  salvo `redis-queue-data` (cola, para no perder jobs pendientes si el
  contenedor se reinicia).
- **configurator**: contenedor de un solo uso que escribe `db_host`,
  `redis_cache` y `redis_queue` en `sites/common_site_config.json`
  (volumen `sites`, compartido con todos los servicios de la app) y
  termina (`Exited (0)` esperado).
- **create-site**: contenedor de un solo uso que espera a que
  `mariadb-primary` y Redis estén disponibles, y corre
  `bench new-site --install-app erpnext` para crear el site `lab.localhost`
  (variable `SITE_NAME`). Termina tras instalar ERPNext.
- **backend**: servidor de aplicación (gunicorn) de Frappe/ERPNext; el
  único servicio que atiende peticiones HTTP/API contra la base de datos en
  operación normal. Se conecta a `mariadb-primary:3306` (nunca a la
  réplica, salvo durante un futuro cambio al espejo).
- **frontend**: proxy nginx; único servicio publicado al host en el puerto
  `HTTP_PUBLISH_PORT` (por defecto `8080`), porque es la única puerta de
  entrada que necesita el administrador desde el navegador. Reenvía a
  `backend:8000` y a `websocket:9000`.
- **websocket**: servidor de Socket.IO de Frappe, para actualizaciones en
  tiempo real en la UI.
- **queue-short** / **queue-long**: workers de Frappe que procesan trabajos
  en segundo plano (colas `short`/`default` y `long`/`default`/`short`).
- **scheduler**: dispara las tareas programadas de Frappe (`bench schedule`).

Todos los servicios de la aplicación ERPNext comparten los volúmenes
`sites` (código y configuración del site, incluidos adjuntos) y `logs`,
porque son múltiples procesos de un mismo bench que deben ver el mismo
estado de archivos. Solo `mariadb-primary` y `mariadb-replica` tienen
volúmenes exclusivos y jamás compartidos entre sí (FR-003).

### Variables de entorno relevantes (`infra/.env`, nunca commiteado)

| Variable | Para qué sirve |
|---|---|
| `ERPNEXT_VERSION` / `MARIADB_VERSION` | Fijan las imágenes exactas (reproducibilidad) |
| `SITE_NAME` | Nombre del site de Frappe creado por `create-site` |
| `ADMIN_PASSWORD` | Contraseña del usuario `Administrator` del site |
| `MARIADB_ROOT_PASSWORD` | Root de ambas instancias MariaDB (primaria y réplica) |
| `MARIADB_REPLICATION_USER` / `MARIADB_REPLICATION_PASSWORD` | Cuenta dedicada solo para replicación (`REPLICATION SLAVE`) |
| `HTTP_PUBLISH_PORT` | Puerto del host mapeado al `frontend` |
| `ERPNEXT_INTEGRATION_API_KEY` / `ERPNEXT_INTEGRATION_API_SECRET` | Credenciales del usuario de integración, usadas luego por `backend/` |

## Scripts (`infra/scripts/`)

| Script | Fase | Qué hace |
|---|---|---|
| `check-replication.sh` | Foundational / US2 | Reporta `Slave_IO_Running`, `Slave_SQL_Running`, `Seconds_Behind_Master`; sale con código distinto de 0 si no está Yes/Yes/0 |
| `setup-replication.sh` | US2 | Crea el usuario de replicación y configura `CHANGE MASTER TO` en la réplica |
| `seed-demo-data.sh` | US1 | Crea Company, Warehouse, Suppliers e Items ficticios (idempotente) |
| `setup-custom-fields.sh` | Requerido por `backend/` | Crea `custom_idempotency_key` en Purchase Order y Purchase Receipt |
| `create-integration-user.sh` | Requerido por `backend/` | Crea el usuario de integración y genera su API Key/Secret |

Los scripts aún no incluidos (`switch-to-mirror.sh`, `backup.sh`,
`restore.sh`) corresponden a las historias de usuario 3 a 5 (cambio al
espejo, respaldos, restauración), fuera del alcance de este Sprint 1 — ver
`specs/002-infra-erpnext-replica/tasks.md` (T014 en adelante).

## Reproducibilidad: destruir y volver a levantar

```sh
docker compose down -v   # borra también los volúmenes (datos de este lab)
docker compose up -d
docker compose logs --no-log-prefix --tail=50 create-site   # esperar a que termine
bash scripts/seed-demo-data.sh
bash scripts/setup-custom-fields.sh
bash scripts/create-integration-user.sh
bash scripts/setup-replication.sh
bash scripts/check-replication.sh
```

Estos son exactamente los mismos pasos usados para generar la evidencia de
este documento; no hay pasos manuales adicionales no documentados (SC-001,
FR-001).
