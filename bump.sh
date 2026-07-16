#!/bin/bash
# ============================================================
# bump.sh - Centralized Cache Busting for Alliance Hub
# Usage: ./bump.sh [new_version]
# If no version provided, auto-increments current version +1
# ============================================================

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
VERSION_FILE="$PROJECT_DIR/VERSION"

# Read current version
if [ ! -f "$VERSION_FILE" ]; then
    echo "Error: VERSION file not found at $VERSION_FILE"
    exit 1
fi

CURRENT_VERSION=$(cat "$VERSION_FILE" | tr -d '[:space:]')
echo "Current version: $CURRENT_VERSION"

# Determine new version
if [ -n "$1" ]; then
    NEW_VERSION="$1"
else
    NEW_VERSION=$((CURRENT_VERSION + 1))
fi

echo "New version: $NEW_VERSION"

# Update VERSION file
echo "$NEW_VERSION" > "$VERSION_FILE"
echo "Updated VERSION file"

# Count replacements
HTML_COUNT=0
JS_COUNT=0

# Replace ?v=XX in all HTML files (scripts, stylesheets, images)
for file in $(find "$PROJECT_DIR" -name "*.html" -type f); do
    if grep -q "\?v=$CURRENT_VERSION" "$file" 2>/dev/null; then
        sed -i "s/?v=$CURRENT_VERSION/?v=$NEW_VERSION/g" "$file"
        HTML_COUNT=$((HTML_COUNT + 1))
    fi
    # Also catch cases where version might be one behind (safety net)
    for old_v in $(seq $((CURRENT_VERSION - 5)) $CURRENT_VERSION); do
        if [ "$old_v" != "$NEW_VERSION" ] && grep -q "\?v=$old_v" "$file" 2>/dev/null; then
            sed -i "s/?v=$old_v/?v=$NEW_VERSION/g" "$file"
            HTML_COUNT=$((HTML_COUNT + 1))
        fi
    done
done

# Replace version in JS files (version comments)
for file in $(find "$PROJECT_DIR/assets/js" -name "*.js" -type f 2>/dev/null); do
    if grep -q "v$CURRENT_VERSION" "$file" 2>/dev/null; then
        sed -i "s/v$CURRENT_VERSION/v$NEW_VERSION/g" "$file"
        JS_COUNT=$((JS_COUNT + 1))
    fi
done

echo ""
echo "=== Summary ==="
echo "HTML files updated: $HTML_COUNT"
echo "JS files updated: $JS_COUNT"
echo "Version: $CURRENT_VERSION -> $NEW_VERSION"
echo ""
echo "Next steps:"
echo "  1. Test locally"
echo "  2. Commit: git add -A && git commit -m 'chore: bump cache version to v$NEW_VERSION'"
echo "  3. Push: git push"
echo ""
