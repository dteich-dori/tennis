#!/bin/bash
# Creates a timestamped SQLite backup of the Turso database
# Usage: npm run db:backup

set -e

BACKUP_DIR="Backup"
TIMESTAMP=$(date +"%Y-%m-%d_%H%M%S")
VERSION=$(grep 'APP_VERSION' src/lib/version.ts 2>/dev/null | sed 's/.*"\(.*\)".*/\1/' || echo "unknown")
BACKUP_FILE="${BACKUP_DIR}/v${VERSION}_${TIMESTAMP}.sqlite"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Export Turso database to local SQLite file
export PATH="$HOME/.turso:$PATH"
turso db shell tennis-scheduler .dump | sqlite3 "$BACKUP_FILE"

# Show result
SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "Backup saved: $BACKUP_FILE ($SIZE)"
echo ""

# List recent backups
echo "Recent backups:"
ls -1t "$BACKUP_DIR"/*.sqlite 2>/dev/null | head -5
