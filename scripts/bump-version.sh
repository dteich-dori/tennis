#!/bin/bash
# Bumps the sequence number in src/lib/version.ts
# Usage: scripts/bump-version.sh [--major]

VERSION_FILE="src/lib/version.ts"

# Extract current version
CURRENT=$(grep 'APP_VERSION' "$VERSION_FILE" | sed 's/.*"\(.*\)".*/\1/')
MAJOR=$(echo "$CURRENT" | cut -d. -f1)
SEQ=$(echo "$CURRENT" | cut -d. -f2 | sed 's/^0*//')

if [ "$1" = "--major" ]; then
  MAJOR=$((MAJOR + 1))
  SEQ=1
else
  SEQ=$((SEQ + 1))
fi

NEW_VERSION=$(printf "%d.%03d" "$MAJOR" "$SEQ")

# Write new version
cat > "$VERSION_FILE" << EOF
// Version number: major.sequence
// Bump major (y) for significant feature changes
// Bump sequence (xxx) on each commit/deploy
export const APP_VERSION = "$NEW_VERSION";
EOF

echo "$NEW_VERSION"
