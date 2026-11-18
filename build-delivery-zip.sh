#!/usr/bin/env bash
# Builds the final delivery ZIP (specs, Spec Kit files, backlog, sprint notes, code, Docker Compose
# config, subagent config, README, Evidencias.pdf) excluding secrets/node_modules/target.
# Uses `git archive` for everything tracked by git -- node_modules/, target/, dist/ and the real
# .env files are never committed (see .gitignore), so they are excluded automatically instead of
# needing a manually-maintained exclude list that could drift out of sync.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

OUTPUT_NAME="omnia-compras-entrega-$(date +%Y%m%d).zip"
OUTPUT_PATH="$REPO_ROOT/$OUTPUT_NAME"
rm -f "$OUTPUT_PATH"

echo "Archiving tracked files from HEAD into $OUTPUT_NAME..."
git archive --format=zip --output="$OUTPUT_PATH" HEAD

# Evidencias.pdf is produced by the user from the screenshots this project generated/guided
# (see docs/evidencias-guia.md); it is not committed to git, so it is appended here explicitly
# with Python's zipfile module (no `zip` CLI available on this Windows/Git Bash setup).
EVIDENCIAS_PDF="$REPO_ROOT/evidencias/Evidencias.pdf"
if [ -f "$EVIDENCIAS_PDF" ]; then
  python3 - "$OUTPUT_PATH" "$EVIDENCIAS_PDF" <<'PYEOF'
import sys, zipfile
zip_path, pdf_path = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(zip_path, "a", zipfile.ZIP_DEFLATED) as zf:
    zf.write(pdf_path, "evidencias/Evidencias.pdf")
print("Included evidencias/Evidencias.pdf")
PYEOF
else
  echo "WARNING: evidencias/Evidencias.pdf not found -- the delivery ZIP will be missing it." >&2
  echo "          Build it from docs/evidencias-guia.md and the screenshots in evidencias/, then re-run this script." >&2
fi

echo "Done: $OUTPUT_NAME"
