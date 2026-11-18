#!/usr/bin/env bash
# Restores one infra/backups/<timestamp>/ backup into a brand-new Frappe
# site inside the SAME bench/container (multi-tenant restore, decision
# recorded in research.md/Clarify), instead of a second Compose stack.
# Usage: scripts/restore.sh infra/backups/<timestamp> [restore-site-name]
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

BACKUP_DIR="${1:?Usage: restore.sh <infra/backups/TIMESTAMP> [restore-site-name]}"
RESTORE_SITE="${2:-restore-test.localhost}"
BACKUP_DIR="$(cd "$BACKUP_DIR" && pwd)"
COMPOSE="docker compose -f $COMPOSE_FILE"

DB_FILE=$(ls "$BACKUP_DIR"/*-database.sql.gz 2>/dev/null | head -1)
PUBLIC_FILE=$(ls "$BACKUP_DIR"/*-files.tar 2>/dev/null | head -1)
PRIVATE_FILE=$(ls "$BACKUP_DIR"/*-private-files.tar 2>/dev/null | head -1)

# Fail loudly on a missing/incomplete backup instead of restoring a
# partial site silently (spec.md Edge Cases: a corrupt/incomplete backup
# must fail clearly, not leave a half-restored site without warning).
for label_path in "database:$DB_FILE" "public files:$PUBLIC_FILE" "private files:$PRIVATE_FILE"; do
  label="${label_path%%:*}"
  path="${label_path#*:}"
  if [ -z "$path" ] || [ ! -s "$path" ]; then
    echo "RESTORE_FAILED: missing or empty backup artifact ($label) under $BACKUP_DIR" >&2
    exit 1
  fi
done

# Container-side paths must be absolute for `docker compose cp` (it has no
# notion of the container's workdir), but a BARE argv token starting with
# "/" gets silently rewritten into a Windows path by Git Bash/MSYS before
# reaching docker.exe, so every absolute path below is either (a) prefixed
# with "backend:" (not path-like as a whole token, confirmed empirically
# safe in Fase 5) or (b) wrapped inside a single `bash -c "..."` string
# (also confirmed safe: MSYS only rewrites a token that IS a path, not one
# that merely contains one). See research.md for the full empirical note.
STAGING_DIR_NAME="restore-staging-$(basename "$BACKUP_DIR")"
CONTAINER_TMP="/home/frappe/frappe-bench/sites/$STAGING_DIR_NAME"

echo "[1/3] Copying backup artifacts into the sites volume (container: backend)..."
$COMPOSE exec -T backend bash -c "mkdir -p '$CONTAINER_TMP'"
$COMPOSE cp "$DB_FILE" "backend:$CONTAINER_TMP/$(basename "$DB_FILE")"
$COMPOSE cp "$PUBLIC_FILE" "backend:$CONTAINER_TMP/$(basename "$PUBLIC_FILE")"
$COMPOSE cp "$PRIVATE_FILE" "backend:$CONTAINER_TMP/$(basename "$PRIVATE_FILE")"

echo "[2/3] Creating site $RESTORE_SITE in the same bench (skipped if it already exists; safe to re-run)..."
SITE_EXISTS=$($COMPOSE exec -T backend bash -c "[ -d sites/$RESTORE_SITE ] && echo yes || echo no" | tr -d '\r')
if [ "$SITE_EXISTS" = "no" ]; then
  $COMPOSE exec -T backend bash -c "bench new-site \
    --mariadb-user-host-login-scope='%' \
    --admin-password='$ADMIN_PASSWORD' \
    --db-root-username=root \
    --db-root-password='$MARIADB_ROOT_PASSWORD' \
    '$RESTORE_SITE'"
else
  echo "Site $RESTORE_SITE already exists; reusing it (bench restore overwrites its data)."
fi

echo "[3/3] Restoring database + public/private files into $RESTORE_SITE..."
$COMPOSE exec -T backend bash -c "bench --site '$RESTORE_SITE' restore \
  --mariadb-root-username root \
  --mariadb-root-password '$MARIADB_ROOT_PASSWORD' \
  --with-public-files '$CONTAINER_TMP/$(basename "$PUBLIC_FILE")' \
  --with-private-files '$CONTAINER_TMP/$(basename "$PRIVATE_FILE")' \
  '$CONTAINER_TMP/$(basename "$DB_FILE")'"

echo "RESTORE_OK: site $RESTORE_SITE restored from $BACKUP_DIR"
echo "Verify with: docker compose exec backend bench --site $RESTORE_SITE console"
