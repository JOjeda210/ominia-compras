#!/usr/bin/env bash
# Creates the custom_idempotency_key field (Data, unique) on Purchase Order
# and Purchase Receipt, required by backend/ to implement Principle II
# (Idempotencia) from the constitution: retries must find the already
# created document instead of inserting a duplicate. Run through
# `bench console` so the same steps can be reproduced identically on any
# machine (no manual "Customize Form" clicks to document).
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

fieldname = "custom_idempotency_key"
for doctype in ["Purchase Order", "Purchase Receipt"]:
    if not frappe.db.exists("Custom Field", {"dt": doctype, "fieldname": fieldname}):
        frappe.get_doc({
            "doctype": "Custom Field",
            "dt": doctype,
            "fieldname": fieldname,
            "label": "Idempotency Key",
            "fieldtype": "Data",
            "unique": 1,
            # Writable after submit: a Purchase Receipt retry may need to
            # attach its idempotency key even though the document is
            # already submitted by the time the backend re-checks it.
            "allow_on_submit": 1,
        }).insert(ignore_permissions=True)

frappe.clear_cache()
frappe.db.commit()
print("CUSTOM_FIELDS_OK")
PYEOF
