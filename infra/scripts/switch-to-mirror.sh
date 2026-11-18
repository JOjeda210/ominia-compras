#!/usr/bin/env bash
# Promotes mariadb-replica to the active, writable database for ERPNext
# (User Story 3 / FR-006), and arms mariadb-primary so the NEXT time an
# administrator restarts it, it boots read-only instead of risking a
# silent write divergence from the data already accepted by the promoted
# replica (FR-007). Assumes `docker compose stop mariadb-primary` already
# ran (contracts/operational-checks.md); this script does not stop it
# itself, so the simulated outage stays an explicit, auditable step.
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

echo "[1/4] Promoting mariadb-replica to a writable, standalone database..."
# STOP SLAVE first: the replica must stop pulling from the (now stopped)
# primary before it starts accepting its own writes, so it never tries to
# apply old primary binlog on top of writes the primary never saw.
# NOTE (empirical, Fase 5): unlike MySQL, MariaDB 10.6 has no
# `super_read_only` system variable at all ("ERROR 1193: Unknown system
# variable"); MariaDB's equivalent concept is the per-account
# `READ_ONLY ADMIN` privilege (10.5+), which decides who can bypass a plain
# `read_only=1`. This lab's site-specific DB user has no privileges beyond
# its own schema (confirmed via `SHOW GRANTS`), so a single `read_only=1`
# already fully blocks ERPNext's writes -- see research.md for the full note.
$COMPOSE exec -T mariadb-replica mariadb -u root -p"$MARIADB_ROOT_PASSWORD" <<SQL
STOP SLAVE;
SET GLOBAL read_only = 0;
SQL

echo "[2/4] Persisting the promotion in mariadb-replica/conf.d/gtid.cnf (survives a future restart)..."
REPLICA_CNF="$INFRA_DIR/mariadb-replica/conf.d/gtid.cnf"
if grep -q "^read_only = 1" "$REPLICA_CNF"; then
  sed -i 's/^read_only = 1.*/# read_only = 1  # removed by switch-to-mirror.sh: this instance is now the active, writable database/' "$REPLICA_CNF"
fi

echo "[3/4] Pointing ERPNext at mariadb-replica and restarting the app processes that hold a live DB connection..."
# bench set-config -g only rewrites sites/common_site_config.json (shared
# config for every site in this bench); it does not need a live DB
# connection itself, same as the "configurator" one-shot service that
# writes this file for the very first time during deployment.
$COMPOSE exec -T backend bench set-config -g db_host mariadb-replica
$COMPOSE restart backend websocket queue-short queue-long scheduler

echo "[4/4] Arming mariadb-primary/conf.d/gtid.cnf to boot read-only the next time it starts (FR-007)..."
PRIMARY_CNF="$INFRA_DIR/mariadb-primary/conf.d/gtid.cnf"
if ! grep -q "^read_only = 1" "$PRIMARY_CNF"; then
  cat >> "$PRIMARY_CNF" <<'EOF'

# Added by switch-to-mirror.sh at demotion time (FR-007): once
# mariadb-replica is promoted, this instance must never accept writes
# again on its own, to avoid diverging from data already accepted by the
# promoted replica. Deliberately NOT present in a from-scratch deployment:
# a brand-new primary needs write access for
# "bench new-site --install-app erpnext" (confirmed empirically -- the
# site's own MariaDB user has no SUPER privilege, so a permanent
# read_only=1 here from the start would break every fresh deploy,
# contradicting FR-001/SC-001). This block is only added by this script,
# at the moment of a real demotion. No `super_read_only` line: MariaDB
# 10.6 has no such variable (confirmed empirically, see research.md);
# plain `read_only=1` is already sufficient because ERPNext's site DB
# user has no privilege beyond its own schema.
read_only = 1
EOF
fi

echo
echo "Mirror switch complete. ERPNext now runs against mariadb-replica."
echo "When ready, restart the old primary with: docker compose start mariadb-primary"
echo "Then verify it rejects writes (contracts/operational-checks.md, 'Primario fuera de escritura al reiniciar')."
