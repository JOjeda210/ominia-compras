#!/usr/bin/env bash
# Generates one ERPNext backup (database + site files) via `bench backup
# --with-files` (native Frappe mechanism, research.md) and copies the
# resulting artifacts out of the "sites" Docker volume into a dated folder
# under infra/backups/, a host bind mount outside any container volume
# (FR-009). Safe to call repeatedly: every run gets its own timestamped
# folder, so nothing is overwritten. Invoked both directly (manual/dev run)
# and by the backup-cron container on its daily schedule (same code path,
# see backup-cron-loop.sh), so "automatic" evidence is never faked by a
# different ad-hoc command.
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

COMPOSE="docker compose -f $COMPOSE_FILE"
TIMESTAMP="$(date -u +%Y-%m-%d_%H%M%SZ)"
DEST_DIR="$INFRA_DIR/backups/$TIMESTAMP"
mkdir -p "$DEST_DIR"

# Record which MariaDB instance is actually active right now (data-model.md:
# Backup.sourceInstance), instead of assuming it is always the primary --
# relevant after a mirror switch (User Story 3).
ACTIVE_DB_HOST=$($COMPOSE exec -T backend bash -c \
  "python3 -c \"import json;print(json.load(open('sites/common_site_config.json'))['db_host'])\"" | tr -d '\r')

echo "[$(date -Is)] Running bench backup --with-files for site $SITE_NAME (active DB: $ACTIVE_DB_HOST)..."
BACKUP_OUTPUT=$($COMPOSE exec -T backend bench --site "$SITE_NAME" backup --with-files 2>&1)
echo "$BACKUP_OUTPUT"

# Fail loudly (non-zero exit, visible message) instead of silently leaving a
# missing/partial backup -- required by spec.md Edge Cases (no silent
# failure the administrator could miss).
if ! echo "$BACKUP_OUTPUT" | grep -q "has been successfully completed"; then
  echo "BACKUP_FAILED: bench backup did not report success" >&2
  exit 1
fi

# Read the exact artifact paths from bench's own summary instead of guessing
# filenames, so this script keeps working across bench/Frappe versions.
extract_path() {
  echo "$BACKUP_OUTPUT" | awk -F': *' -v label="$1" '$0 ~ "^"label"[[:space:]]*:" {print $2}' | awk '{print $1}'
}
CONFIG_PATH=$(extract_path "Config")
DB_PATH=$(extract_path "Database")
PUBLIC_PATH=$(extract_path "Public")
PRIVATE_PATH=$(extract_path "Private")

for rel_path in "$CONFIG_PATH" "$DB_PATH" "$PUBLIC_PATH" "$PRIVATE_PATH"; do
  [ -z "$rel_path" ] && continue
  clean_path="${rel_path#./}"
  $COMPOSE cp "backend:/home/frappe/frappe-bench/sites/$clean_path" "$DEST_DIR/$(basename "$clean_path")"
done

{
  echo "generatedAt: $(date -u -Is)"
  echo "location: $DEST_DIR"
  echo "sourceInstance: $ACTIVE_DB_HOST"
  echo "site: $SITE_NAME"
  echo "files:"
  ls -la "$DEST_DIR"
} > "$DEST_DIR/backup.log"

echo "BACKUP_OK: $DEST_DIR"
