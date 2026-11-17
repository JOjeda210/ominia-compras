# Contrato operativo: comandos de verificación

Esta feature no expone una API; su "contrato" es el conjunto de comandos
reproducibles que cualquiera (incluido el subagente `reviewer`) puede
ejecutar para verificar cada criterio de aceptación. Las credenciales reales
y nombres de contenedor se fijan en Fase 3; aquí se documenta la forma
esperada de cada comando y salida.

## Contenedores activos (US1)

```sh
docker compose -f infra/docker-compose.yml ps
```
**Esperado**: servicios de ERPNext, `mariadb-primary` y `mariadb-replica`
en estado `running`/`healthy`.

## Estado de replicación (US2)

```sh
docker compose -f infra/docker-compose.yml exec mariadb-replica \
  mariadb -u root -p"$MARIADB_ROOT_PASSWORD" -e "SHOW SLAVE STATUS\G"
```
**Esperado**: `Slave_IO_Running: Yes`, `Slave_SQL_Running: Yes`,
`Seconds_Behind_Master: 0`.

## Orden visible en la réplica (US2)

```sh
docker compose -f infra/docker-compose.yml exec mariadb-replica \
  mariadb -u root -p"$MARIADB_ROOT_PASSWORD" "$SITE_DB_NAME" \
  -e "SELECT name FROM \`tabPurchase Order\` WHERE name = '<folio>';"
```
**Esperado**: una fila con el mismo `<folio>` creado en el primario.

## Cambio al espejo (US3)

```sh
docker compose -f infra/docker-compose.yml stop mariadb-primary
infra/scripts/switch-to-mirror.sh
```
**Esperado**: ERPNext responde consultas usando `mariadb-replica`; una
orden previa es consultable y se puede crear una orden nueva.

## Primario fuera de escritura al reiniciar (US3)

```sh
docker compose -f infra/docker-compose.yml start mariadb-primary
docker compose -f infra/docker-compose.yml exec mariadb-primary \
  mariadb -u root -p"$MARIADB_ROOT_PASSWORD" -e "SHOW VARIABLES LIKE 'read_only'; SHOW VARIABLES LIKE 'super_read_only';"
```
**Esperado**: ambas variables en `ON`.

## Respaldo automático (US4)

```sh
ls -la infra/backups/
cat infra/backups/<fecha>/backup.log   # o salida equivalente del cron
```
**Esperado**: directorio con fecha reciente, dump de base de datos y
archivo(s) de sitio identificables, generado sin intervención manual.

## Restauración (US5)

```sh
infra/scripts/restore.sh infra/backups/<fecha>
```
**Esperado**: salida exitosa de `bench restore`; al abrir el site de
prueba (`restore-test`), una orden que existía al generar ese respaldo es
consultable con el mismo folio.
