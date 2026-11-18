# Infraestructura: ERPNext + MariaDB primario/réplica (GTID)

Laboratorio local de ERPNext en una sola máquina, construido con Docker
Compose a partir de `frappe/frappe_docker` (su Compose de producción, no el
`pwd.yml` desechable — ver `specs/002-infra-erpnext-replica/research.md`).
Cubre las 5 historias de usuario de `specs/002-infra-erpnext-replica/spec.md`:
despliegue reproducible (US1), réplica GTID verificada (US2), cambio al
espejo ante caída del primario (US3), respaldos automáticos diarios (US4) y
restauración verificable en un segundo site (US5).

**Estado actual del laboratorio** (al cierre de la Fase 5): `mariadb-replica`
quedó promovida como base de datos activa y escribible tras la prueba real
de cambio al espejo (US3); ERPNext sigue apuntando a ella. El antiguo
`mariadb-primary` está arriba, en modo solo lectura (`read_only=ON`), y no
está reconfigurado como réplica de `mariadb-replica` (eso sería un
"failback" con reconciliación de datos, fuera de alcance — ver
"Out of Scope" en `spec.md`: no se exige failover/failback automático). El
bench tiene 2 sites: `lab.localhost` (original) y `restore-test.localhost`
(creado por `scripts/restore.sh` para verificar US5). Detalle completo en la
sección "Cambio al espejo (US3)" más abajo.

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

## Cambio al espejo (US3)

```sh
docker compose stop mariadb-primary
bash scripts/switch-to-mirror.sh
```

`switch-to-mirror.sh` asume que el primario ya está detenido (paso previo
explícito, no lo detiene por sí mismo) y hace 4 cosas:

1. Promueve `mariadb-replica` a base de datos activa y escribible:
   `STOP SLAVE` (deja de intentar leer binlog del primario caído) y
   `SET GLOBAL read_only = 0`.
2. Persiste esa promoción en `mariadb-replica/conf.d/gtid.cnf` (comenta la
   línea `read_only = 1`), para que sobreviva un futuro reinicio del
   contenedor.
3. Apunta ERPNext a `mariadb-replica` (`bench set-config -g db_host
   mariadb-replica`, reescribe `sites/common_site_config.json`) y reinicia
   los procesos de la app que mantienen una conexión viva a la base de
   datos: `backend`, `websocket`, `queue-short`, `queue-long`, `scheduler`
   (`frontend` no se reinicia: es un proxy nginx, no habla con MariaDB).
4. Arma `mariadb-primary/conf.d/gtid.cnf` para que, la próxima vez que ese
   contenedor arranque, lo haga con `read_only = 1` (FR-007) — este bloque
   lo añade el script en el momento real de la democión, **no** está
   presente en el archivo tal como queda en el repositorio para un
   despliegue limpio (ver nota más abajo).

**Nota de Fase 5 (desviación real, documentada en `research.md`)**: MariaDB
10.6 no tiene la variable `super_read_only` (es exclusiva de MySQL); el
primer intento de este script falló con
`ERROR 1193: Unknown system variable 'super_read_only'`. El equivalente de
MariaDB es el privilegio por cuenta `READ_ONLY ADMIN` (10.5+); como el
usuario de MariaDB propio del site de ERPNext no tiene ningún privilegio
fuera de su propia base (confirmado con `SHOW GRANTS`), un solo
`read_only = 1` ya es suficiente para bloquear sus escrituras. Verificado en
vivo con un `UPDATE` real contra el primario demovido, usando ese mismo
usuario (no `root`), rechazado con
`ERROR 1290: The MariaDB server is running with the --read-only option`.

**Nota de Fase 5 (por qué `gtid.cnf` del primario NO lleva `read_only=1`
desde el repositorio)**: hacerlo permanente rompería un despliegue limpio
desde cero, porque `bench new-site --install-app erpnext` escribe usando
las credenciales propias del site (sin privilegios globales), no las de
`root`; con `read_only=1` desde el primer arranque, esa instalación
fallaría, violando FR-001/SC-001. Por eso el bloque de solo-lectura lo
añade `switch-to-mirror.sh` únicamente en el momento real de la democión,
no es parte del archivo tal como se entrega en el repositorio.

### Verificación real ejecutada (evidencia completa en `infra/evidence/us3-mirror-switch.txt`)

- Folio existente antes de la caída, consultado por API **después** del
  cambio al espejo (servido por la réplica promovida): `PUR-ORD-2026-00001`
  → HTTP 200.
