package com.omnia.compras.catalog;

// Extra catalog entry (beyond contracts/backend-api.md's documented Supplier/Item) needed so the receipt flow can reference a real
// warehouse name instead of hardcoding one in the frontend; spec.md Assumptions guarantees exactly one Warehouse exists in this demo.
public record WarehouseDto(String erpnextName, String warehouseName) {
}
