package com.omnia.compras.purchaseorder;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;

import java.util.List;

// Matches contracts/backend-api.md POST /api/purchase-orders request body exactly; idempotencyKey is generated client-side (FR-007).
public record CreatePurchaseOrderRequest(
        @NotBlank String idempotencyKey,
        @NotBlank String supplierRef,
        @NotEmpty @Valid List<PurchaseOrderLineRequest> lines) {
}
