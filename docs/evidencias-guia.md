# Guía de evidencias (1 a 11)

Numeración y contenido exigidos por la prueba técnica (páginas 7-8 del PDF
original). Para cada evidencia: qué capturar, con qué comando o pantalla,
y el pie de foto sugerido. Las evidencias 1, 3, 4, 5 y 6 son de terminal/
navegador (las tomas tú, siguiendo los comandos ya probados abajo); las
evidencias 7 a 11 se generan automáticamente con Playwright en
`evidencias/` (ver `e2e/evidence-capture.spec.ts`).

**Antes de empezar**: oculta siempre contraseñas, API keys y tokens de
cualquier captura (usa datos ficticios, ya es el caso en todo el proyecto).

---

## 1. Contenedores activos

```sh
cd infra
docker compose ps
```

Debe verse `omnia-erpnext-backend`, `omnia-erpnext-frontend`,
`omnia-mariadb-primary` y `omnia-mariadb-replica` (y el resto de servicios
auxiliares) en `Up`/`Up (healthy)`.

**Pie sugerido**: "Todos los servicios de ERPNext y las dos instancias de
MariaDB (primario y réplica) corriendo."

## 2. ERPNext en funcionamiento

Abre en tu navegador:

```
http://localhost:8080
```

(o `http://lab.localhost:8080` si agregaste la entrada a tu archivo de
hosts). Debe verse la interfaz de ERPNext y la barra de direcciones con la
URL.

**Pie sugerido**: "Sitio de laboratorio de ERPNext accesible en
http://localhost:8080."

## 3. Réplica GTID

```sh
cd infra
set -a; source .env; set +a

# Qué instancia es + que usa GTID
docker compose exec -T mariadb-replica mariadb -u root -p"$MARIADB_ROOT_PASSWORD" \
  -e "SELECT @@server_id AS this_is_the_replica_server_id, @@hostname AS container_hostname, @@gtid_strict_mode AS gtid_strict_mode;"

# Hilos Yes/Yes, retraso 0s, modo GTID
docker compose exec -T mariadb-replica mariadb -u root -p"$MARIADB_ROOT_PASSWORD" \
  -e "SHOW SLAVE STATUS\G" | grep -E "Master_Host|Using_Gtid|Gtid_IO_Pos|Slave_IO_Running|Slave_SQL_Running|Seconds_Behind_Master"

# Misma orden que en el primario
DB_NAME=$(docker compose exec -T backend bash -c \
  "python3 -c \"import json;print(json.load(open('sites/lab.localhost/site_config.json'))['db_name'])\"" | tr -d '\r')
docker compose exec -T mariadb-replica mariadb -u root -p"$MARIADB_ROOT_PASSWORD" "$DB_NAME" \
  -e "SELECT name, docstatus, supplier, transaction_date FROM \`tabPurchase Order\` WHERE name='PUR-ORD-2026-00001';"
```

Debe verse `server_id=2` (la réplica), `Slave_IO_Running: Yes`,
`Slave_SQL_Running: Yes`, `Seconds_Behind_Master: 0`, y la fila de
`PUR-ORD-2026-00001` con los mismos datos que tiene en el primario.

**Pie sugerido**: "Réplica (server_id 2) con hilos Yes/Yes, 0 s de
retraso, y la orden PUR-ORD-2026-00001 visible con el mismo folio que en
el primario."

## 4. Cambio al espejo

**Captura esta evidencia AL FINAL**, después de las evidencias 1, 2, 3, 5
y 6 — deja el laboratorio en estado "post-cambio al espejo" (no hace falta
revertirlo de nuevo después, es el cierre natural de la demostración).

