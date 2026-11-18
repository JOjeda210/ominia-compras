package com.omnia.compras.purchasereceipt;

// Thrown when a requested receipt quantity exceeds the pending balance of its source Purchase Order line (edge case in spec.md,
// FR-015); caught by GlobalExceptionHandler and mapped to 409 with errorCode "QUANTITY_EXCEEDS_BALANCE" before ERPNext is ever called.
public class QuantityExceedsBalanceException extends RuntimeException {

    private final String itemRef;
    private final double pendingQuantity;
    private final double requestedQuantity;

    public QuantityExceedsBalanceException(String itemRef, double pendingQuantity, double requestedQuantity) {
        super("Requested quantity %s for item %s exceeds pending balance %s".formatted(requestedQuantity, itemRef, pendingQuantity));
        this.itemRef = itemRef;
        this.pendingQuantity = pendingQuantity;
        this.requestedQuantity = requestedQuantity;
    }

    public String itemRef() {
        return itemRef;
    }

    public double pendingQuantity() {
        return pendingQuantity;
    }

    public double requestedQuantity() {
        return requestedQuantity;
    }
}
