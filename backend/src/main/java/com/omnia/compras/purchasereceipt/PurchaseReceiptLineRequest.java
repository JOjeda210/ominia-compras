package com.omnia.compras.purchasereceipt;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;

// One requested line of contracts/backend-api.md POST /api/purchase-receipts; sourceOrderLineRef is accepted as the client's
// reference to the originating order line (FR-013) but the actual ERPNext Purchase Order Item row is resolved server-side by
// matching itemRef against the referenced Purchase Order, since the frontend never receives ERPNext's internal child-row name
// (see research.md's Purchase Receipt source-line resolution section).
public record PurchaseReceiptLineRequest(
        @NotBlank String sourceOrderLineRef,
        @NotBlank String itemRef,
        @Positive double quantity,
        @NotBlank String warehouseRef) {
}