- Folio nuevo, creado por API **después** del cambio al espejo (escrito en
  la réplica promovida): `PUR-ORD-2026-00040` → HTTP 200.
- Al reiniciar el antiguo primario: `SHOW VARIABLES LIKE 'read_only'` → `ON`.
  `super_read_only` no existe en esta versión de MariaDB (ver nota arriba).
- Escritura real rechazada contra el antiguo primario (SC-005, no solo la
  bandera): `UPDATE` con el usuario propio del site → `ERROR 1290`.
- Divergencia esperada y documentada, no oculta: el antiguo primario NO
  tiene `PUR-ORD-2026-00040` (nunca vio esa escritura, estaba detenido).

## Respaldos automáticos (US4)

Mecanismo elegido (decisión ampliada en `research.md`): un contenedor
auxiliar nuevo, `backup-cron` (imagen `docker:27-cli`), en vez de cron del
sistema anfitrión, para que la programación siga viviendo dentro de Docker
Compose y sea igual de reproducible en cualquier máquina. Este contenedor:

- Monta el socket de Docker del host (`/var/run/docker.sock`) y todo el
  directorio `infra/` (lectura-escritura), para poder ejecutar los mismos
  comandos `docker compose exec`/`cp` que un administrador correría a
  mano contra el servicio `backend` (Docker-outside-of-Docker). **Trade-off
  deliberado**: este contenedor obtiene control total del daemon Docker del
  host; aceptable para un laboratorio local de una sola máquina con datos
  ficticios, no recomendado sin ajustes en un entorno compartido.
- Corre `scripts/backup-cron-loop.sh` (POSIX `sh`, sin dependencias) como
  único proceso: cada ~30s compara la hora UTC actual contra
  `scripts/backup-schedule.env` (por defecto `02:30` UTC, fuera del horario
  de uso simulado, FR-008) y, al coincidir, invoca
  **el mismo** `scripts/backup.sh` documentado abajo (no una
  reimplementación paralela), controlando con un archivo marcador por día
  que no se dispare dos veces.

```sh
bash scripts/backup.sh
```

`backup.sh` corre `bench --site $SITE_NAME backup --with-files` dentro del
contenedor `backend`, lee del propio resumen de `bench` las 4 rutas
generadas (config, base de datos, archivos públicos, archivos privados) y
las copia con `docker compose cp` a `infra/backups/<timestamp>/` (fuera de
cualquier volumen de contenedor, bind mount del host). Falla de forma
visible (`exit 1` y mensaje a stderr) si `bench backup` no reporta éxito,
en vez de dejar un respaldo a medias sin avisar.

### Demostración real de la programación automática (sin disparo manual)

Para no esperar 24 horas, se editó `scripts/backup-schedule.env` con una
hora ~2 minutos en el futuro; el propio contenedor `backup-cron` (su bucle
ya corriendo) detectó la coincidencia e invocó `backup.sh` por sí mismo —
no se ejecutó `backup.sh` a mano. El archivo se restauró a `02:30` UTC
inmediatamente después de capturar la evidencia. Detalle completo,
incluyendo los logs reales del contenedor, en
`infra/evidence/us4-automatic-backup.txt`.

## Restauración (US5)

```sh
bash scripts/restore.sh infra/backups/<timestamp> [nombre-del-site-de-prueba]
# por defecto: restore-test.localhost
```

`restore.sh` copia los 3 archivos del respaldo (base de datos, públicos,
privados) al contenedor `backend`, crea (si no existe) un segundo site de
Frappe en el mismo bench (`bench new-site`, multi-tenant nativo — decisión
de Clarify en `spec.md`) y corre `bench --site <site> restore
--with-public-files --with-private-files <dump>`. Falla de forma visible
si algún archivo del respaldo falta o está vacío (spec.md Edge Cases: un
respaldo corrupto/incompleto no debe restaurarse en silencio).

**Nota de Fase 5 (desviación real de Git Bash/MSYS en Windows, documentada
en `research.md`)**: `docker compose exec`/`cp` con un argumento que, por sí
solo, empieza con `/`, se reescribe en silencio como ruta de Windows antes
de llegar a `docker.exe` (`mkdir -p /home/...` reportaba éxito sin crear
nada; en una prueba incluso creó un directorio literal `C:` dentro del
contenedor). Arreglo: cualquier ruta absoluta de contenedor va dentro de un
único string `bash -c "..."`, o como destino de `docker compose cp`
prefijado con `backend:` (un destino relativo también falla, pero con un
error inmediato y claro: `Could not find the file sites in container`).

