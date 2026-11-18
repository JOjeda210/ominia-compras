package com.omnia.compras.purchaseorder;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;

// One requested line of contracts/backend-api.md POST /api/purchase-orders.
// unitPrice is required (FR-017): without it ERPNext silently accepts the line at rate=0,
// leaving the whole order valued at zero instead of rejecting it.
public record PurchaseOrderLineRequest(
        @NotBlank String itemRef,
        @Positive double quantity,
        @Positive double unitPrice) {
}
