#!/usr/bin/env bash
# One-time setup of GTID replication between mariadb-primary and
# mariadb-replica. Creates a dedicated replication account on the primary
# (privilege REPLICATION SLAVE only, per research.md) and points the
# replica at it using MASTER_USE_GTID=slave_pos, the GTID-based mode
# supported by MariaDB 10.6 (confirmed empirically in Fase 3; see the
# "Pendiente de verificación empírica" note in research.md).
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

echo "Creating dedicated replication user on mariadb-primary..."
$COMPOSE exec -T mariadb-primary mariadb -u root -p"$MARIADB_ROOT_PASSWORD" <<SQL
CREATE USER IF NOT EXISTS '$MARIADB_REPLICATION_USER'@'%' IDENTIFIED BY '$MARIADB_REPLICATION_PASSWORD';
GRANT REPLICATION SLAVE ON *.* TO '$MARIADB_REPLICATION_USER'@'%';
FLUSH PRIVILEGES;
SQL

echo "Pointing mariadb-replica at mariadb-primary via GTID..."
$COMPOSE exec -T mariadb-replica mariadb -u root -p"$MARIADB_ROOT_PASSWORD" <<SQL
STOP SLAVE;
CHANGE MASTER TO
  MASTER_HOST='mariadb-primary',
  MASTER_PORT=3306,
  MASTER_USER='$MARIADB_REPLICATION_USER',
  MASTER_PASSWORD='$MARIADB_REPLICATION_PASSWORD',
  MASTER_USE_GTID=slave_pos;
START SLAVE;
SQL

echo "Replication configured. Run check-replication.sh to verify status."