```sh
cd infra
set -a; source .env; set +a

# 1. Simular caída del primario
docker compose stop mariadb-primary

# 2. Promover la réplica y reapuntar ERPNext
bash scripts/switch-to-mirror.sh

# 3. Consultar una orden anterior (ahora servida por la réplica promovida)
curl -s -H "Authorization: token ${ERPNEXT_INTEGRATION_API_KEY}:${ERPNEXT_INTEGRATION_API_SECRET}" \
  -H "Host: lab.localhost" \
  "http://localhost:8080/api/resource/Purchase%20Order/PUR-ORD-2026-00001"

# 4. Crear una orden nueva (prueba que la réplica promovida acepta escrituras)
curl -s -X POST \
  -H "Authorization: token ${ERPNEXT_INTEGRATION_API_KEY}:${ERPNEXT_INTEGRATION_API_SECRET}" \
  -H "Content-Type: application/json" -H "Host: lab.localhost" \
  "http://localhost:8080/api/resource/Purchase%20Order" \
  -d '{"company":"Omnia Compras Demo","supplier":"Proveedor Ficticio Uno","schedule_date":"2026-11-20","items":[{"item_code":"ART-001","qty":5,"rate":50,"schedule_date":"2026-11-20"}]}'
```

Captura: el contenedor `mariadb-primary` detenido (`docker compose ps`),
la respuesta del paso 3 (orden anterior, legible) y la respuesta del paso 4
(folio nuevo, legible). Ambos folios deben quedar visibles en la captura o
en el pie de foto.

**Pie sugerido**: "Primario detenido; ERPNext usa la réplica promovida.
Orden anterior (PUR-ORD-2026-00001) consultable y orden nueva creada
(folio visible), ambas servidas por la réplica."

## 5. Respaldo automático

```sh
cd infra
ls -la backups/2026-11-18_182529Z/
cat backups/2026-11-18_182529Z/backup.log
```

(O la carpeta de fecha más reciente dentro de `infra/backups/` si ya se
disparó una ejecución más nueva del `backup-cron`). Debe verse la fecha,
la ubicación, y los 4 archivos del respaldo (config, base de datos,
archivos públicos/privados del sitio).

**Pie sugerido**: "Respaldo generado automáticamente por backup-cron
(sin disparo manual), identificable por fecha y ubicación fuera de los
volúmenes de los contenedores."

## 6. Restauración

```sh
cd infra
bash scripts/restore.sh backups/2026-11-18_182529Z restore-test.localhost

docker compose exec backend bench --site restore-test.localhost console
# dentro de la consola:
frappe.db.get_value("Purchase Order", "PUR-ORD-2026-00001", ["name", "docstatus", "supplier", "transaction_date"], as_dict=True)
```

Debe verse la salida `RESTORE_OK` y la consulta devolviendo
`PUR-ORD-2026-00001` con los mismos datos que tenía al generar ese
respaldo.

**Pie sugerido**: "Restauración exitosa en el sitio de prueba
restore-test.localhost; la orden PUR-ORD-2026-00001 existente al generar
el respaldo es consultable con el mismo folio y datos."

---

## 7 a 11 — Evidencias de la app (automatizadas con Playwright)

Generadas por `e2e/evidence-capture.spec.ts` contra el backend y ERPNext
reales (sin mocks), guardadas en `evidencias/` con nombres numerados
(`07a-...png`, `07b-...png`, etc.). Cada imagen ya corresponde 1:1 con lo
que pide el PDF:

- **7. Captura offline y persistencia**: `07a` (orden pendiente sin red),
  `07b` (misma orden, cantidad editada, todavía sin red), `07c` (diálogo
  de descarte de otra captura), `07d` (ya no está en la lista).
- **8. Sincronización automática**: `08a` (app, orden sincronizada con
  folio), `08b` (ERPNext, mismo folio/proveedor/cantidad). Pie: la
  sincronización ocurrió sin pulsar ningún botón.
- **9. Edición y cancelación**: `09a`/`09b` (mismo folio, app y ERPNext,
  con el nuevo valor), `09c` (confirmación de cancelación en la app),
  `09d` (estado Cancelled en ERPNext).
- **10. Recepción parcial y total**: `10a` (primer recibo, saldo 6 en la
  app), `10b` (segundo recibo, saldo 0, dos recibos listados),
  `10c` (ambos Purchase Receipt en ERPNext con cantidades y almacén).
- **11. Reintentos sin duplicados**: `11a`/`11b` (orden: folio recuperado
  en la app / un solo documento en ERPNext), `11c`/`11d` (mismo patrón
  para un recibo).

Arma `evidencias/Evidencias.pdf` numerando estas imágenes según la lista
de arriba, con un pie breve por cada una (acción + resultado observado,
como se sugiere en cada sección).
