#!/bin/bash
# ChurchTools Test Runner
# Usage: ./run-tests.sh [FILTER]
# Examples:
#   ./run-tests.sh              # Run all tests
#   ./run-tests.sh TestVendors   # Run only vendors tests
#   ./run-tests.sh test_health   # Run only health checks

set -e

export PATH="$PATH:$HOME/.local/bin"

if ! command -v pytest &> /dev/null; then
    echo "❌ pytest not found. Install with: pipx install pytest httpx"
    exit 1
fi

FILTER="${1:-.}"
cd "$(dirname "$0")"

echo "🧪 Running tests matching: $FILTER"
pytest tests/ -v -k "$FILTER" --tb=short

echo ""
echo "✅ Tests completed!"
