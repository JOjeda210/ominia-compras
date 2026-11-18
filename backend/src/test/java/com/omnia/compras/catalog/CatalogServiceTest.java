package com.omnia.compras.catalog;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.omnia.compras.erpnext.ErpNextClient;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

// Verifies the ERPNext field names (snake_case) map correctly onto the camelCase DTOs the frontend contract expects.
@ExtendWith(MockitoExtension.class)
class CatalogServiceTest {

    @Mock
    private ErpNextClient client;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void mapsSuppliersFromErpNextFields() throws Exception {
        when(client.listResourceWithFields("Supplier", List.of("name", "supplier_name")))
                .thenReturn(objectMapper.readTree(
                        "{\"data\": [{\"name\": \"SUP-0001\", \"supplier_name\": \"Proveedor Ficticio SA\"}]}"));

        List<SupplierDto> suppliers = new CatalogService(client).listSuppliers();

        assertThat(suppliers).containsExactly(new SupplierDto("SUP-0001", "Proveedor Ficticio SA"));
    }

    @Test
    void mapsItemsIncludingStockFlagAsBoolean() throws Exception {
        when(client.listResourceWithFields("Item", List.of("name", "item_name", "stock_uom", "is_stock_item")))
                .thenReturn(objectMapper.readTree(
                        "{\"data\": [{\"name\": \"ITEM-0001\", \"item_name\": \"Tornillo\", "
                                + "\"stock_uom\": \"Unidad\", \"is_stock_item\": 1}]}"));

        List<ItemDto> items = new CatalogService(client).listItems();

        assertThat(items).containsExactly(new ItemDto("ITEM-0001", "Tornillo", "Unidad", true));
    }
}
