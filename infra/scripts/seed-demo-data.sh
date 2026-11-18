#!/usr/bin/env bash
# Seeds the lab ErpnextSite (purpose=lab, see data-model.md) with fictitious
# master data: one Company, one Warehouse, two Suppliers and two stock
# Items with UoM, so US1 can be tested without manual configuration.
# Runs through `bench console` (reads a Python script from stdin) because
# there is no dedicated REST endpoint for bulk-creating these doctypes.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$INFRA_DIR/docker-compose.yml"

if [ -f "$INFRA_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$INFRA_DIR/.env"
  set +a
fi

docker compose -f "$COMPOSE_FILE" exec -T backend bench --site "$SITE_NAME" console <<'PYEOF'
import frappe

# `bench new-site --install-app erpnext` only runs the after_install hook;
# master records such as "All Item Groups", "All Supplier Groups" and the
# default UOMs ("Nos") are normally created by the Setup Wizard, which this
# unattended lab never runs through the browser. Call the same fixture
# installer the wizard calls, so those masters exist before we reference
# them below (confirmed empirically in Fase 3; see research.md).
from erpnext.setup.setup_wizard.operations.install_fixtures import install as install_fixtures

if not frappe.db.exists("Item Group", "All Item Groups"):
    install_fixtures(country="Mexico")
    frappe.db.commit()

# Fictitious company used across this lab; idempotent (safe to re-run).
company_name = "Omnia Compras Demo"
if not frappe.db.exists("Company", company_name):
    company = frappe.get_doc({
        "doctype": "Company",
        "company_name": company_name,
        "abbr": "OCD",
        "default_currency": "MXN",
        "country": "Mexico",
    })
    company.insert(ignore_permissions=True)
else:
    company = frappe.get_doc("Company", company_name)
frappe.db.commit()

# A single fictitious warehouse under the company's default warehouse group.
warehouse_name = f"Almacen Central - {company.abbr}"
if not frappe.db.exists("Warehouse", warehouse_name):
    parent_warehouse = frappe.db.get_value(
        "Warehouse", {"company": company.name, "is_group": 1}, "name"
    )
    frappe.get_doc({
        "doctype": "Warehouse",
        "warehouse_name": "Almacen Central",
        "company": company.name,
        "parent_warehouse": parent_warehouse,
    }).insert(ignore_permissions=True)
frappe.db.commit()

# Fictitious suppliers (no real-world identities).
for supplier_name in ["Proveedor Ficticio Uno", "Proveedor Ficticio Dos"]:
    if not frappe.db.exists("Supplier", supplier_name):
        frappe.get_doc({
            "doctype": "Supplier",
            "supplier_name": supplier_name,
            "supplier_group": "All Supplier Groups",
            "country": "Mexico",
        }).insert(ignore_permissions=True)
frappe.db.commit()

# Fictitious stock items with inventory tracking and unit of measure (Nos).
items = [
    {"item_code": "ART-001", "item_name": "Articulo Ficticio Uno"},
    {"item_code": "ART-002", "item_name": "Articulo Ficticio Dos"},
]
for item in items:
    if not frappe.db.exists("Item", item["item_code"]):
        frappe.get_doc({
            "doctype": "Item",
            "item_code": item["item_code"],
            "item_name": item["item_name"],
            "item_group": "All Item Groups",
            "stock_uom": "Nos",
            "is_stock_item": 1,
            "item_defaults": [{
                "company": company.name,
                "default_warehouse": warehouse_name,
            }],
        }).insert(ignore_permissions=True)
frappe.db.commit()

print("SEED_OK")
PYEOF
