package com.omnia.compras.purchasereceipt;

// One line of contracts/backend-api.md POST /api/purchase-receipts response.
public record PurchaseReceiptLineResponse(String itemRef, double quantity, String warehouseRef) {
}
