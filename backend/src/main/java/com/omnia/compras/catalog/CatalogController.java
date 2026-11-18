package com.omnia.compras.catalog;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// Backs the frontend's one-time catalog download (data-model.md CatalogSupplier/CatalogItem) needed before any offline capture (FR-001).
@RestController
@RequestMapping("/api/catalog")
public class CatalogController {

    private final CatalogService catalogService;

    public CatalogController(CatalogService catalogService) {
        this.catalogService = catalogService;
    }

    @GetMapping("/suppliers")
    public SuppliersResponse suppliers() {
        return new SuppliersResponse(catalogService.listSuppliers());
    }

    @GetMapping("/items")
    public ItemsResponse items() {
        return new ItemsResponse(catalogService.listItems());
    }
}
