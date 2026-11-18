package com.omnia.compras.catalog;

import com.fasterxml.jackson.databind.JsonNode;
import com.omnia.compras.erpnext.ErpNextClient;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

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

    // Not in the original contract: added so the receipt flow has a real warehouse name instead of a frontend-hardcoded guess;
    // spec.md Assumptions guarantees a single Warehouse for this demo, so the list is expected to have exactly one entry.
    // is_group=0 excludes tree group nodes (e.g. "All Warehouses - OCD"): ERPNext rejects those as a transaction
    // warehouse with "Group node warehouse is not allowed to select for transactions" (confirmed empirically in Fase 4).
    public List<WarehouseDto> listWarehouses() {
        JsonNode data = client.listResourceWithFields(
                "Warehouse", List.of("name", "warehouse_name"), Map.of("is_group", 0)).get("data");
        List<WarehouseDto> warehouses = new ArrayList<>();
        if (data != null && data.isArray()) {
            for (JsonNode node : data) {
                warehouses.add(new WarehouseDto(node.get("name").asText(), node.get("warehouse_name").asText()));
            }
        }
        return warehouses;
    }
}
