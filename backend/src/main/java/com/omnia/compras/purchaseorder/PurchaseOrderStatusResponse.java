package com.omnia.compras.purchaseorder;

// Matches contracts/backend-api.md submit/cancel response body: just the folio and the resulting ERPNext lifecycle status.
public record PurchaseOrderStatusResponse(String erpnextName, String status) {
}
