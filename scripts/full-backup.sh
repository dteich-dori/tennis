#!/bin/bash
# Creates a self-contained ZIP backup of the entire Tennis Scheduler app + database
# Usage: bash scripts/full-backup.sh

set -e

BACKUP_DIR="Backup"
VERSION=$(grep 'APP_VERSION' src/lib/version.ts 2>/dev/null | sed 's/.*"\(.*\)".*/\1/' || echo "unknown")
TIMESTAMP=$(date +"%Y-%m-%d_%H%M%S")
ZIP_NAME="TennisScheduler_v${VERSION}_${TIMESTAMP}.zip"
ZIP_PATH="${BACKUP_DIR}/${ZIP_NAME}"
TEMP_DIR=$(mktemp -d)

echo "=== Tennis Scheduler Full Backup ==="
echo "Version: ${VERSION}"
echo ""

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# 1. Export database
echo "1. Exporting Turso database..."
export PATH="$HOME/.turso:$PATH"
DB_FILE="${TEMP_DIR}/database.sqlite"
turso db shell tennis-scheduler .dump | sqlite3 "$DB_FILE"
DB_SIZE=$(du -h "$DB_FILE" | cut -f1)
echo "   Database: $DB_SIZE"

# 2. Create env template
echo "2. Creating .env template..."
cat > "${TEMP_DIR}/env.template" << 'ENVEOF'
# Tennis Scheduler Environment Configuration
# Copy this file to .env.local and fill in your values

# Turso Database
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-auth-token

# Authentication (optional)
AUTH_PASSWORD=your-password
ENVEOF

# 3. Create install instructions
echo "3. Creating install instructions..."
cat > "${TEMP_DIR}/INSTALL.md" << 'INSTALLEOF'
# Tennis Scheduler — Installation Guide

## Prerequisites
- Node.js 18+ (https://nodejs.org)
- npm (comes with Node.js)
- Turso CLI (optional, for database management): https://turso.tech

## Quick Start

1. Extract this ZIP to a folder
2. Open a terminal in that folder
3. Install dependencies:
   ```
   npm install
   ```
4. Set up your database:
   - Option A (Use existing Turso database): Copy `env.template` to `.env.local` and fill in your Turso credentials
   - Option B (Restore from backup): Create a new Turso database and import `database.sqlite`:
     ```
     turso db create tennis-scheduler
     turso db shell tennis-scheduler < database.sqlite
     ```
     Then copy `env.template` to `.env.local` with the new database URL and token
5. Start the development server:
   ```
   npm run dev
   ```
6. Open http://localhost:3000

## Production Deployment (Vercel)

1. Push the code to a GitHub repository
2. Connect the repo to Vercel (https://vercel.com)
3. Add environment variables in Vercel dashboard:
   - TURSO_DATABASE_URL
   - TURSO_AUTH_TOKEN
   - AUTH_PASSWORD
4. Deploy

## Backup & Restore

- Database backup: `bash scripts/backup.sh`
- Full backup (code + DB): `bash scripts/full-backup.sh`
- Version bump: `bash scripts/bump-version.sh`

## Tech Stack
- Next.js 16 (React)
- Turso (SQLite cloud database)
- Drizzle ORM
- jsPDF (report generation)
- Tailwind CSS
INSTALLEOF

# 4. Create the ZIP
echo "4. Creating ZIP archive..."

# Create ZIP with git archive (includes all tracked files) + extras
git archive --format=zip HEAD -o "${TEMP_DIR}/code.zip"

# Build final ZIP: unpack code.zip, add extras, repack
PROJECT_DIR="$(pwd)"
FINAL_DIR="${TEMP_DIR}/TennisScheduler"
mkdir -p "$FINAL_DIR"
(cd "$FINAL_DIR" && unzip -q "${TEMP_DIR}/code.zip")
cp "$DB_FILE" "${FINAL_DIR}/database.sqlite"
cp "${TEMP_DIR}/env.template" "${FINAL_DIR}/"
cp "${TEMP_DIR}/INSTALL.md" "${FINAL_DIR}/"
(cd "${TEMP_DIR}" && zip -r -q "${PROJECT_DIR}/${ZIP_PATH}" "TennisScheduler")

# Cleanup
rm -rf "$TEMP_DIR"

# Show result
ZIP_SIZE=$(du -h "$ZIP_PATH" | cut -f1)
echo ""
echo "=== Backup Complete ==="
echo "File: $ZIP_PATH ($ZIP_SIZE)"
echo "Contains: source code, database, env template, install guide"
echo ""
echo "Recent full backups:"
ls -1t "$BACKUP_DIR"/TennisScheduler_*.zip 2>/dev/null | head -5
