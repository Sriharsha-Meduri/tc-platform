#!/bin/bash
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_NAME="$(basename "$PROJECT_DIR")"
OUTPUT="$PROJECT_DIR/../${PROJECT_NAME}.tar.gz"

echo "Cleaning build artifacts..."

find "$PROJECT_DIR" -name "node_modules" -type d -prune -exec rm -rf {} + 2>/dev/null || true
find "$PROJECT_DIR" -name ".next" -type d -prune -exec rm -rf {} + 2>/dev/null || true
find "$PROJECT_DIR" -name "dist" -type d -prune -exec rm -rf {} + 2>/dev/null || true
find "$PROJECT_DIR" -name ".expo" -type d -prune -exec rm -rf {} + 2>/dev/null || true
find "$PROJECT_DIR" -name ".turbo" -type d -prune -exec rm -rf {} + 2>/dev/null || true

echo "Creating archive at $OUTPUT ..."

tar -czf "$OUTPUT" \
  --exclude="./.git" \
  --exclude="./.DS_Store" \
  -C "$PROJECT_DIR" .

echo "Done! Archive size: $(du -sh "$OUTPUT" | cut -f1)"
echo "Output: $OUTPUT"
