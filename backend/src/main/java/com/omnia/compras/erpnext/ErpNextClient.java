package com.omnia.compras.erpnext;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

// Single point of contact with the ERPNext REST API; keeps the "Authorization: token key:secret" header out of every other class.
@Component
public class ErpNextClient {

    private final RestClient restClient;

    // Builds one RestClient bound to the ERPNext base URL with the token auth header baked in; credentials come only from ErpNextProperties (.env).
    public ErpNextClient(ErpNextProperties properties) {
        RestClient.Builder builder = RestClient.builder()
                .baseUrl(properties.baseUrl())
                // Apache HttpClient5 (not the JDK's java.net.http default) is required so defaultHeader() below can actually set "Host";
                // the JDK HTTP client rejects that header unconditionally regardless of any application code (see pom.xml comment).
                .requestFactory(new HttpComponentsClientHttpRequestFactory())
                .defaultHeader("Authorization", "token %s:%s".formatted(properties.apiKey(), properties.apiSecret()));
        if (properties.siteHost() != null && !properties.siteHost().isBlank()) {
            // Routes every request to the right Frappe site when infra serves several sites behind one reverse-proxy port (ERPNEXT_SITE_HOST).
            builder.defaultHeader("Host", properties.siteHost());
        }
        this.restClient = builder.build();
    }

    // Fetches a single document by its ERPNext name (folio); used to hydrate the full document after an idempotent create/recover.
    public JsonNode getResource(String doctype, String name) {
        return execute(() -> restClient.get()
                .uri("/api/resource/{doctype}/{name}", doctype, name)
                .retrieve()
                .body(JsonNode.class));
    }

    // Lists documents matching a single-field equality filter; used by the idempotency resolver to look up an existing document by its stable key.
    public JsonNode listResource(String doctype, String filterField, String filterValue) {
        String filters = "[[\"%s\",\"=\",\"%s\"]]".formatted(filterField, filterValue);
        return execute(() -> restClient.get()
                .uri(uriBuilder -> uriBuilder
                        .path("/api/resource/{doctype}")
                        .queryParam("filters", filters)
                        .build(doctype))
                .retrieve()
                .body(JsonNode.class));
    }

    // Lists documents with an explicit field projection and no page limit; used for catalog reads (Supplier/Item) that must return every row.
    public JsonNode listResourceWithFields(String doctype, List<String> fields) {
        return listResourceWithFields(doctype, fields, null);
    }

    // Same as above, plus an optional equality filter (e.g. is_group=0) so catalog endpoints can exclude tree
    // group/placeholder nodes (Warehouse, Item Group, ...) that ERPNext itself rejects as transaction targets.
    public JsonNode listResourceWithFields(String doctype, List<String> fields, Map<String, Object> equalityFilters) {
        String fieldsJson = "[" + fields.stream().map(f -> "\"" + f + "\"").reduce((a, b) -> a + "," + b).orElse("") + "]";
        String filtersJson = equalityFilters == null ? null : equalityFilters.entrySet().stream()
                .map(e -> "[\"%s\",\"=\",%s]".formatted(e.getKey(), e.getValue()))
                .reduce((a, b) -> a + "," + b)
                .map(body -> "[" + body + "]")
                .orElse(null);
        return execute(() -> restClient.get()
                .uri(uriBuilder -> {
                    uriBuilder.path("/api/resource/{doctype}")
                            .queryParam("fields", fieldsJson)
                            .queryParam("limit_page_length", "0");
                    if (filtersJson != null) {
                        uriBuilder.queryParam("filters", filtersJson);
                    }
                    return uriBuilder.build(doctype);
                })
                .retrieve()
                .body(JsonNode.class));
    }

    // Creates a new document of the given doctype; callers must check idempotency (IdempotencyResolver) before calling this to avoid duplicates.
    public JsonNode createResource(String doctype, Object payload) {
        return execute(() -> restClient.post()
                .uri("/api/resource/{doctype}", doctype)
                .body(payload)
                .retrieve()
                .body(JsonNode.class));
    }

    // Updates fields on an existing document via the generic resource PUT endpoint; also the mechanism used to drive docstatus
    // transitions (submit=1, cancel=2), confirmed empirically against the real ERPNext instance (see research.md).
    public JsonNode updateResource(String doctype, String name, Object payload) {
        return execute(() -> restClient.put()
                .uri("/api/resource/{doctype}/{name}", doctype, name)
                .body(payload)
                .retrieve()
                .body(JsonNode.class));
    }

    // Normalizes both HTTP error responses and connectivity failures into one exception type so every caller has a single error path.
    private JsonNode execute(Supplier<JsonNode> call) {
        try {
            return call.get();
        } catch (RestClientResponseException ex) {
            throw new ErpNextApiException(ex.getStatusCode().value(), ex.getResponseBodyAsString(), ex);
        } catch (ResourceAccessException ex) {
            throw new ErpNextApiException(null, ex.getMessage(), ex);
        }
    }
}
