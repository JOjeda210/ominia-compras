package com.omnia.compras.purchasereceipt;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// Implements POST /api/purchase-receipts from contracts/backend-api.md (create-or-recover a Purchase Receipt).
@RestController
@RequestMapping("/api/purchase-receipts")
public class PurchaseReceiptController {

    private final PurchaseReceiptService service;

    public PurchaseReceiptController(PurchaseReceiptService service) {
        this.service = service;
    }

    // Returns 201 when a new Purchase Receipt was created and 200 when the same idempotencyKey already had one (identical body either way).
    @PostMapping
    public ResponseEntity<PurchaseReceiptResponse> create(@Valid @RequestBody CreatePurchaseReceiptRequest request) {
        PurchaseReceiptService.CreationResult result = service.createOrRecover(request);
        HttpStatus status = result.recovered() ? HttpStatus.OK : HttpStatus.CREATED;
        return ResponseEntity.status(status).body(result.response());
    }
}
