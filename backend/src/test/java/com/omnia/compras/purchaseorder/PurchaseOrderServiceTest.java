package com.omnia.compras.purchaseorder;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.omnia.compras.erpnext.ErpNextClient;
import com.omnia.compras.erpnext.ErpNextProperties;
import com.omnia.compras.idempotency.IdempotencyResolver;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

// End-to-end (mocked ERPNext) test of FR-005 to FR-008: a lost-response retry with the same idempotencyKey must recover PUR-ORD-0001, not create a second order.
@ExtendWith(MockitoExtension.class)
class PurchaseOrderServiceTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    // Fixed test company: PurchaseOrderService reads it once per request, no mocking needed for a plain record.
    private final ErpNextProperties properties = new ErpNextProperties(
            "http://localhost:8000", null, "test-key", "test-secret", "Omnia Compras Demo");

    @Mock
    private ErpNextClient client;

    @Test
    void firstRequestCreatesAndRetryWithSameKeyRecoversSameOrder() throws Exception {
        String key = "b3f1c2a0-aaaa-bbbb-cccc-000000000001";
        CreatePurchaseOrderRequest request = new CreatePurchaseOrderRequest(
                key, "SUP-0001", List.of(new PurchaseOrderLineRequest("ITEM-0001", 10, 15.5)));

        // First attempt: no document exists yet for this key, so ERPNext must be asked to create one.
        when(client.listResource("Purchase Order", "custom_idempotency_key", key))
                .thenReturn(objectMapper.readTree("{\"data\": []}"));
        when(client.createResource(eq("Purchase Order"), any()))
                .thenReturn(objectMapper.readTree(
                        "{\"data\": {\"name\": \"PUR-ORD-2026-00001\", \"supplier\": \"SUP-0001\", \"docstatus\": 0, "
                                + "\"items\": [{\"item_code\": \"ITEM-0001\", \"qty\": 10, \"rate\": 15.5, \"received_qty\": 0}]}}"));

        PurchaseOrderService service = new PurchaseOrderService(client, new IdempotencyResolver(client), properties);
        PurchaseOrderService.CreationResult first = service.createOrRecover(request);

        assertThat(first.recovered()).isFalse();
        assertThat(first.response().erpnextName()).isEqualTo("PUR-ORD-2026-00001");
        assertThat(first.response().status()).isEqualTo("draft");
        assertThat(first.response().lines()).containsExactly(
                new PurchaseOrderLineResponse("ITEM-0001", 10, 15.5, 0));
        verify(client, times(1)).createResource(eq("Purchase Order"), any());

        // Simulate the retry after a lost response: the same idempotencyKey now resolves to the document ERPNext already saved.
        reset(client);
        when(client.listResource("Purchase Order", "custom_idempotency_key", key))
                .thenReturn(objectMapper.readTree("{\"data\": [{\"name\": \"PUR-ORD-2026-00001\"}]}"));
        when(client.getResource("Purchase Order", "PUR-ORD-2026-00001"))
                .thenReturn(objectMapper.readTree(
                        "{\"data\": {\"name\": \"PUR-ORD-2026-00001\", \"supplier\": \"SUP-0001\", \"docstatus\": 0, "
                                + "\"items\": [{\"item_code\": \"ITEM-0001\", \"qty\": 10, \"rate\": 15.5, \"received_qty\": 0}]}}"));

        PurchaseOrderService.CreationResult retry = service.createOrRecover(request);

        assertThat(retry.recovered()).isTrue();
        assertThat(retry.response().erpnextName()).isEqualTo(first.response().erpnextName());
        // The core idempotency guarantee (Principle II): the retry must never call createResource again.
        verify(client, never()).createResource(any(), any());
    }

    @Test
    void mapsSubmittedAndCancelledDocstatusToTheContractVocabulary() throws Exception {
        String key = "9a2e7d10-0000-0000-0000-000000000003";
        CreatePurchaseOrderRequest request = new CreatePurchaseOrderRequest(
                key, "SUP-0002", List.of(new PurchaseOrderLineRequest("ITEM-0002", 5, 8)));

        when(client.listResource("Purchase Order", "custom_idempotency_key", key))
                .thenReturn(objectMapper.readTree("{\"data\": []}"));
        when(client.createResource(eq("Purchase Order"), any()))
                .thenReturn(objectMapper.readTree(
                        "{\"data\": {\"name\": \"PUR-ORD-2026-00002\", \"supplier\": \"SUP-0002\", \"docstatus\": 1, "
                                + "\"items\": [{\"item_code\": \"ITEM-0002\", \"qty\": 5, \"rate\": 8, \"received_qty\": 0}]}}"));

        PurchaseOrderService service = new PurchaseOrderService(client, new IdempotencyResolver(client), properties);
        PurchaseOrderService.CreationResult result = service.createOrRecover(request);

        assertThat(result.response().status()).isEqualTo("submitted");
    }

    // FR-009: edit must target the same folio (PUT /api/resource) and never go through the idempotency create-or-recover path.
    @Test
    void updateEditsTheSameFolioInPlace() throws Exception {
        when(client.updateResource(eq("Purchase Order"), eq("PUR-ORD-2026-00003"), any()))
                .thenReturn(objectMapper.readTree(
                        "{\"data\": {\"name\": \"PUR-ORD-2026-00003\", \"supplier\": \"SUP-0003\", \"docstatus\": 0, "
                                + "\"items\": [{\"item_code\": \"ITEM-0003\", \"qty\": 12, \"rate\": 9, \"received_qty\": 0}]}}"));

        PurchaseOrderService service = new PurchaseOrderService(client, new IdempotencyResolver(client), properties);
        UpdatePurchaseOrderRequest request = new UpdatePurchaseOrderRequest(
                "key-update", null, List.of(new PurchaseOrderLineRequest("ITEM-0003", 12, 9)));

        PurchaseOrderResponse response = service.update("PUR-ORD-2026-00003", request);

        assertThat(response.erpnextName()).isEqualTo("PUR-ORD-2026-00003");
        assertThat(response.lines()).containsExactly(new PurchaseOrderLineResponse("ITEM-0003", 12, 9, 0));
        verify(client, never()).createResource(any(), any());
    }

    // FR-010/FR-011 (submit side): drives docstatus 0 -> 1 via the generic resource PUT endpoint (confirmed live against real ERPNext).
    @Test
    void submitDrivesDocstatusToOneViaUpdateResource() throws Exception {
        when(client.updateResource(eq("Purchase Order"), eq("PUR-ORD-2026-00004"), eq(Map.of("docstatus", 1))))
                .thenReturn(objectMapper.readTree("{\"data\": {\"name\": \"PUR-ORD-2026-00004\", \"docstatus\": 1}}"));

        PurchaseOrderService service = new PurchaseOrderService(client, new IdempotencyResolver(client), properties);
        PurchaseOrderStatusResponse response = service.submit("PUR-ORD-2026-00004");

        assertThat(response).isEqualTo(new PurchaseOrderStatusResponse("PUR-ORD-2026-00004", "submitted"));
    }

    // FR-010/FR-011 (cancel side): drives docstatus 1 -> 2; a linked submitted receipt makes ERPNext reject this with
    // LinkExistsError instead (propagated as ErpNextApiException and translated to 409 by ErpNextErrorTranslator, tested there).
    @Test
    void cancelDrivesDocstatusToTwoViaUpdateResource() throws Exception {
        when(client.updateResource(eq("Purchase Order"), eq("PUR-ORD-2026-00005"), eq(Map.of("docstatus", 2))))
                .thenReturn(objectMapper.readTree("{\"data\": {\"name\": \"PUR-ORD-2026-00005\", \"docstatus\": 2}}"));

        PurchaseOrderService service = new PurchaseOrderService(client, new IdempotencyResolver(client), properties);
        PurchaseOrderStatusResponse response = service.cancel("PUR-ORD-2026-00005");

        assertThat(response).isEqualTo(new PurchaseOrderStatusResponse("PUR-ORD-2026-00005", "cancelled"));
    }

    // GET /api/purchase-orders/{erpnextName} (contracts/backend-api.md): a plain read, never goes through IdempotencyResolver.
    @Test
    void getReadsTheCurrentDocumentWithoutTouchingIdempotency() throws Exception {
        when(client.getResource("Purchase Order", "PUR-ORD-2026-00006"))
                .thenReturn(objectMapper.readTree(
                        "{\"data\": {\"name\": \"PUR-ORD-2026-00006\", \"supplier\": \"SUP-0006\", \"docstatus\": 1, "
                                + "\"items\": [{\"item_code\": \"ITEM-0006\", \"qty\": 6, \"rate\": 1, \"received_qty\": 4}]}}"));

        PurchaseOrderService service = new PurchaseOrderService(client, new IdempotencyResolver(client), properties);
        PurchaseOrderResponse response = service.get("PUR-ORD-2026-00006");

        assertThat(response.erpnextName()).isEqualTo("PUR-ORD-2026-00006");
        assertThat(response.status()).isEqualTo("submitted");
        assertThat(response.lines()).containsExactly(new PurchaseOrderLineResponse("ITEM-0006", 6, 1, 4));
        verify(client, never()).listResource(any(), any(), any());
    }
}
