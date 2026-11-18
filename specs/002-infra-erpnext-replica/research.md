# Research: Infraestructura ERPNext con réplica y continuidad

## Base de despliegue

**Decision**: Partir de `frappe/frappe_docker`, adaptando su Compose de
producción (no el `pwd.yml` de demo desechable) para añadir persistencia
explícita, red privada, segundo servicio MariaDB (réplica) y respaldos.
Versiones exactas de ERPNext y MariaDB a registrar en `infra/.env.example`
una vez elegidas en Fase 3 (se fijará una versión de ERPNext estable y
MariaDB ≥10.6, mínimo que soporta GTID de forma completa).

**Rationale**: El PDF original es explícito: la demo (`pwd.yml`) es solo
para explorar; la entrega debe adaptar Compose con persistencia, red
privada, réplica y respaldos. Partir de `frappe_docker` reutiliza la
configuración ya probada de ERPNext/Frappe en vez de construir las
imágenes desde cero.

**Alternatives considered**: Construir una imagen propia de ERPNext desde
el código fuente: se descartó por esfuerzo innecesario para el alcance de
esta prueba; `frappe_docker` ya es la referencia oficial.

## Replicación GTID primario/réplica

**Decision**: Dos servicios MariaDB en el mismo `docker-compose.yml`
(`mariadb-primary`, `mariadb-replica`), cada uno con su volumen propio,
unidos por una red Docker privada (`bridge`, sin publicar puertos al host
salvo el necesario para diagnóstico). El primario habilita
`gtid_strict_mode=ON`, `log_bin`, `server_id` único; la réplica se
configura con `CHANGE MASTER TO ... MASTER_USE_GTID=slave_pos` (o
`=current_pos` según la versión de MariaDB) y un usuario de replicación
dedicado con privilegio `REPLICATION SLAVE` únicamente. Verificación con
`SHOW SLAVE STATUS\G` leyendo `Slave_IO_Running`, `Slave_SQL_Running` y
`Seconds_Behind_Master`.

**Rationale**: Es el mecanismo estándar de MariaDB para replicación basada
en GTID, documentado y estable entre versiones recientes; usar una red
privada aislada evita exponer el tráfico de replicación fuera del host.

**Alternatives considered**: Replicación basada en posición de binlog
(sin GTID): se descartó porque el PDF pide explícitamente GTID, y porque
GTID simplifica la promoción de la réplica (no requiere calcular
manualmente la posición del binlog al reconectar).

**Pendiente de verificación empírica (Fase 3)**: confirmar la sintaxis
exacta de `CHANGE MASTER TO` soportada por la versión de MariaDB elegida
(difiere ligeramente entre 10.6/10.11/11.x), y medir el retraso real bajo
la carga de las pruebas de este proyecto (se espera 0 s dado el volumen
ficticio y bajo).

## Cambio al espejo y protección de solo-lectura

**Decision**: El cambio al espejo es manual (confirmado en Clarify como
fuera de alcance el failover automático): `docker compose stop
mariadb-primary`, luego reconfigurar la variable de entorno de conexión de
ERPNext (`DB_HOST` en el `site_config.json` del sitio, o la variable
equivalente de `frappe_docker`) para apuntar a `mariadb-replica`, y
reiniciar el contenedor de la app ERPNext para que tome la nueva conexión.
Al volver a iniciar el antiguo primario, se arranca con
`read_only=1` y `super_read_only=1` en su configuración (`gtid.cnf`),
manteniendo su rol de réplica hasta que un administrador decida
re-promoverlo explícitamente.

**Rationale**: `read_only`/`super_read_only` son las banderas estándar de
MariaDB para evitar escrituras directas y accidentales (incluso por un
usuario con privilegios), cumpliendo FR-007 sin necesitar un orquestador
externo de failover.

**Alternatives considered**: Herramientas de orquestación automática de
failover (p. ej. MaxScale, Orchestrator): se descartaron por quedar fuera
del alcance definido (sin alta disponibilidad real automática) y por
añadir complejidad operativa no requerida para una prueba en una sola
máquina.

## Respaldos automáticos

