# Data Model: Compras offline con sincronización a ERPNext

Entidades locales (cliente, Dexie/IndexedDB). El estado autoritativo de los
documentos de negocio vive en ERPNext (Principio III); estas entidades son
la representación local usada para capturar sin conexión y gestionar la
cola de sincronización.

## CatalogSupplier

Copia de solo lectura de un Supplier de ERPNext, descargada al dispositivo.

| Campo | Tipo | Notas |
|---|---|---|
| `erpnextName` | string | Folio/identificador del Supplier en ERPNext. Clave primaria local. |
| `supplierName` | string | Nombre para mostrar en la UI. |
| `fetchedAt` | datetime | Para saber cuándo se refrescó el catálogo. |

## CatalogItem

Copia de solo lectura de un Item de ERPNext, descargada al dispositivo.

| Campo | Tipo | Notas |
|---|---|---|
| `erpnextName` | string | Clave primaria local. |
| `itemName` | string | Nombre para mostrar. |
| `stockUom` | string | Unidad de medida. |
| `isStockItem` | boolean | Si lleva control de inventario (relevante para recepción). |
| `fetchedAt` | datetime | |

## LocalPurchaseDocument

Tabla única para órdenes de compra y recibos de compra locales,
discriminada por `documentType`. Ver [Clarifications](./spec.md#clarifications)
de la spec: "sincronizada" no es un estado adicional, es solo la forma en
que la UI describe un documento con `erpnextName` ya asignado.

| Campo | Tipo | Notas |
|---|---|---|
| `localId` | string (UUID) | Clave primaria local, generado al crear. |
| `documentType` | enum: `purchase_order` \| `purchase_receipt` | Discriminador. |
| `idempotencyKey` | string (UUID) | FR-007. Generado en el cliente antes del primer intento de envío. Único. |
| `syncStatus` | enum: `pending` \| `syncing` \| `synced` \| `failed` | FR-003, FR-005. Cada registro se procesa de forma independiente (clarificación de la spec). |
| `erpnextName` | string \| null | Folio asignado por ERPNext una vez `syncStatus = synced`. |
| `erpnextStatus` | enum: `draft` \| `submitted` \| `cancelled` \| null | Estado que reporta ERPNext (FR-011); null mientras no exista el documento remoto. |
| `errorMessage` | string \| null | Último mensaje comprensible si `syncStatus = failed` (FR-016). |
| `supplierRef` | string \| null | `erpnextName` del `CatalogSupplier` (solo para `purchase_order`). |
| `purchaseOrderRef` | string \| null | `erpnextName` de la orden de origen (solo para `purchase_receipt`). FR-013. |
| `lines` | `LocalDocumentLine[]` | Renglones embebidos. |
| `createdAt` / `updatedAt` | datetime | `updatedAt` es la referencia para "última versión" (FR-002). |

### Reglas de validación

- `idempotencyKey` se genera exactamente una vez, en la creación local, y
  nunca cambia aunque el documento se edite o se reintente su envío
  (FR-007, FR-008).
- Un `purchase_receipt` siempre requiere `purchaseOrderRef` no nulo (FR-012,
  FR-013).
- Mientras `syncStatus != synced`, `erpnextName` es `null`.

### Transiciones de estado (`syncStatus`)

```text
pending --(conexión disponible)--> syncing
syncing --(ERPNext confirma)--> synced
syncing --(timeout / respuesta perdida, incluye reintento con misma key)--> syncing  (reintenta)
syncing --(ERPNext rechaza por error real)--> failed
failed  --(usuario corrige y reintenta)--> syncing
pending --(usuario descarta, confirmación explícita)--> (registro eliminado, FR-004)
```

Un `failed` en un registro no cambia el `syncStatus` de ningún otro registro
(clarificación de la spec: cola independiente por documento).

## LocalDocumentLine

Renglón embebido dentro de `LocalPurchaseDocument`.

| Campo | Tipo | Notas |
|---|---|---|
| `itemRef` | string | `erpnextName` del `CatalogItem`. |
| `quantity` | number | Cantidad solicitada (orden) o recibida (recibo). |
| `warehouseRef` | string \| null | Solo para renglones de `purchase_receipt` (FR-012). |
| `sourceOrderLineRef` | string \| null | Solo para renglones de `purchase_receipt`: referencia al renglón original de la orden (FR-013), necesaria para que ERPNext calcule saldo pendiente (FR-014, FR-015). |
