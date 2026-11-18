package com.omnia.compras.catalog;

import com.fasterxml.jackson.databind.JsonNode;
import com.omnia.compras.erpnext.ErpNextClient;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

// Reads read-only catalogs from ERPNext (Supplier/Item) so the frontend can download them once and capture orders fully offline afterward.
@Service
public class CatalogService {

    private final ErpNextClient client;

    public CatalogService(ErpNextClient client) {
        this.client = client;
    }

    public List<SupplierDto> listSuppliers() {
        JsonNode data = client.listResourceWithFields("Supplier", List.of("name", "supplier_name")).get("data");
        List<SupplierDto> suppliers = new ArrayList<>();
        if (data != null && data.isArray()) {
            for (JsonNode node : data) {
                suppliers.add(new SupplierDto(node.get("name").asText(), node.get("supplier_name").asText()));
            }
        }
        return suppliers;
    }

    // Includes stock_uom and is_stock_item up front even though they are only consumed by the receipt flow (US4/US5), to avoid a second round trip.
    public List<ItemDto> listItems() {
        JsonNode data = client.listResourceWithFields("Item", List.of("name", "item_name", "stock_uom", "is_stock_item")).get("data");
        List<ItemDto> items = new ArrayList<>();
        if (data != null && data.isArray()) {
            for (JsonNode node : data) {
                items.add(new ItemDto(
                        node.get("name").asText(),
                        node.get("item_name").asText(),
                        node.get("stock_uom").asText(),
                        node.get("is_stock_item").asInt() == 1));
            }
        }
        return items;
    }
}
