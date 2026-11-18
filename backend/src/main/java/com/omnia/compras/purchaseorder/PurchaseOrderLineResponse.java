package com.omnia.compras.purchaseorder;

// One line of contracts/backend-api.md POST /api/purchase-orders response; receivedQuantity is always 0 right after creation.
public record PurchaseOrderLineResponse(String itemRef, double quantity, double unitPrice, double receivedQuantity) {
}
