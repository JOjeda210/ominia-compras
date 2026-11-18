package com.omnia.compras.erpnext;

import com.omnia.compras.purchasereceipt.PurchaseOrderLineNotFoundException;
import com.omnia.compras.purchasereceipt.QuantityExceedsBalanceException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.stream.Collectors;

// Centralizes exception-to-HTTP mapping so every controller returns the same {errorCode, message, erpnextDetail} shape (contracts/backend-api.md).
@RestControllerAdvice
public class GlobalExceptionHandler {

    private final ErpNextErrorTranslator translator;

    public GlobalExceptionHandler(ErpNextErrorTranslator translator) {
        this.translator = translator;
    }

    @ExceptionHandler(ErpNextApiException.class)
    public ResponseEntity<ErrorResponse> handleErpNextError(ErpNextApiException ex) {
        ErrorResponse error = translator.translate(ex);
        return ResponseEntity.status(statusFor(error.errorCode())).body(error);
    }

    // FR-015 edge case: caught before ERPNext is ever called, so the frontend gets the exact contract error code regardless of
    // how ERPNext itself would have worded an over-receipt rejection.
    @ExceptionHandler(QuantityExceedsBalanceException.class)
    public ResponseEntity<ErrorResponse> handleQuantityExceedsBalance(QuantityExceedsBalanceException ex) {
        String message = "No se puede recibir %s unidades de %s: el saldo pendiente de la orden es %s."
                .formatted(ex.requestedQuantity(), ex.itemRef(), ex.pendingQuantity());
        return ResponseEntity.status(HttpStatus.CONFLICT).body(new ErrorResponse("QUANTITY_EXCEEDS_BALANCE", message, ex.getMessage()));
    }

    // Client sent a purchaseOrderRef/itemRef pairing that does not exist on that order; a request data error, not an ERPNext failure.
    @ExceptionHandler(PurchaseOrderLineNotFoundException.class)
    public ResponseEntity<ErrorResponse> handlePurchaseOrderLineNotFound(PurchaseOrderLineNotFoundException ex) {
        return ResponseEntity.badRequest().body(new ErrorResponse(
                "INVALID_REQUEST",
                "El artículo indicado no corresponde a un renglón de la orden de compra referenciada.",
                ex.getMessage()));
    }

    // Bean validation failures (e.g. missing supplierRef) never reach ERPNext at all, so they get their own stable code separate from ERPNEXT_*.
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidationError(MethodArgumentNotValidException ex) {
        String fields = ex.getBindingResult().getFieldErrors().stream()
                .map(fe -> fe.getField() + ": " + fe.getDefaultMessage())
                .collect(Collectors.joining("; "));
        return ResponseEntity.badRequest().body(new ErrorResponse(
                "INVALID_REQUEST",
                "La solicitud no tiene los datos requeridos.",
                fields));
    }

    // Maps the translator's stable errorCode to the HTTP status the frontend contract expects; unreachable/auth are upstream failures (502).
    private HttpStatus statusFor(String errorCode) {
        return switch (errorCode) {
            case "ERPNEXT_UNREACHABLE", "ERPNEXT_AUTH_ERROR" -> HttpStatus.BAD_GATEWAY;
            case "ERPNEXT_NOT_FOUND" -> HttpStatus.NOT_FOUND;
            case "ERPNEXT_CONFLICT" -> HttpStatus.CONFLICT;
            default -> HttpStatus.BAD_REQUEST;
        };
    }
}
