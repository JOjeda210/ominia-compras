package com.omnia.compras.purchasereceipt;

// Thrown when a requested receipt line's itemRef has no matching item row on the referenced Purchase Order; a client-side
// data error (wrong purchaseOrderRef/itemRef pairing), not an ERPNext failure, so it is mapped to 400 INVALID_REQUEST.
public class PurchaseOrderLineNotFoundException extends RuntimeException {

    public PurchaseOrderLineNotFoundException(String purchaseOrderRef, String itemRef) {
        super("Purchase Order %s has no item row for %s".formatted(purchaseOrderRef, itemRef));
    }
}
