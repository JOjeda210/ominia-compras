package com.omnia.compras.erpnext;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Optional;

// Translates raw ERPNext/Frappe failures into the stable {errorCode, message, erpnextDetail} contract (Principle V: errors comprensibles).
@Component
public class ErpNextErrorTranslator {

    private static final Logger log = LoggerFactory.getLogger(ErpNextErrorTranslator.class);

    // Known Frappe exception types get a precise Spanish message; anything else falls back to a generic message per HTTP status.
    private static final Map<String, String> KNOWN_EXCEPTION_MESSAGES = Map.of(
            "LinkExistsError", "No se puede completar la operación: existe un documento vinculado (por ejemplo, un recibo de compra) que lo impide.",
            "DuplicateEntryError", "Ya existe un documento con esos datos; no se creó uno nuevo.",
            "MandatoryError", "Faltan datos obligatorios para completar la operación en ERPNext.",
            "ValidationError", "ERPNext rechazó la operación porque algunos datos capturados no son válidos.");

    private final ObjectMapper objectMapper;

    public ErpNextErrorTranslator(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    // Main entry point: never lets a raw ERPNext payload reach the frontend, but keeps the original detail for backend logs/debugging.
    public ErrorResponse translate(ErpNextApiException ex) {
        if (ex.httpStatus() == null) {
            log.warn("ERPNext unreachable: {}", ex.getMessage());
            return new ErrorResponse(
                    "ERPNEXT_UNREACHABLE",
                    "No se pudo contactar a ERPNext. La operación se reintentará automáticamente cuando haya conexión.",
                    ex.getMessage());
        }

        int status = ex.httpStatus();
        String rawBody = ex.responseBody();
        Optional<String> excType = extractExcType(rawBody);
        String erpnextDetail = extractServerMessage(rawBody).orElse(rawBody);

        String errorCode = errorCodeFor(status);
        String message = excType.flatMap(this::knownMessageFor).orElseGet(() -> genericMessageFor(status));
        // The root cause only ever reaches the frontend as erpnextDetail, which the UI deliberately never
        // renders (Principle V); logging it here is the only place a diagnosing admin can actually see it.
        log.warn("ERPNext rejected a request: status={} errorCode={} excType={} detail={}",
                status, errorCode, excType.orElse("unknown"), erpnextDetail);
        return new ErrorResponse(errorCode, message, erpnextDetail);
    }

    private Optional<String> knownMessageFor(String excType) {
        return Optional.ofNullable(KNOWN_EXCEPTION_MESSAGES.get(excType));
    }

    // Maps the HTTP status ERPNext used onto our stable internal error codes; the frontend only ever sees these codes, not raw status semantics.
    private String errorCodeFor(int status) {
        return switch (status) {
            case 401, 403 -> "ERPNEXT_AUTH_ERROR";
            case 404 -> "ERPNEXT_NOT_FOUND";
            case 409 -> "ERPNEXT_CONFLICT";
            default -> "ERPNEXT_VALIDATION_ERROR";
        };
    }

    private String genericMessageFor(int status) {
        return switch (status) {
            case 401, 403 -> "El backend no tiene permisos válidos para operar en ERPNext. Contacta al administrador.";
            case 404 -> "El documento solicitado no existe en ERPNext.";
            case 409 -> "ERPNext rechazó la operación por un conflicto con el estado actual del documento.";
            default -> "ERPNext rechazó la operación. Revisa los datos capturados.";
        };
    }

    // Frappe error bodies usually include "exc_type" directly; older responses only include it inside the "exception" stack trace string.
    private Optional<String> extractExcType(String rawBody) {
        if (rawBody == null || rawBody.isBlank()) {
            return Optional.empty();
        }
        try {
            JsonNode root = objectMapper.readTree(rawBody);
            JsonNode excType = root.get("exc_type");
            if (excType != null && excType.isTextual()) {
                return Optional.of(excType.asText());
            }
            JsonNode exception = root.get("exception");
            if (exception != null && exception.isTextual()) {
                String text = exception.asText();
                int colon = text.indexOf(':');
                String qualified = colon >= 0 ? text.substring(0, colon) : text;
                int lastDot = qualified.lastIndexOf('.');
                return Optional.of(lastDot >= 0 ? qualified.substring(lastDot + 1) : qualified);
            }
        } catch (Exception parseFailure) {
            return Optional.empty();
        }
        return Optional.empty();
    }

    // ERPNext/Frappe encodes human-readable messages as a JSON-stringified array in "_server_messages"; this pulls the first one out, if present.
    private Optional<String> extractServerMessage(String rawBody) {
        if (rawBody == null || rawBody.isBlank()) {
            return Optional.empty();
        }
        try {
            JsonNode root = objectMapper.readTree(rawBody);
            JsonNode serverMessages = root.get("_server_messages");
            if (serverMessages != null && serverMessages.isTextual()) {
                JsonNode messagesArray = objectMapper.readTree(serverMessages.asText());
                if (messagesArray.isArray() && !messagesArray.isEmpty()) {
                    JsonNode first = objectMapper.readTree(messagesArray.get(0).asText());
                    JsonNode message = first.get("message");
                    if (message != null) {
                        return Optional.of(message.asText());
                    }
                }
            }
            JsonNode message = root.get("message");
            if (message != null && message.isTextual()) {
                return Optional.of(message.asText());
            }
        } catch (Exception parseFailure) {
            return Optional.empty();
        }
        return Optional.empty();
    }
}