**Decision**: Un contenedor o proceso programado (cron dentro de un
contenedor auxiliar, o `bench --site <site> backup --with-files`
invocado por un `cron` del sistema anfitrión) que corre una vez al día
(decisión de Clarify), genera el respaldo de base de datos y archivos del
sitio con los comandos nativos de `bench`, y copia el resultado a
`infra/backups/<fecha>/`, fuera de los volúmenes Docker activos.

**Rationale**: `bench backup --with-files` es el mecanismo nativo de
Frappe para generar un respaldo consistente de la base de datos junto con
los archivos adjuntos del sitio en un solo paso, evitando construir un
mecanismo de respaldo de base de datos a mano.

**Alternatives considered**: `mysqldump` directo sobre el contenedor
MariaDB sin pasar por `bench`: se descartó porque no incluye los archivos
del sitio (adjuntos) en el mismo flujo, obligando a coordinar dos
mecanismos de respaldo por separado.

## Restauración verificable

**Decision**: Un segundo site de Frappe dentro del mismo bench/contenedor
(decisión de Clarify): `bench new-site <site-prueba>` seguido de `bench
--site <site-prueba> restore <ruta-del-respaldo> --with-private-files
--with-public-files`.

**Rationale**: Es el flujo multi-tenant nativo de Frappe, más liviano que
levantar una segunda pila de Compose completa, y demuestra la
restauración real de un respaldo generado por el mecanismo de la sección
anterior.

**Alternatives considered**: Pila Docker Compose separada: descartada en
Clarify por consumo de recursos innecesario en una sola máquina.

## Versiones elegidas (Fase 3, verificación empírica)

**Decision**: `frappe/erpnext:v15.47.0` (ERPNext/Frappe v15, línea estable
activamente mantenida al momento de este proyecto) y `mariadb:10.6`
(`10.6.28-MariaDB`, el mínimo definido en este documento para soportar GTID
por completo). Ambas imágenes se descargaron y probaron localmente contra
Docker Desktop (Windows) antes de construir el Compose definitivo.

**Rationale**: v15.47.0 ya estaba disponible localmente y es una release
oficial estable (existen parches más recientes dentro de la misma línea
v15, pero no aportan nada relevante para el alcance de este laboratorio);
mariadb:10.6 es exactamente la versión mínima que este documento ya había
fijado como objetivo, reduciendo el riesgo de incompatibilidades de sintaxis
frente a versiones más nuevas (11.x) sin verificar.

## Desviaciones encontradas al desplegar contra la versión real (Fase 3)

Estas tres desviaciones se descubrieron ejecutando el laboratorio completo
contra `frappe/erpnext:v15.47.0` y `mariadb:10.6`; el enfoque se ajustó en
los scripts de `infra/scripts/`, no se forzó nada contra la evidencia real:

1. **Maestros de UOM/Item Group/Supplier Group ausentes tras `bench
   new-site --install-app erpnext`**: ese comando solo ejecuta el hook
   `after_install` de ERPNext; los registros que normalmente crea el Setup
   Wizard (p. ej. `Item Group "All Item Groups"`, UOM `"Nos"`,
   `Supplier Group "All Supplier Groups"`) NUNCA se crean si nadie completa
   el wizard en el navegador. Como este laboratorio es desatendido, no hay
   wizard. **Ajuste**: `infra/scripts/seed-demo-data.sh` llama
   explícitamente a
   `erpnext.setup.setup_wizard.operations.install_fixtures.install(country=...)`
   (la misma función que invoca el wizard) antes de crear la Company, el
   Warehouse, los Suppliers y los Items, si `"All Item Groups"` aún no
   existe.
2. **`generate_keys(user)` de Frappe devuelve un `dict`, no un `str`**: en
   esta versión, `frappe.core.doctype.user.user.generate_keys` retorna
   `{"api_secret": "..."}`, no el secreto como cadena directa. **Ajuste**:
   `infra/scripts/create-integration-user.sh` extrae `["api_secret"]` del
   resultado antes de imprimirlo.
