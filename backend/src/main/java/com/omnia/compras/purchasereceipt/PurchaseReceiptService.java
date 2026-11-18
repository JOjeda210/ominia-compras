package com.omnia.compras.purchasereceipt;

import com.fasterxml.jackson.databind.JsonNode;
import com.omnia.compras.erpnext.ErpNextClient;
import com.omnia.compras.erpnext.ErpNextProperties;
import com.omnia.compras.idempotency.IdempotencyResolver;
import com.omnia.compras.purchaseorder.PurchaseOrderService;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

// Implements FR-012 to FR-015: create a Purchase Receipt linked to its Purchase Order (and row), or recover the one already
// created for a given idempotencyKey, using the generic resource endpoint per research.md (not make_purchase_receipt).
@Service
public class PurchaseReceiptService {

    private static final String DOCTYPE = "Purchase Receipt";

    private final ErpNextClient client;
    private final IdempotencyResolver idempotencyResolver;
    private final ErpNextProperties properties;
    private final PurchaseOrderService purchaseOrderService;

    public PurchaseReceiptService(ErpNextClient client, IdempotencyResolver idempotencyResolver,
                                   ErpNextProperties properties, PurchaseOrderService purchaseOrderService) {
        this.client = client;
        this.idempotencyResolver = idempotencyResolver;
        this.properties = properties;
        this.purchaseOrderService = purchaseOrderService;
    }

    // Delegates the create-or-recover decision to IdempotencyResolver so a lost-response retry never duplicates a receipt
    // (and therefore never duplicates the stock ledger entries it produces on submit, Principle II / FR-015).
    public CreationResult createOrRecover(CreatePurchaseReceiptRequest request) {
        IdempotencyResolver.Resolution resolution = idempotencyResolver.resolve(
                DOCTYPE,
                request.idempotencyKey(),
                () -> createAndSubmit(request));
        // The order balance is read fresh every time (recovered or not): it is a read-only lookup, so it is safe to repeat
        // and it must reflect whatever the order's received_qty is right now, not a value captured at creation time.
        JsonNode refreshedOrder = purchaseOrderService.getRawDocument(request.purchaseOrderRef());
        PurchaseReceiptResponse response = toResponse(resolution.document(), request.purchaseOrderRef(), refreshedOrder);
        return new CreationResult(response, resolution.recovered());
    }

    // Creates the receipt as a draft and immediately submits it: ERPNext only recalculates a Purchase Order's received_qty
    // (and posts the stock ledger entries) on submit, not on save, and FR-014 requires the balance to reflect this receipt
    // right away (confirmed empirically against the real ERPNext instance; documented in research.md).
    private JsonNode createAndSubmit(CreatePurchaseReceiptRequest request) {
        JsonNode orderDoc = purchaseOrderService.getRawDocument(request.purchaseOrderRef());
        JsonNode created = client.createResource(DOCTYPE, buildPayload(request, orderDoc));
        String createdName = unwrap(created).get("name").asText();
        return client.updateResource(DOCTYPE, createdName, Map.of("docstatus", 1));
    }

    // Builds the ERPNext Purchase Receipt payload, resolving each requested line against the real Purchase Order Item row
    // and rejecting (FR-015) any quantity that would exceed that line's pending balance before ERPNext is ever called.
    private Map<String, Object> buildPayload(CreatePurchaseReceiptRequest request, JsonNode orderDoc) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("company", properties.defaultCompany());
        payload.put("supplier", orderDoc.get("supplier").asText());
        payload.put("custom_idempotency_key", request.idempotencyKey());
        String today = LocalDate.now().toString();
        payload.put("posting_date", today);