Evidencia real (folio `PUR-ORD-2026-00001`, mismos datos que al momento de
generar el respaldo, mas la confirmación de que el folio creado
*después* del respaldo NO aparece en el site restaurado) en
`infra/evidence/us5-restore.txt`.

## Evidencia guardada

| Archivo | Contenido |
|---|---|
| `infra/evidence/us1-containers-and-site.txt` | `docker compose ps` + sitio respondiendo HTTP 200 |
| `infra/evidence/replication-status.txt` | Primera corrida de `check-replication.sh` en estado OK |
| `infra/evidence/us2-replication-and-order.txt` | Estado de replicación + folio de la orden de prueba visible en primario y réplica |
| `infra/evidence/us3-mirror-switch.txt` | Cambio al espejo real: folios antes/después, rechazo de escritura verificado contra el antiguo primario, divergencia documentada |
| `infra/evidence/us4-automatic-backup.txt` | Logs reales del disparo automático de `backup-cron` (no manual) y el respaldo resultante |
| `infra/evidence/us5-restore.txt` | Restauración real en `restore-test.localhost` y folio verificado con los mismos datos que al momento del respaldo |

Ninguno de estos archivos contiene contraseñas ni API keys (los scripts que
las usan nunca las imprimen en la salida que se guarda como evidencia).

## Mapa de arquitectura

Estado reflejado abajo: **después** del cambio al espejo real de la Fase 5
(ver "Estado actual del laboratorio" arriba). La flecha de replicación GTID
y la de conexión de la app están invertidas respecto al diagrama original
de la Fase 3: ahora `backend` (y el resto de procesos de la app) hablan con
`mariadb-replica`, no con `mariadb-primary`.

