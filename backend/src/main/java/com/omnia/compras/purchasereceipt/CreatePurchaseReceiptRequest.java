package com.omnia.compras.purchasereceipt;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;

import java.util.List;

// Matches contracts/backend-api.md POST /api/purchase-receipts request body exactly.
public record CreatePurchaseReceiptRequest(
        @NotBlank String idempotencyKey,
        @NotBlank String purchaseOrderRef,
        @NotEmpty @Valid List<PurchaseReceiptLineRequest> lines) {
}
