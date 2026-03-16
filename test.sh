#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
FAILED=0

echo "========================================"
echo "  Prengine Test Suite"
echo "========================================"
echo ""

# --- Frontend Tests (Vitest) ---
echo "--- Frontend Tests (Vitest) ---"
echo ""
cd "$ROOT_DIR/frontend"
if npx vitest run 2>&1; then
  echo ""
  echo "Frontend tests: PASSED"
else
  echo ""
  echo "Frontend tests: FAILED"
  FAILED=1
fi

echo ""
echo "--- Worker Tests (Minitest) ---"
echo ""
cd "$ROOT_DIR/worker"
if bundle exec rake test 2>&1; then
  echo ""
  echo "Worker tests: PASSED"
else
  echo ""
  echo "Worker tests: FAILED"
  FAILED=1
fi

echo ""
echo "========================================"
if [ $FAILED -eq 0 ]; then
  echo "  All tests PASSED"
else
  echo "  Some tests FAILED"
fi
echo "========================================"

exit $FAILED
