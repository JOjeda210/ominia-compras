package com.omnia.compras.catalog;

// Mirrors data-model.md CatalogSupplier fields the frontend caches offline; erpnextName is the Supplier's name/folio in ERPNext.
public record SupplierDto(String erpnextName, String supplierName) {
}
