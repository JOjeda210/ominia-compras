# Quickstart: Infraestructura ERPNext con réplica y continuidad

## Prerrequisitos

1. Docker Desktop corriendo, con suficiente RAM asignada (verificado en
   Fase 1: ~15.5 GiB disponibles).
2. `infra/.env` creado a partir de `infra/.env.example` con contraseñas de
   prueba (ficticias, nunca commiteadas).

## Despliegue (US1)

```sh
docker compose -f infra/docker-compose.yml up -d
infra/scripts/check-replication.sh
```
**Esperado**: ERPNext accesible en el navegador; datos ficticios de prueba
(empresa, almacén, proveedores, artículos) ya cargados.

## Réplica GTID (US2)

1. Crear una orden de prueba en ERPNext (UI o API).
2. Ejecutar `infra/scripts/check-replication.sh` y confirmar Yes/Yes, 0 s.
3. Consultar la misma orden directamente en `mariadb-replica` (ver
   `contracts/operational-checks.md`).

## Cambio al espejo (US3)

```sh
docker compose -f infra/docker-compose.yml stop mariadb-primary
infra/scripts/switch-to-mirror.sh
```
Consultar la orden anterior y crear una orden nueva desde ERPNext (ahora
sobre la réplica promovida). Reiniciar el antiguo primario y confirmar
`read_only`/`super_read_only` en `ON`.

## Respaldos automáticos (US4)

La programación diaria se configura una sola vez al desplegar (ver
`research.md`). Para forzar una ejecución de prueba sin esperar al
horario programado:

```sh
infra/scripts/backup.sh
ls infra/backups/
```

## Restauración (US5)

```sh
infra/scripts/restore.sh infra/backups/<fecha>
```
Abrir el site `restore-test` resultante y consultar una orden que existía
al generar ese respaldo, confirmando mismo folio y mismos datos.
