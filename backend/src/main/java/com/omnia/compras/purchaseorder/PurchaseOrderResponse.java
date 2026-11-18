package com.omnia.compras.purchaseorder;

import java.util.List;

// Matches contracts/backend-api.md response body exactly; identical shape whether the order was just created (201) or recovered (200).
public record PurchaseOrderResponse(
        String erpnextName,
        String status,
        String supplierRef,
        List<PurchaseOrderLineResponse> lines) {
}
