# Contrato de datos: Frontend ↔ Backend

Toda clave en inglés (Principio VIII). El frontend nunca llama a ERPNext
directamente; todas sus peticiones van a este backend, que conserva las
credenciales de ERPNext (Principio IV) y traduce los errores (Principio V).

## Convenciones generales

- Content-Type: `application/json` en todas las peticiones y respuestas.
- Toda escritura (`POST`) que crea un Purchase Order o un Purchase Receipt
  lleva un campo `idempotencyKey` (UUID v4) generado por el cliente. Un
  reintento con la misma clave devuelve el mismo recurso ya creado (200),
  no un 201 duplicado (Principio II).
- Formato de error estándar (ver `research.md`, sección "Formato de errores
  traducidos"):

```json
{
  "errorCode": "ERPNEXT_VALIDATION_ERROR",
  "message": "No se puede cancelar: existe un recibo de compra vinculado a esta orden.",
  "erpnextDetail": "LinkExistsError: Purchase Receipt PR-0003 ..."
}
```

- Estados de orden expuestos al frontend: `pending` (aún local, sin
  `erpnextName`), `draft` (sincronizada, folio en ERPNext, editable),
  `submitted` (presentada), `cancelled`. "Sincronizada" es solo la etiqueta
  de UI para `draft` o posterior (ver Clarifications de la spec).

## Catálogos

### `GET /api/catalog/suppliers`

Lista los proveedores disponibles para captura offline (respaldado por
`GET /api/resource/Supplier` en ERPNext).

**Response 200**:
```json
{
  "suppliers": [
    { "erpnextName": "SUP-0001", "supplierName": "Proveedor Ficticio SA" }
  ]
}
```

### `GET /api/catalog/items`

Lista los artículos disponibles (respaldado por `GET /api/resource/Item`).

**Response 200**:
```json
{
  "items": [
    {
      "erpnextName": "ITEM-0001",
      "itemName": "Tornillo 1/4\"",
      "stockUom": "Unidad",
      "isStockItem": true
    }
  ]
}
```

### `GET /api/catalog/warehouses`

Lista los almacenes disponibles para registrar recibos (respaldado por
`GET /api/resource/Warehouse`, filtrando `is_group=0`: ERPNext rechaza los
nodos de grupo del árbol de almacenes como destino de una transacción —
hallazgo de Fase 4, ver `research.md`). `spec.md` Assumptions garantiza al
menos un almacén no-grupo para esta demo.

**Response 200**:
```json
{
  "warehouses": [
    { "erpnextName": "WH-0001", "warehouseName": "Almacén Central" }
  ]
}
```

## Órdenes de compra

### `POST /api/purchase-orders`

Crea (o recupera, si la `idempotencyKey` ya existe) un Purchase Order como
borrador en ERPNext. Implementa FR-005 a FR-008.

**Request**:
```json
{
  "idempotencyKey": "b3f1c2a0-...-uuid",
  "supplierRef": "SUP-0001",
  "lines": [
    { "itemRef": "ITEM-0001", "quantity": 10, "unitPrice": 15.5 }
  ]
}
```

**Response 200/201** (200 si la `idempotencyKey` ya existía y se recuperó el
folio; 201 si se creó por primera vez — el cuerpo es idéntico en ambos
casos, FR-008):
```json
{
  "erpnextName": "PUR-ORD-2026-00001",
  "status": "draft",
  "supplierRef": "SUP-0001",
  "lines": [
    { "itemRef": "ITEM-0001", "quantity": 10, "unitPrice": 15.5, "receivedQuantity": 0 }
  ]
}
```

**Errores posibles**: `400` (payload inválido), `502` con `errorCode:
"ERPNEXT_UNREACHABLE"` (ERPNext no responde; el frontend debe tratar la
orden como `pending` y reintentar más tarde, no como `failed` definitivo).

### `PUT /api/purchase-orders/{erpnextName}`

Edita una orden ya existente en ERPNext (mismo folio). Implementa FR-009.

**Request**:
```json
{
  "idempotencyKey": "b3f1c2a0-...-uuid",
  "lines": [
    { "itemRef": "ITEM-0001", "quantity": 12, "unitPrice": 15.5 }
  ]
}
```

**Response 200**: mismo formato que la creación.

### `POST /api/purchase-orders/{erpnextName}/submit`

Presenta (`Submit`) la orden. Implementa parte de FR-010/FR-011.

**Response 200**: `{ "erpnextName": "...", "status": "submitted" }`

### `POST /api/purchase-orders/{erpnextName}/cancel`

Cancela la orden. Implementa FR-010/FR-011.

**Response 200**: `{ "erpnextName": "...", "status": "cancelled" }`

**Response 409** si ERPNext bloquea la cancelación (p. ej. recibo
vinculado), con el formato de error estándar y `message` comprensible.

### `GET /api/purchase-orders/{erpnextName}`

Consulta el estado actual de una orden (para refrescar `status`,
`receivedQuantity` por renglón, etc.).

## Recibos de compra

### `POST /api/purchase-receipts`

Crea (o recupera) un Purchase Receipt vinculado a una orden y su(s)
renglón(es) de origen. Implementa FR-007, FR-008, FR-012 a FR-015.

**Request**:
```json
{
  "idempotencyKey": "9a2e7d10-...-uuid",
  "purchaseOrderRef": "PUR-ORD-2026-00001",
  "lines": [
    {
      "sourceOrderLineRef": "PUR-ORD-2026-00001-ITEM-0001",
      "itemRef": "ITEM-0001",
      "quantity": 4,
      "warehouseRef": "WH-0001"
    }
  ]
}
```

**Response 200/201**:
```json
{
  "erpnextName": "PUR-REC-2026-00001",
  "purchaseOrderRef": "PUR-ORD-2026-00001",
  "lines": [
    { "itemRef": "ITEM-0001", "quantity": 4, "warehouseRef": "WH-0001" }
  ],
  "orderBalance": [
    { "itemRef": "ITEM-0001", "pendingQuantity": 6 }
  ]
}
```

`orderBalance` es lo que la app usa para mostrar "saldo pendiente" (FR-014)
sin tener que volver a consultar la orden completa.

**Errores posibles**: `409` con `errorCode: "QUANTITY_EXCEEDS_BALANCE"` si
la cantidad recibida supera el saldo pendiente (edge case de la spec).
