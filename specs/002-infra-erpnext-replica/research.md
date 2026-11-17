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
