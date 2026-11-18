package com.omnia.compras.erpnext;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

// Covers Principle V (errors comprensibles): every ERPNext failure shape must map to a stable errorCode and a Spanish, user-safe message.
class ErpNextErrorTranslatorTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final ErpNextErrorTranslator translator = new ErpNextErrorTranslator(objectMapper);

    @Test
    void translatesConnectivityFailureAsUnreachable() {
        // No HTTP status at all means ERPNext never responded (e.g. network down), which the frontend must treat as retryable, not fatal.
        ErpNextApiException ex = new ErpNextApiException(null, "Connection refused", new RuntimeException("Connection refused"));

        ErrorResponse result = translator.translate(ex);

        assertThat(result.errorCode()).isEqualTo("ERPNEXT_UNREACHABLE");
        assertThat(result.message()).doesNotContain("Connection refused");
        assertThat(result.erpnextDetail()).contains("Connection refused");
    }

    @Test
    void translatesLinkExistsErrorWithServerMessageIntoConflict() throws Exception {
        // Build the Frappe error body programmatically to avoid hand-escaping the nested JSON-string-inside-JSON-string shape Frappe actually sends.
        ObjectNode serverMessage = objectMapper.createObjectNode();
        serverMessage.put("message", "Purchase Receipt PR-0003 is linked");
        serverMessage.put("title", "Message");
        ArrayNode serverMessagesArray = objectMapper.createArrayNode();
        serverMessagesArray.add(objectMapper.writeValueAsString(serverMessage));

        ObjectNode body = objectMapper.createObjectNode();
        body.put("exc_type", "LinkExistsError");
        body.put("_server_messages", objectMapper.writeValueAsString(serverMessagesArray));
        String rawBody = objectMapper.writeValueAsString(body);

        ErpNextApiException ex = new ErpNextApiException(409, rawBody, new RuntimeException());

        ErrorResponse result = translator.translate(ex);

        assertThat(result.errorCode()).isEqualTo("ERPNEXT_CONFLICT");
        assertThat(result.message()).contains("vinculado");
        assertThat(result.message()).doesNotContain("PR-0003");
        assertThat(result.erpnextDetail()).contains("PR-0003");
    }

    @Test
    void translatesUnknownValidationErrorWithGenericSpanishMessage() {
        String body = "{\"exc_type\": \"SomeObscureFrappeError\", "
                + "\"exception\": \"frappe.exceptions.SomeObscureFrappeError: something broke internally\"}";
        ErpNextApiException ex = new ErpNextApiException(417, body, new RuntimeException());

        ErrorResponse result = translator.translate(ex);

        assertThat(result.errorCode()).isEqualTo("ERPNEXT_VALIDATION_ERROR");
        assertThat(result.message()).isEqualTo("ERPNext rechazó la operación. Revisa los datos capturados.");
        assertThat(result.erpnextDetail()).isEqualTo(body);
    }

    @Test
    void translatesAuthFailureAsAuthError() {
        ErpNextApiException ex = new ErpNextApiException(403, "{\"message\": \"Forbidden\"}", new RuntimeException());

        ErrorResponse result = translator.translate(ex);

        assertThat(result.errorCode()).isEqualTo("ERPNEXT_AUTH_ERROR");
        assertThat(result.message()).contains("permisos");
    }

    @Test
    void translatesNotFoundStatus() {
        ErpNextApiException ex = new ErpNextApiException(404, "{\"message\": \"Not found\"}", new RuntimeException());

        ErrorResponse result = translator.translate(ex);

        assertThat(result.errorCode()).isEqualTo("ERPNEXT_NOT_FOUND");
    }
}
