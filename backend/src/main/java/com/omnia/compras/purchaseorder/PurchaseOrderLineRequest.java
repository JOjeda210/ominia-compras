package com.omnia.compras.purchaseorder;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;

// One requested line of contracts/backend-api.md POST /api/purchase-orders.
public record PurchaseOrderLineRequest(
        @NotBlank String itemRef,
        @Positive double quantity) {
}
