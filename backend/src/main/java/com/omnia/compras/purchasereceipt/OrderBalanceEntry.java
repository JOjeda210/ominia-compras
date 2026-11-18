package com.omnia.compras.purchasereceipt;

// One entry of contracts/backend-api.md "orderBalance" (FR-014): pending quantity left to receive for one order item.
public record OrderBalanceEntry(String itemRef, double pendingQuantity) {
}
