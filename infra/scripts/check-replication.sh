#!/usr/bin/env bash
# Reports GTID replication health on mariadb-replica: Slave_IO_Running,
# Slave_SQL_Running and Seconds_Behind_Master (contracts/operational-checks.md).
# Exits non-zero if either thread is not "Yes" or the lag is not 0, so this
# script can also be used as a pass/fail check, not only for human reading.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$INFRA_DIR/docker-compose.yml"

# Load credentials from infra/.env without printing them.
if [ -f "$INFRA_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$INFRA_DIR/.env"
  set +a
fi

RAW_STATUS=$(docker compose -f "$COMPOSE_FILE" exec -T mariadb-replica \
  mariadb -u root -p"$MARIADB_ROOT_PASSWORD" -e "SHOW SLAVE STATUS\G")

IO_RUNNING=$(echo "$RAW_STATUS" | awk -F': ' '/Slave_IO_Running:/{print $2; exit}')
SQL_RUNNING=$(echo "$RAW_STATUS" | awk -F': ' '/Slave_SQL_Running:/{print $2; exit}')
SECONDS_BEHIND=$(echo "$RAW_STATUS" | awk -F': ' '/Seconds_Behind_Master:/{print $2; exit}')

echo "Slave_IO_Running: $IO_RUNNING"
echo "Slave_SQL_Running: $SQL_RUNNING"
echo "Seconds_Behind_Master: $SECONDS_BEHIND"

if [ "$IO_RUNNING" = "Yes" ] && [ "$SQL_RUNNING" = "Yes" ] && [ "$SECONDS_BEHIND" = "0" ]; then
  echo "REPLICATION_OK"
  exit 0
else
  echo "REPLICATION_NOT_OK"
  exit 1
fi
