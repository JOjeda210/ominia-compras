package com.omnia.compras.idempotency;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.omnia.compras.erpnext.ErpNextClient;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

// Covers Principle II (idempotency): a reintento with the same key must recover the existing document, never create a second one.
@ExtendWith(MockitoExtension.class)
class IdempotencyResolverTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Mock
    private ErpNextClient client;

    @Test
    void recoversExistingDocumentInsteadOfCreatingANewOne() throws Exception {
        String key = "b3f1c2a0-0000-0000-0000-000000000000";
        when(client.listResource("Purchase Order", "custom_idempotency_key", key))
                .thenReturn(wrapList("PUR-ORD-2026-00001"));
        when(client.getResource("Purchase Order", "PUR-ORD-2026-00001"))
                .thenReturn(wrapDoc("PUR-ORD-2026-00001"));

        @SuppressWarnings("unchecked")
        Supplier<JsonNode> createFn = mock(Supplier.class);

        IdempotencyResolver resolver = new IdempotencyResolver(client);
        IdempotencyResolver.Resolution resolution = resolver.resolve("Purchase Order", key, createFn);

        assertThat(resolution.recovered()).isTrue();
        assertThat(resolution.document().get("name").asText()).isEqualTo("PUR-ORD-2026-00001");
        // The whole point of idempotency: a retry must never call the create function once a document for this key already exists.
        verify(createFn, never()).get();
        verify(client, never()).createResource(any(), any());
    }

    @Test
    void createsExactlyOnceWhenNoExistingDocumentIsFound() throws Exception {
        String key = "9a2e7d10-0000-0000-0000-000000000000";
        when(client.listResource("Purchase Order", "custom_idempotency_key", key))
                .thenReturn(emptyList());

        @SuppressWarnings("unchecked")
        Supplier<JsonNode> createFn = mock(Supplier.class);
        when(createFn.get()).thenReturn(wrapDoc("PUR-ORD-2026-00002"));

        IdempotencyResolver resolver = new IdempotencyResolver(client);
        IdempotencyResolver.Resolution resolution = resolver.resolve("Purchase Order", key, createFn);

        assertThat(resolution.recovered()).isFalse();
        assertThat(resolution.document().get("name").asText()).isEqualTo("PUR-ORD-2026-00002");
        verify(createFn, times(1)).get();
        verify(client, never()).getResource(eq("Purchase Order"), any());
    }

    private JsonNode wrapList(String name) throws Exception {
        return objectMapper.readTree("{\"data\": [{\"name\": \"" + name + "\"}]}");
    }

    private JsonNode emptyList() throws Exception {
        return objectMapper.readTree("{\"data\": []}");
    }

    private JsonNode wrapDoc(String name) throws Exception {
        return objectMapper.readTree("{\"data\": {\"name\": \"" + name + "\"}}");
    }
}
