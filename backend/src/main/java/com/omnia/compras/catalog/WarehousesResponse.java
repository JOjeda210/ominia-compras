package com.omnia.compras.catalog;

import java.util.List;

// Response envelope for GET /api/catalog/warehouses ({"warehouses": [...]}).
public record WarehousesResponse(List<WarehouseDto> warehouses) {
}
