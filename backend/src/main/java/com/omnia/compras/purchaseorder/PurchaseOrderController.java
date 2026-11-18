package com.omnia.compras.purchaseorder;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// Implements the Purchase Order endpoints of contracts/backend-api.md: create-or-recover, edit, submit and cancel.
@RestController
@RequestMapping("/api/purchase-orders")
public class PurchaseOrderController {

    private final PurchaseOrderService service;

    public PurchaseOrderController(PurchaseOrderService service) {
        this.service = service;
    }

    // Returns 201 when a new Purchase Order was created and 200 when the same idempotencyKey already had one (identical body either way).
    @PostMapping
    public ResponseEntity<PurchaseOrderResponse> create(@Valid @RequestBody CreatePurchaseOrderRequest request) {
        PurchaseOrderService.CreationResult result = service.createOrRecover(request);
        HttpStatus status = result.recovered() ? HttpStatus.OK : HttpStatus.CREATED;
        return ResponseEntity.status(status).body(result.response());
    }

    // FR-009: edits the same ERPNext document in place (same folio), never creates a second one.
    @PutMapping("/{erpnextName}")
    public PurchaseOrderResponse update(@PathVariable String erpnextName, @Valid @RequestBody UpdatePurchaseOrderRequest request) {
        return service.update(erpnextName, request);
    }

    // FR-010/FR-011: presents the draft; ERPNext validates mandatory data before allowing docstatus 0 -> 1.
    @PostMapping("/{erpnextName}/submit")
    public PurchaseOrderStatusResponse submit(@PathVariable String erpnextName) {
        return service.submit(erpnextName);
    }

    // FR-010/FR-011: cancels a submitted order; ERPNext rejects it (-> 409) when a Purchase Receipt is already linked.
    @PostMapping("/{erpnextName}/cancel")
    public PurchaseOrderStatusResponse cancel(@PathVariable String erpnextName) {
        return service.cancel(erpnextName);
    }

    // Lets the frontend refresh an order's current status/receivedQuantity (contracts/backend-api.md), e.g. after creating a receipt.
    @GetMapping("/{erpnextName}")
    public PurchaseOrderResponse get(@PathVariable String erpnextName) {
        return service.get(erpnextName);
    }
}
