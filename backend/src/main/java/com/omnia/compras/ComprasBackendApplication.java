package com.omnia.compras;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

// Entry point; scans for @ConfigurationProperties records (ErpNextProperties) so ERPNext credentials load only from environment variables.
@SpringBootApplication
@ConfigurationPropertiesScan
public class ComprasBackendApplication {

    public static void main(String[] args) {
        SpringApplication.run(ComprasBackendApplication.class, args);
    }
}
