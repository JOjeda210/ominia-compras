package com.omnia.compras.erpnext;

// Standard error body shared by every endpoint (contracts/backend-api.md): message is always Spanish and safe to show; erpnextDetail is for logs only.
public record ErrorResponse(String errorCode, String message, String erpnextDetail) {
}
