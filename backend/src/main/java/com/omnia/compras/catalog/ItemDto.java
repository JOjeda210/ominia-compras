package com.omnia.compras.catalog;

// Mirrors data-model.md CatalogItem; isStockItem matters later for receipt capture (only stock items need a warehouse, per US4/US5).
public record ItemDto(String erpnextName, String itemName, String stockUom, boolean isStockItem) {
}
