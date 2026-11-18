package com.omnia.compras;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

// Smoke test: the full Spring context (controllers, services, ErpNextClient) must wire up without a real ERPNext instance available.
@SpringBootTest
class ComprasBackendApplicationTests {

    @Test
    void contextLoads() {
    }
}
