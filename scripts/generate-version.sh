#!/bin/bash
# Generate version.json in the build output directory
# Called during the build step

SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
DICT_HASH=$(find public/dict -type f -exec md5sum {} \; 2>/dev/null | sort | md5sum | cut -d' ' -f1 2>/dev/null || echo "unknown")

# Output to dist/ (post-build) or public/ (pre-build for dev)
OUTPUT_DIR="${1:-dist}"
mkdir -p "$OUTPUT_DIR"

cat > "$OUTPUT_DIR/version.json" <<EOF
{
  "sha": "$SHA",
  "buildTime": "$BUILD_TIME",
  "dictHash": "$DICT_HASH"
}
EOF

echo "Generated $OUTPUT_DIR/version.json: sha=$SHA buildTime=$BUILD_TIME"