        List<Map<String, Object>> items = new ArrayList<>();
        for (PurchaseReceiptLineRequest line : request.lines()) {
            JsonNode orderItem = findOrderItem(orderDoc, request.purchaseOrderRef(), line);
            double orderedQty = orderItem.get("qty").asDouble();
            double receivedQty = orderItem.has("received_qty") ? orderItem.get("received_qty").asDouble() : 0;
            double pendingQty = orderedQty - receivedQty;
            if (line.quantity() > pendingQty) {
                throw new QuantityExceedsBalanceException(line.itemRef(), pendingQty, line.quantity());
            }
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("item_code", line.itemRef());
            item.put("qty", line.quantity());
            item.put("warehouse", line.warehouseRef());
            item.put("purchase_order", request.purchaseOrderRef());
            // purchase_order_item is what links this receipt line back to its exact order row so ERPNext updates that
            // row's received_qty instead of just the order in general (FR-013).
            item.put("purchase_order_item", orderItem.get("name").asText());
            // rate mirrors the order's rate (same silent-zero-rate trap as Purchase Order Item, see PurchaseOrderService).
            item.put("rate", orderItem.has("rate") ? orderItem.get("rate").asDouble() : 0);
            items.add(item);
        }
        payload.put("items", items);
        return payload;
    }

    // Matches a requested line to its real Purchase Order Item row: tries the client-sent sourceOrderLineRef as the actual
    // ERPNext row name first (forward-compatible if the frontend ever learns it), falling back to an item_code match, since
    // today the frontend has no way to know ERPNext's internal child-row name (see research.md).
    private JsonNode findOrderItem(JsonNode orderDoc, String purchaseOrderRef, PurchaseReceiptLineRequest line) {
        JsonNode items = orderDoc.get("items");
        if (items != null && items.isArray()) {
            // A row-name match is only trusted if item_code also agrees; otherwise a sourceOrderLineRef that coincidentally
            // matches some other row's name (it is an opaque client value today, see the class-level comment) could silently
            // resolve to the wrong order line instead of being rejected.
            for (JsonNode item : items) {
                boolean rowMatches = item.has("name") && item.get("name").asText().equals(line.sourceOrderLineRef());
                boolean itemCodeMatches = item.get("item_code").asText().equals(line.itemRef());
                if (rowMatches && itemCodeMatches) {
                    return item;
                }
            }
            for (JsonNode item : items) {
                if (item.get("item_code").asText().equals(line.itemRef())) {
                    return item;
                }
            }
        }
        throw new PurchaseOrderLineNotFoundException(purchaseOrderRef, line.itemRef());
    }

    // Maps the raw ERPNext Purchase Receipt (plus a freshly-read order) to the stable frontend contract shape.
    private PurchaseReceiptResponse toResponse(JsonNode receiptDoc, String purchaseOrderRef, JsonNode orderDoc) {
        List<PurchaseReceiptLineResponse> lines = new ArrayList<>();
        JsonNode items = receiptDoc.get("items");
        if (items != null && items.isArray()) {
            for (JsonNode item : items) {
                lines.add(new PurchaseReceiptLineResponse(
                        item.get("item_code").asText(),
                        item.get("qty").asDouble(),
                        item.has("warehouse") ? item.get("warehouse").asText() : null));
            }
        }
        return new PurchaseReceiptResponse(receiptDoc.get("name").asText(), purchaseOrderRef, lines, orderBalanceOf(orderDoc));
    }

    // FR-014: pending quantity per order line (qty - received_qty), for every line of the order, not just the ones just received.
    private List<OrderBalanceEntry> orderBalanceOf(JsonNode orderDoc) {
        List<OrderBalanceEntry> balance = new ArrayList<>();
        JsonNode items = orderDoc.get("items");
        if (items != null && items.isArray()) {
            for (JsonNode item : items) {
                double qty = item.get("qty").asDouble();
                double received = item.has("received_qty") ? item.get("received_qty").asDouble() : 0;
                balance.add(new OrderBalanceEntry(item.get("item_code").asText(), qty - received));
            }
        }
        return balance;
    }

    // ERPNext wraps single-document responses as {"data": {...}}; needed here before the final document is known (to read its name).
    private JsonNode unwrap(JsonNode wrapped) {
        JsonNode data = wrapped.get("data");
        return data != null ? data : wrapped;
    }

    // Lets the controller pick 201 (newly created) vs 200 (recovered via idempotencyKey) with an otherwise identical body (FR-008).
    public record CreationResult(PurchaseReceiptResponse response, boolean recovered) {
    }
}
