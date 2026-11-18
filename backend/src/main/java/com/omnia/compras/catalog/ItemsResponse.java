package com.omnia.compras.catalog;

import java.util.List;

// Response envelope for GET /api/catalog/items, matching contracts/backend-api.md exactly ({"items": [...]}).
public record ItemsResponse(List<ItemDto> items) {
}