3. **`api_key`/`api_secret` son campos `permlevel=1`; sin `commit()`
   explícito, el cambio se pierde al cerrar `bench console` sin una salida
   limpia** (el heredoc cierra stdin, lo que no dispara el commit
   automático de fin de request que sí ocurre en una sesión HTTP normal).
   La primera ejecución del script mostró el API Key/Secret en pantalla
   pero, al reconectar en una sesión nueva, `api_key`/`api_secret` estaban
   `NULL` en la base: el cambio nunca se persistió. **Ajuste**: el script
   llama a `frappe.db.commit()` inmediatamente después de `generate_keys()`,
   antes de leer `user.api_key` para imprimirlo. Verificado empíricamente:
   tras el ajuste, una sesión nueva de `bench console` confirma el mismo
   `api_key` en `tabUser`, y una llamada real a
   `GET /api/resource/Supplier` con `Authorization: token <key>:<secret>`
   devuelve `200 OK`.

Ninguna desviación afectó la sintaxis de `CHANGE MASTER TO ...
MASTER_USE_GTID=slave_pos` ni de `SHOW SLAVE STATUS`: ambas funcionaron tal
como se documentó arriba contra MariaDB 10.6, sin ajustes. Al iniciar la
réplica por primera vez, `Seconds_Behind_Master` reportó un valor alto
(cientos de segundos) mientras aplicaba el backlog completo de binlog
generado durante la instalación de ERPNext y la carga de datos ficticios;
esto es el comportamiento esperado de una réplica que arranca después de
que el primario ya generó binlog, no un error, y bajó a `0` en menos de un
minuto una vez que el hilo SQL alcanzó al primario.

## Desviaciones encontradas al ejecutar el cambio al espejo y los respaldos (Fase 5)

Dos desviaciones reales frente a lo previsto en este documento, encontradas
ejecutando `switch-to-mirror.sh` y el mecanismo de respaldos contra la
instancia real:

1. **MariaDB no tiene la variable `super_read_only`**: el primer intento de
   `switch-to-mirror.sh` ejecutó `SET GLOBAL super_read_only = 0/1` (y el
   plan original de `gtid.cnf` iba a incluir esa misma línea), replicando el
   mecanismo de MySQL. Contra `mariadb:10.6` esto falla en vivo con
   `ERROR 1193 (HY000): Unknown system variable 'super_read_only'`: MariaDB
   nunca implementó esa variable; su equivalente conceptual es el privilegio
   por cuenta `READ_ONLY ADMIN` (introducido en 10.5.2), que decide quién
   puede saltarse un `read_only=1` ya activo, en vez de una segunda bandera
   global que bloquee a todos sin excepción. **Ajuste**: tanto
   `infra/scripts/switch-to-mirror.sh` como el bloque añadido a
   `infra/mariadb-primary/conf.d/gtid.cnf` usan únicamente `read_only=1`.
   Esto es suficiente para FR-007 porque el usuario de MariaDB propio del
   site de ERPNext no tiene ningún privilegio fuera de su propio esquema
   (confirmado con `SHOW GRANTS FOR '<site_db_user>'@'%'`: solo
   `ALL PRIVILEGES` sobre su propia base, nada global); verificado en vivo
   intentando un `UPDATE` real contra el primario demovido con ese mismo
   usuario, que fue rechazado con
   `ERROR 1290 (HY000): The MariaDB server is running with the --read-only
   option so it cannot execute this statement` (evidencia completa en
   `infra/evidence/us3-mirror-switch.txt`).
