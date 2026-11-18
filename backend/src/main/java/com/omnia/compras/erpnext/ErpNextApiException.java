package com.omnia.compras.erpnext;

// Carries the raw ERPNext failure (HTTP status, if any, and response body) so ErpNextErrorTranslator can map it without re-inspecting HTTP internals.
public class ErpNextApiException extends RuntimeException {

    // Null means ERPNext never responded at all (connectivity failure), not a documented 4xx/5xx from the API.
    private final Integer httpStatus;
    private final String responseBody;

    public ErpNextApiException(Integer httpStatus, String responseBody, Throwable cause) {
        super("ERPNext request failed: status=%s body=%s".formatted(httpStatus, responseBody), cause);
        this.httpStatus = httpStatus;
        this.responseBody = responseBody;
    }

    public Integer httpStatus() {
        return httpStatus;
    }

    public String responseBody() {
        return responseBody;
    }
}
