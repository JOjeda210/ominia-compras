package com.omnia.compras.purchasereceipt;

import java.util.List;

// Matches contracts/backend-api.md POST /api/purchase-receipts response body exactly, identical whether created (201) or recovered (200).
public record PurchaseReceiptResponse(
        String erpnextName,
        String purchaseOrderRef,
        List<PurchaseReceiptLineResponse> lines,
        List<OrderBalanceEntry> orderBalance) {
}
