#!/usr/bin/env bash
# Creates (idempotently) the ERPNext integration user used later by
# backend/ to call the REST API, with roles covering Supplier, Item,
# Purchase Order, Purchase Receipt, Warehouse and Company, and generates
# its API Key/Secret.
#
# SECURITY: this script prints the API Key/Secret to stdout ONCE (Frappe
# only returns the secret at generation time; it is stored hashed
# afterwards). Copy both values into infra/.env immediately and NEVER
# paste them into a file that is committed to git or kept as evidence.
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
from frappe.core.doctype.user.user import generate_keys

user_email = "integration@omnia-compras.local"
if not frappe.db.exists("User", user_email):
    user = frappe.get_doc({
        "doctype": "User",
        "email": user_email,
        "first_name": "Integration",
        "last_name": "Service",
        "send_welcome_email": 0,
        "user_type": "System User",
    })
    user.insert(ignore_permissions=True)
else:
    user = frappe.get_doc("User", user_email)

# Roles covering Supplier, Item, Purchase Order and Purchase Receipt.
# "Purchase User" is added on top of "Purchase Manager"/"Stock Manager"
# because, empirically (confirmed against this ERPNext version), neither
# "Purchase Manager" nor "Stock Manager" appears in the standard DocPerm
# list for Warehouse or Company, while "Purchase User" grants read on both
# without widening write access beyond what "Purchase Manager" already has.
existing_roles = {r.role for r in user.roles}
for role in ["Purchase Manager", "Stock Manager", "Purchase User"]:
    if role not in existing_roles:
        user.append("roles", {"role": role})
user.save(ignore_permissions=True)
frappe.db.commit()

# generate_keys() creates api_key if missing and returns the plaintext
# api_secret exactly once (wrapped in a dict), afterwards only its hash is
# stored (confirmed empirically against this Frappe version in Fase 3).
# api_key/api_secret are permlevel=1 fields: the explicit commit below is
# required, otherwise the update only lives in this process's uncommitted
# transaction and is lost once bench console exits without a clean commit
# (also confirmed empirically in Fase 3).
api_secret = generate_keys(user_email)["api_secret"]
frappe.db.commit()
user.reload()
print("INTEGRATION_USER=" + user_email)
print("INTEGRATION_API_KEY=" + user.api_key)
print("INTEGRATION_API_SECRET=" + api_secret)
PYEOF
