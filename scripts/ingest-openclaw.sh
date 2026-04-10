#!/usr/bin/env bash
# Ingest all OpenClaw markdown docs into Q via Ollama embeddings
# Usage: ./scripts/ingest-openclaw.sh [SECRET_KEY] [BASE_URL]

SECRET_KEY="${1:-sk_test_acme}"
BASE_URL="${2:-http://localhost:3001}"
DOCS_DIR="/Users/nzou/projects/openclaw"

success=0
failed=0
skipped=0

ingest_file() {
  local file="$1"
  # Create a stable docId from the relative path
  local rel="${file#$DOCS_DIR/}"
  local docId="${rel//\//__}"  # replace / with __

  local text
  text=$(cat "$file")
  if [[ -z "$text" ]]; then
    ((skipped++))
    return
  fi

  local response
  response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/ingest/text" \
    -H "Authorization: Bearer $SECRET_KEY" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg id "$docId" --arg text "$text" --arg mime "text/markdown" \
      '{docId: $id, text: $text, mimeType: $mime}')")

  local http_code
  http_code=$(echo "$response" | tail -1)
  local body
  body=$(echo "$response" | sed '$d')

  if [[ "$http_code" == "200" ]]; then
    ((success++))
    echo "✓ [$success] $rel → $(echo "$body" | jq -r '.chunks') chunks"
  else
    ((failed++))
    echo "✗ FAILED [$http_code] $rel: $body" >&2
  fi
}

echo "=== Ingesting OpenClaw docs into Q ==="
echo "Endpoint: $BASE_URL"
echo "Secret:   $SECRET_KEY"
echo ""

# Ingest root-level markdown files
for f in "$DOCS_DIR"/*.md; do
  [[ -f "$f" ]] && ingest_file "$f"
done

# Ingest all docs/**/*.md
while IFS= read -r f; do
  ingest_file "$f"
done < <(find "$DOCS_DIR/docs" -name "*.md" -type f | sort)

echo ""
echo "=== Done: $success ingested, $failed failed, $skipped skipped ==="
