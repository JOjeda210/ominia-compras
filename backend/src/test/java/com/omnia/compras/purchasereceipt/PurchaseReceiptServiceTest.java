package com.omnia.compras.purchasereceipt;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.omnia.compras.erpnext.ErpNextClient;
import com.omnia.compras.erpnext.ErpNextProperties;
import com.omnia.compras.idempotency.IdempotencyResolver;
import com.omnia.compras.purchaseorder.PurchaseOrderService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

// End-to-end (mocked ERPNext) test of FR-012 to FR-015: create-and-submit a Purchase Receipt, recover it on a lost-response
// retry (Principle II), and reject an over-receipt before ever calling ERPNext (edge case in spec.md).
@ExtendWith(MockitoExtension.class)
class PurchaseReceiptServiceTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final ErpNextProperties properties = new ErpNextProperties(
            "http://localhost:8000", null, "test-key", "test-secret", "Omnia Compras Demo");

    @Mock
    private ErpNextClient client;
    @Mock
    private PurchaseOrderService purchaseOrderService;

    @Test
    void firstRequestCreatesAndSubmitsThenRetryWithSameKeyRecoversSameReceipt() throws Exception {
        String key = "9a2e7d10-aaaa-bbbb-cccc-000000000001";
        CreatePurchaseReceiptRequest request = new CreatePurchaseReceiptRequest(
                key, "PUR-ORD-2026-00001",
                List.of(new PurchaseReceiptLineRequest("row-1", "ITEM-0001", 4, "WH-0001")));

        // The order line starts with 0 received (pending 10) before the receipt, and 4 received (pending 6) right after
        // submit; getRawDocument is called twice (once to build the payload, once to compute the post-receipt balance).
        JsonNode orderBeforeReceipt = orderDoc(0);
        JsonNode orderAfterReceipt = orderDoc(4);
        when(purchaseOrderService.getRawDocument("PUR-ORD-2026-00001")).thenReturn(orderBeforeReceipt, orderAfterReceipt);

        when(client.listResource("Purchase Receipt", "custom_idempotency_key", key))
                .thenReturn(objectMapper.readTree("{\"data\": []}"));
        when(client.createResource(eq("Purchase Receipt"), any()))
                .thenReturn(objectMapper.readTree("{\"data\": {\"name\": \"PUR-REC-2026-00001\"}}"));
        when(client.updateResource(eq("Purchase Receipt"), eq("PUR-REC-2026-00001"), eq(Map.of("docstatus", 1))))
                .thenReturn(objectMapper.readTree(
                        "{\"data\": {\"name\": \"PUR-REC-2026-00001\", \"docstatus\": 1, "
                                + "\"items\": [{\"item_code\": \"ITEM-0001\", \"qty\": 4, \"warehouse\": \"WH-0001\"}]}}"));

        PurchaseReceiptService service = new PurchaseReceiptService(client, new IdempotencyResolver(client), properties, purchaseOrderService);
        PurchaseReceiptService.CreationResult first = service.createOrRecover(request);

        assertThat(first.recovered()).isFalse();
        assertThat(first.response().erpnextName()).isEqualTo("PUR-REC-2026-00001");
        assertThat(first.response().purchaseOrderRef()).isEqualTo("PUR-ORD-2026-00001");
        assertThat(first.response().lines()).containsExactly(new PurchaseReceiptLineResponse("ITEM-0001", 4, "WH-0001"));
        assertThat(first.response().orderBalance()).containsExactly(new OrderBalanceEntry("ITEM-0001", 6));
        verify(client, times(1)).createResource(eq("Purchase Receipt"), any());

        // Simulate the retry after a lost response: the same idempotencyKey now resolves to the receipt ERPNext already saved and submitted.
        reset(client);
        when(client.listResource("Purchase Receipt", "custom_idempotency_key", key))
                .thenReturn(objectMapper.readTree("{\"data\": [{\"name\": \"PUR-REC-2026-00001\"}]}"));
        when(client.getResource("Purchase Receipt", "PUR-REC-2026-00001"))
                .thenReturn(objectMapper.readTree(
                        "{\"data\": {\"name\": \"PUR-REC-2026-00001\", \"docstatus\": 1, "
                                + "\"items\": [{\"item_code\": \"ITEM-0001\", \"qty\": 4, \"warehouse\": \"WH-0001\"}]}}"));

        PurchaseReceiptService.CreationResult retry = service.createOrRecover(request);

        assertThat(retry.recovered()).isTrue();
        assertThat(retry.response().erpnextName()).isEqualTo(first.response().erpnextName());
        // The core idempotency guarantee (Principle II): the retry must never call createResource again, so the stock
        // ledger entries the first submit already produced are never duplicated.
        verify(client, never()).createResource(any(), any());
    }

    // FR-015 edge case: a quantity above the pending balance must be rejected before ERPNext is ever contacted.
    @Test
    void rejectsQuantityAboveThePendingBalanceWithoutCallingErpNext() throws Exception {
        String key = "9a2e7d10-0000-0000-0000-000000000002";
        CreatePurchaseReceiptRequest request = new CreatePurchaseReceiptRequest(
                key, "PUR-ORD-2026-00002",
                List.of(new PurchaseReceiptLineRequest("row-1", "ITEM-0001", 15, "WH-0001")));

        when(purchaseOrderService.getRawDocument("PUR-ORD-2026-00002")).thenReturn(orderDoc(2));
        when(client.listResource("Purchase Receipt", "custom_idempotency_key", key))
                .thenReturn(objectMapper.readTree("{\"data\": []}"));

        PurchaseReceiptService service = new PurchaseReceiptService(client, new IdempotencyResolver(client), properties, purchaseOrderService);

        assertThatThrownBy(() -> service.createOrRecover(request))
                .isInstanceOf(QuantityExceedsBalanceException.class);
        verify(client, never()).createResource(any(), any());
    }

    // A client-data error (wrong itemRef/purchaseOrderRef pairing) must surface as a specific, mappable exception, not a NPE.
    @Test
    void rejectsALineWhoseItemIsNotOnTheReferencedOrder() throws Exception {
        String key = "9a2e7d10-0000-0000-0000-000000000003";
        CreatePurchaseReceiptRequest request = new CreatePurchaseReceiptRequest(
                key, "PUR-ORD-2026-00003",
                List.of(new PurchaseReceiptLineRequest("row-1", "ITEM-9999", 1, "WH-0001")));

        when(purchaseOrderService.getRawDocument("PUR-ORD-2026-00003")).thenReturn(orderDoc(0));
        when(client.listResource("Purchase Receipt", "custom_idempotency_key", key))
                .thenReturn(objectMapper.readTree("{\"data\": []}"));

        PurchaseReceiptService service = new PurchaseReceiptService(client, new IdempotencyResolver(client), properties, purchaseOrderService);

        assertThatThrownBy(() -> service.createOrRecover(request))
                .isInstanceOf(PurchaseOrderLineNotFoundException.class);
        verify(client, never()).createResource(any(), any());
    }

    // Minimal Purchase Order document shape consumed by PurchaseReceiptService: one line of ITEM-0001, qty 10, rate 15.5.
    private JsonNode orderDoc(double receivedQty) throws Exception {
        return objectMapper.readTree(
                "{\"name\": \"PUR-ORD-2026-00001\", \"supplier\": \"SUP-0001\", \"docstatus\": 1, "
                        + "\"items\": [{\"name\": \"row-1\", \"item_code\": \"ITEM-0001\", \"qty\": 10, \"rate\": 15.5, \"received_qty\": "
                        + receivedQty + "}]}");
    }
}
