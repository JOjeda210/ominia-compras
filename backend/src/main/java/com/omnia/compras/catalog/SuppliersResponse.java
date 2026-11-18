package com.omnia.compras.catalog;

import java.util.List;

// Response envelope for GET /api/catalog/suppliers, matching contracts/backend-api.md exactly ({"suppliers": [...]}).
public record SuppliersResponse(List<SupplierDto> suppliers) {
}