2. **`read_only=1` permanente en `mariadb-primary/conf.d/gtid.cnf` rompería
   un despliegue limpio desde cero**: la sección anterior de este documento
   (y `tasks.md` T015) describían ajustar ese archivo de forma estática y
   permanente. Verificado en vivo que el usuario de MariaDB del site no
   tiene privilegio `SUPER`/`READ_ONLY ADMIN`, por lo que si `read_only=1`
   estuviera presente desde el primer arranque, `bench new-site
   --install-app erpnext` fallaría al instalar ERPNext (ese paso escribe
   usando las credenciales propias del site, no las de `root`), violando
   FR-001/SC-001 para cualquier despliegue futuro desde cero. **Ajuste**:
   `infra/mariadb-primary/conf.d/gtid.cnf` permanece limpio en el repositorio
   para un despliegue nuevo; `switch-to-mirror.sh` es quien añade el bloque
   `read_only=1` al archivo, en el momento real de la democión, no antes.
   Esto cumple literalmente FR-007 ("al reiniciarse **después de una
   democión**") sin sacrificar la reproducibilidad de un despliegue limpio.

## Mecanismo de respaldos automáticos elegido (Fase 5)

Se eligió un contenedor auxiliar nuevo (`backup-cron`, imagen `docker:27-cli`)
en vez de `cron` del sistema anfitrión, para mantener todo dentro de Docker
Compose y reproducible igual en cualquier máquina (Windows/Mac/Linux con
Docker Desktop), en vez de depender de Task Scheduler/cron del host (que
difiere por sistema operativo). Este contenedor monta el socket de Docker
del host (`/var/run/docker.sock`) y el directorio `infra/` completo, y corre
un bucle en `sh` (POSIX, sin dependencias) que cada ~30s compara la hora UTC
actual contra `infra/scripts/backup-schedule.env` (por defecto `02:30` UTC,
fuera del horario de uso simulado, decisión ya registrada arriba) y, al
coincidir, invoca el mismo `infra/scripts/backup.sh` que se documenta como
reproducible manualmente, vía `docker compose exec/cp` reales contra el
servicio `backend` (no una reimplementación paralela de la lógica de
respaldo). **Trade-off documentado**: este contenedor obtiene control total
del daemon Docker del host vía el socket montado; aceptable para un
laboratorio local de una sola máquina con datos ficticios (fuera de alcance
cualquier arquitectura multi-host), no recomendable sin ajustes para un
entorno de producción compartido.

## Colisión de numeración al revertir el cambio al espejo (Fase 6)

**Hallazgo**: al revertir el cambio al espejo de Fase 5 (primario activo de
nuevo, réplica re-sincronizada), el hilo SQL de la réplica se detuvo con
`Duplicate entry 'PUR-ORD-2026-00040' for key 'PRIMARY'` (`Last_Errno:
1062`). Causa real: mientras la réplica fue la base activa (Fase 5),
ERPNext creó ahí una orden con folio `PUR-ORD-2026-00040` (numeración
secuencial propia de esa instancia). Al volver el primario a ser el activo,
su propio contador de numeración —independiente, nunca se enteró de lo que
pasó en la réplica mientras estuvo de solo lectura— también llegó a
`PUR-ORD-2026-00040` con un documento real distinto. Al reanudar la
replicación primario→réplica, el evento de escritura del primario para ese
mismo nombre chocó con la fila local ya existente en la réplica.

**Por qué pasa**: el campo `name` de Purchase Order en ERPNext se genera
por una serie de numeración (`tabSeries`) almacenada en la misma base de
datos, no por un generador externo coordinado entre primario y réplica. Un
cambio al espejo real dejado sin resincronizar expone exactamente este
riesgo: cualquier documento nuevo creado en cada lado mientras estuvieron
divergentes puede colisionar por nombre al reunificar.

**Arreglo aplicado**: se comparó el contenido de ambas filas (`docstatus`,
`supplier`, `creation`) para confirmar cuál era la versión "real" que debía
prevalecer (la del primario, ya presentada) y se borró manualmente la fila
local de la réplica (y su renglón hijo en `Purchase Order Item`) antes de
reanudar el hilo SQL (`START SLAVE SQL_THREAD`). Verificado: replicación
Yes/Yes 0s restaurada, y una orden nueva creada después (`PUR-ORD-2026-
00041`) replicó limpio de punta a punta.

**Alcance de la limitación**: este proyecto no implementa detección ni
resolución automática de colisiones de numeración tras un cambio al espejo
(fuera del alcance definido en `spec.md`: sin failover/failback automático).
Un cambio al espejo real en producción necesitaría, antes de reanudar la
replicación en sentido inverso, reconciliar o descartar explícitamente
cualquier documento creado del lado que estuvo activo temporalmente — aquí
se resolvió a mano porque los datos son ficticios y de un solo documento de
prueba, no un mecanismo reproducible para datos reales.
