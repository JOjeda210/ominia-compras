# Data Model: Infraestructura ERPNext con réplica y continuidad

Esta feature no maneja entidades de aplicación; sus "entidades" son
recursos de infraestructura cuyo estado se observa con comandos, no se
persiste en una base de datos propia.

## MariaDbInstance

| Campo | Tipo | Notas |
|---|---|---|
| `role` | enum: `primary` \| `replica` | Rol actual. Puede cambiar tras un cambio al espejo (FR-006). |
| `containerName` | string | Nombre del contenedor Docker. |
| `volumeName` | string | Volumen Docker dedicado, nunca compartido entre instancias (FR-003). |
| `readOnly` | boolean | `true` cuando el contenedor actúa o actuó como primario y fue degradado a réplica (FR-007). |
| `replicationState` | `ReplicationState` \| null | Solo aplica al rol `replica`. |

## ReplicationState

Resultado observado de `SHOW SLAVE STATUS` en la réplica (FR-005).

| Campo | Tipo | Notas |
|---|---|---|
| `ioThreadRunning` | boolean | `Slave_IO_Running = Yes`. |
| `sqlThreadRunning` | boolean | `Slave_SQL_Running = Yes`. |
| `secondsBehindMaster` | number \| null | 0 en operación normal (SC-002). |
| `checkedAt` | datetime | Momento de la verificación (para evidencia). |

## Backup

| Campo | Tipo | Notas |
|---|---|---|
| `generatedAt` | datetime | Fecha/hora de generación (FR-010). |
| `location` | string | Ruta en `infra/backups/`, fuera de los volúmenes activos (FR-009). |
| `databaseDumpPath` | string | Archivo de respaldo de la base de datos. |
| `siteFilesPath` | string | Archivo(s) de respaldo de los archivos del sitio (adjuntos). |
| `sourceInstance` | string | Nombre de la instancia MariaDB activa al momento del respaldo. |

## ErpnextSite

| Campo | Tipo | Notas |
|---|---|---|
| `siteName` | string | Identificador del site de Frappe. |
| `purpose` | enum: `lab` \| `restore-test` | `lab` es el sitio de laboratorio original; `restore-test` es el segundo site usado para verificar una restauración (decisión de Clarify). |
| `activeDbInstance` | `primary` \| `replica` | A cuál instancia MariaDB apunta actualmente (relevante tras un cambio al espejo). |

### Relaciones

- Un `ErpnextSite` de propósito `lab` apunta en operación normal a la
  instancia `primary`; tras un cambio al espejo (US3), pasa a apuntar a la
  instancia `replica` (ahora activa).
- Un `Backup` se genera a partir del `ErpnextSite` de propósito `lab` y se
  restaura en un `ErpnextSite` de propósito `restore-test`, nunca sobre el
  propio sitio de laboratorio (para no arriesgar los datos en uso).
