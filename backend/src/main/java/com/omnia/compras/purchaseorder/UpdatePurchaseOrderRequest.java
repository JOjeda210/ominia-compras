package com.omnia.compras.purchaseorder;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;

import java.util.List;

// Matches contracts/backend-api.md PUT /api/purchase-orders/{erpnextName} request body; supplierRef is optional
// (the documented contract example only shows lines, but the same draft can also need a supplier correction before submission).
public record UpdatePurchaseOrderRequest(
        @NotBlank String idempotencyKey,
        String supplierRef,
        @NotEmpty @Valid List<PurchaseOrderLineRequest> lines) {
}
