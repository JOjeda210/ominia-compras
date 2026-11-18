package com.omnia.compras.purchaseorder;

import com.fasterxml.jackson.databind.JsonNode;
import com.omnia.compras.erpnext.ErpNextClient;
import com.omnia.compras.erpnext.ErpNextProperties;
import com.omnia.compras.idempotency.IdempotencyResolver;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

// Implements FR-005 to FR-008: create a draft Purchase Order in ERPNext, or recover the one already created for a given idempotencyKey.
@Service
public class PurchaseOrderService {

    private static final String DOCTYPE = "Purchase Order";

    private final ErpNextClient client;
    private final IdempotencyResolver idempotencyResolver;
    private final ErpNextProperties properties;

    public PurchaseOrderService(ErpNextClient client, IdempotencyResolver idempotencyResolver, ErpNextProperties properties) {
        this.client = client;
        this.idempotencyResolver = idempotencyResolver;
        this.properties = properties;
    }

    // Delegates the create-or-recover decision to IdempotencyResolver so a lost-response retry never produces a second ERPNext document.
    public CreationResult createOrRecover(CreatePurchaseOrderRequest request) {
        IdempotencyResolver.Resolution resolution = idempotencyResolver.resolve(
                DOCTYPE,
                request.idempotencyKey(),
                () -> client.createResource(DOCTYPE, buildPayload(request)));
        return new CreationResult(toResponse(resolution.document()), resolution.recovered());
    }

    // Builds the ERPNext Purchase Order payload; schedule_date defaults to today because ERPNext requires it per item and the app does not capture it
    // (a pragmatic default not covered by research.md; confirmed necessary against the real ERPNext instance in Fase 3).
    // company is mandatory on Purchase Order; the demo lab only ever has one company (spec.md Assumptions), so it comes from
    // ERPNEXT_DEFAULT_COMPANY instead of being part of the frontend contract (confirmed necessary against real ERPNext: it rejects
    // the document with "Please specify Company" otherwise).
    private Map<String, Object> buildPayload(CreatePurchaseOrderRequest request) {
        // transaction_date is sent explicitly (not left to ERPNext's server-side default) because the backend JVM and the
        // ERPNext container can run in different timezones; if left implicit, ERPNext's own "today" can land a calendar day
        // ahead of this value and reject schedule_date as earlier than transaction_date. Using the same LocalDate for both
        // guarantees schedule_date >= transaction_date regardless of either side's clock/timezone.
        String today = LocalDate.now().toString();
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("supplier", request.supplierRef());
        payload.put("company", properties.defaultCompany());
        payload.put("custom_idempotency_key", request.idempotencyKey());
        payload.put("transaction_date", today);
        payload.put("schedule_date", today);

        List<Map<String, Object>> items = new ArrayList<>();
        for (PurchaseOrderLineRequest line : request.lines()) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("item_code", line.itemRef());
            item.put("qty", line.quantity());
            item.put("schedule_date", today);
            items.add(item);
        }
        payload.put("items", items);
        return payload;
    }

    // Maps the raw ERPNext document to the stable frontend contract shape (contracts/backend-api.md).
    private PurchaseOrderResponse toResponse(JsonNode doc) {
        List<PurchaseOrderLineResponse> lines = new ArrayList<>();
        JsonNode items = doc.get("items");
        if (items != null && items.isArray()) {
            for (JsonNode item : items) {
                lines.add(new PurchaseOrderLineResponse(
                        item.get("item_code").asText(),
                        item.get("qty").asDouble(),
                        item.has("received_qty") ? item.get("received_qty").asDouble() : 0));
            }
        }
        return new PurchaseOrderResponse(
                doc.get("name").asText(),
                statusOf(doc),
                doc.get("supplier").asText(),
                lines);
    }

    // ERPNext reports lifecycle via numeric docstatus (0=draft, 1=submitted, 2=cancelled); this is the single place that maps it to our vocabulary.
    private String statusOf(JsonNode doc) {
        int docstatus = doc.has("docstatus") ? doc.get("docstatus").asInt() : 0;
        return switch (docstatus) {
            case 1 -> "submitted";
            case 2 -> "cancelled";
            default -> "draft";
        };
    }

    // Lets the controller pick 201 (newly created) vs 200 (recovered via idempotencyKey) with an otherwise identical body (FR-008).
    public record CreationResult(PurchaseOrderResponse response, boolean recovered) {
    }
}