```
                         Host (Windows, Docker Desktop)
                         ───────────────────────────────
                         Puerto publicado: 8080 (HTTP_PUBLISH_PORT)
                                   │
                                   ▼
┌─────────────────────────── red privada "omnia-erpnext-net" (bridge) ───────────────────────────┐
│                                                                                                  │
│   ┌────────────┐      ┌────────────┐      ┌────────────┐      ┌────────────┐                   │
│   │  frontend  │─────▶│  backend   │      │ mariadb-   │◀─────│ mariadb-   │                    │
│   │  (nginx)   │      │ (gunicorn) │─────▶│  primary   │  X    │  replica   │ (activa, escribible)│
│   │ :8080→host │      │ db_host=   │      │ :3306      │ (replicación      │ :3306      │         │
│   └─────┬──────┘      │  replica   │      │ read_only  │  GTID detenida    └─────┬──────┘         │
│         │             └──────┬─────┘      │ =ON        │  tras el switch)        │ vol:           │
│         ▼                    │            └─────┬──────┘                         │ mariadb-replica-│
│   ┌────────────┐      ┌────────────┐             │ vol:                          │ data            │
│   │ websocket  │      │ queue-short│             │ mariadb-primary-               ───────────────┤
│   │            │      │ queue-long │             │ data (nunca compartido; FR-003)                │
│   └────────────┘      │ scheduler  │             └─────────────────────────────────────────────────┤
│                        └────────────┘                                                              │
│         ▲                    ▲                                                                     │
│         │ vol: sites, logs   │ vol: sites, logs                                                    │
│         └────────────────────┴──────── (compartidos entre todos los servicios ERPNext/Frappe;      │
│                                          2 sites: lab.localhost, restore-test.localhost)            │
│                                                                                                     │
│   ┌────────────┐      ┌────────────┐      ┌─────────────┐                                          │
│   │ redis-cache│      │ redis-queue│      │ backup-cron │  vol: infra/ (bind, rw) +                │
│   │            │      │ vol: redis-│      │ (docker-cli)│       /var/run/docker.sock (DooD)         │
│   └────────────┘      │ queue-data)│      └─────┬───────┘                                          │
│                        └────────────┘             │ docker compose exec/cp -> backend               │
│                                                    ▼ writes infra/backups/<fecha>/ (bind, fuera de  │
│                                                      cualquier volumen de contenedor)                │
│   (one-shot, ya terminados) configurator, create-site                                              │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Servicios, para qué sirven, y cómo se comunican

- **mariadb-primary**: base de datos original de ERPNext (`server_id=1`,
  `infra/mariadb-primary/conf.d/gtid.cnf`). Imagen `mariadb:10.6`. Volumen
  dedicado `mariadb-primary-data`, nunca compartido. No publica puertos al
  host. Tras el cambio al espejo real de la Fase 5 (US3), quedó demovido:
  `read_only=ON`, sin recibir escrituras de la app (ver "Cambio al espejo
  (US3)"); el bloque `read_only=1` en su `gtid.cnf` lo añadió
  `switch-to-mirror.sh` en el momento de la democión, no está en el
  repositorio por defecto (rompería un despliegue limpio, ver esa misma
  sección).
- **mariadb-replica**: copia que recibía los cambios del primario vía
  replicación GTID (`server_id=2`,
  `infra/mariadb-replica/conf.d/gtid.cnf`). Imagen `mariadb:10.6`. Volumen
  dedicado `mariadb-replica-data`, nunca compartido con el primario.
  Tampoco publica puertos al host. Tras el cambio al espejo real de la Fase
  5, quedó **promovida**: `read_only=OFF`, replicación detenida
  (`STOP SLAVE`), y es la base de datos activa y escribible que usa
  ERPNext ahora mismo.
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
  único servicio que atiende peticiones HTTP/API contra la base de datos.
  Su destino (`db_host` en `sites/common_site_config.json`) es el que
  `switch-to-mirror.sh` reconfigura; actualmente apunta a
  `mariadb-replica:3306` (ver nota de estado al inicio de este documento).
- **backup-cron**: contenedor auxiliar (US4), imagen `docker:27-cli`, sin
  volumen propio de datos — monta el socket de Docker del host
  (`/var/run/docker.sock`) y el directorio `infra/` completo (bind mount,
  lectura-escritura). No publica puertos ni se conecta a `erpnext-net` para
  hablar con otros servicios por red: usa `docker compose exec/cp` contra
  `backend` a través del socket montado. Ejecuta
  `scripts/backup-cron-loop.sh`, que dispara `scripts/backup.sh` una vez al
  día según `scripts/backup-schedule.env` (por defecto `02:30` UTC).
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

`scripts/backup-schedule.env` (no es parte de `infra/.env`) fija la hora
diaria del respaldo automático (`BACKUP_HOUR`/`BACKUP_MINUTE`, UTC); se lee
en vivo por `backup-cron-loop.sh` cada ~30s, sin necesidad de reiniciar el
contenedor `backup-cron` al editarlo.

## Scripts (`infra/scripts/`)

| Script | Fase | Qué hace |
|---|---|---|
| `check-replication.sh` | Foundational / US2 | Reporta `Slave_IO_Running`, `Slave_SQL_Running`, `Seconds_Behind_Master`; sale con código distinto de 0 si no está Yes/Yes/0 |
| `setup-replication.sh` | US2 | Crea el usuario de replicación y configura `CHANGE MASTER TO` en la réplica |
| `seed-demo-data.sh` | US1 | Crea Company, Warehouse, Suppliers e Items ficticios (idempotente) |
| `setup-custom-fields.sh` | Requerido por `backend/` | Crea `custom_idempotency_key` en Purchase Order y Purchase Receipt |
| `create-integration-user.sh` | Requerido por `backend/` | Crea el usuario de integración y genera su API Key/Secret |
| `switch-to-mirror.sh` | US3 | Promueve `mariadb-replica` a escribible, reapunta ERPNext hacia ella, arma `read_only=1` en el primario para su próximo arranque |
| `backup.sh` | US4 | `bench backup --with-files` + copia a `infra/backups/<fecha>/`; falla visible si no hay éxito |
| `backup-cron-loop.sh` | US4 | Entrypoint del contenedor `backup-cron`: dispara `backup.sh` una vez al día según `backup-schedule.env` |
| `restore.sh` | US5 | Crea un segundo site de Frappe y restaura un respaldo existente (`bench restore --with-public-files --with-private-files`) |

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
FR-001). `docker compose up -d` también levanta `backup-cron` (US4)
automáticamente, con la programación diaria ya activa desde
`scripts/backup-schedule.env`. `switch-to-mirror.sh` (US3) y `restore.sh`
(US5) son procedimientos operativos que se ejecutan a demanda, no pasos de
un despliegue limpio — documentados en sus propias secciones arriba.
