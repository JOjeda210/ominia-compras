package com.omnia.compras.idempotency;

import com.fasterxml.jackson.databind.JsonNode;
import com.omnia.compras.erpnext.ErpNextClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.Optional;
import java.util.function.Supplier;

// Enforces Principle II (idempotency): before creating any ERPNext document, check whether one already exists for this client-generated key.
// The key is stored in the "custom_idempotency_key" Custom Field on the target DocType (research.md), which lives in ERPNext's own database
// and survives backend restarts/redeploys, avoiding a second source of truth that could drift from ERPNext (Principle III).
@Component
public class IdempotencyResolver {

    private static final String IDEMPOTENCY_FIELD = "custom_idempotency_key";
    private static final Logger log = LoggerFactory.getLogger(IdempotencyResolver.class);

    private final ErpNextClient client;

    public IdempotencyResolver(ErpNextClient client) {
        this.client = client;
    }

    // Looks up the ERPNext name (folio) of a document already created with this idempotency key, if any.
    public Optional<String> findExistingName(String doctype, String idempotencyKey) {
        JsonNode result = client.listResource(doctype, IDEMPOTENCY_FIELD, idempotencyKey);
        JsonNode data = result.get("data");
        if (data == null || !data.isArray() || data.isEmpty()) {
            return Optional.empty();
        }
        JsonNode name = data.get(0).get("name");
        return name == null ? Optional.empty() : Optional.of(name.asText());
    }

    // Resolves a document by idempotency key: returns the existing one untouched (recovered), or runs createFn exactly once when none exists yet.
    public Resolution resolve(String doctype, String idempotencyKey, Supplier<JsonNode> createFn) {
        Optional<String> existingName = findExistingName(doctype, idempotencyKey);
        if (existingName.isPresent()) {
            // Logs every recovery so a retried request is traceable in the backend's own logs, not just in
            // the HTTP response the client happened to see (Principle VI: trazabilidad).
            log.info("Recovered existing {} '{}' for idempotencyKey={}, skipping createResource",
                    doctype, existingName.get(), idempotencyKey);
            return new Resolution(unwrapData(client.getResource(doctype, existingName.get())), true);
        }
        return new Resolution(unwrapData(createFn.get()), false);
    }

    // ERPNext wraps single-document responses as {"data": {...}}; callers only care about the document itself.
    private JsonNode unwrapData(JsonNode wrapped) {
        JsonNode data = wrapped.get("data");
        return data != null ? data : wrapped;
    }

    // Carries the resolved document along with whether it was recovered (true, HTTP 200) or newly created (false, HTTP 201).
    public record Resolution(JsonNode document, boolean recovered) {
    }
}
