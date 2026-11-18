package com.omnia.compras.erpnext;

import org.springframework.boot.context.properties.ConfigurationProperties;

// Binds ERPNext integration settings exclusively from environment variables (see backend/.env.example); never hardcoded, never sent to the frontend.
// siteHost is optional: only needed when ERPNext serves multiple Frappe sites behind one reverse-proxy port and site routing is done
// by the HTTP Host header (infra's frappe_docker lab setup), as opposed to baseUrl already pointing at a dedicated hostname/port per site.
@ConfigurationProperties(prefix = "erpnext")
public record ErpNextProperties(String baseUrl, String siteHost, String apiKey, String apiSecret, String defaultCompany) {
}
