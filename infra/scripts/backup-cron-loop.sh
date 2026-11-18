#!/bin/sh
# Minimal, dependency-free cron-equivalent for the daily ERPNext backup
# (FR-008). Runs as PID 1 of the backup-cron container: polls the
# configured HH:MM (UTC) from backup-schedule.env every 30s and invokes the
# SAME scripts/backup.sh used for a manual run, exactly once per calendar
# day, via a per-day marker file (so re-polling the same minute does not
# fire twice). Written in POSIX sh, not bash, because this loop itself must
# run before bash is installed below.
set -eu

SCHEDULE_FILE=/infra/scripts/backup-schedule.env
MARKER_DIR=/infra/backups
mkdir -p "$MARKER_DIR"

# docker:*-cli is Alpine-based and ships only POSIX sh/busybox; bash is
# required because scripts/backup.sh uses bash-only syntax (process
# substitution-free, but relies on `set -o pipefail`).
echo "[$(date -Iseconds)] Installing bash (one-time, on container start)..."
apk add --no-cache bash >/dev/null

echo "[$(date -Iseconds)] backup-cron loop started; reading schedule from $SCHEDULE_FILE every 30s"
while true; do
  # shellcheck disable=SC1090
  . "$SCHEDULE_FILE"
  NOW_HOUR=$(date -u +%H)
  NOW_MIN=$(date -u +%M)
  TODAY=$(date -u +%Y-%m-%d)
  MARKER="$MARKER_DIR/.last-cron-run-$TODAY"
  if [ "$NOW_HOUR" = "$BACKUP_HOUR" ] && [ "$NOW_MIN" = "$BACKUP_MINUTE" ] && [ ! -f "$MARKER" ]; then
    echo "[$(date -Iseconds)] Scheduled time reached ($BACKUP_HOUR:$BACKUP_MINUTE UTC); running backup.sh"
    if bash /infra/scripts/backup.sh; then
      touch "$MARKER"
    else
      echo "[$(date -Iseconds)] BACKUP_FAILED via cron" >&2
    fi
  fi
  sleep 30
done
