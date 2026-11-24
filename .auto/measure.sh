#!/bin/bash
# Autoresearch benchmark for 旅行马牛.
# Fast pre-checks first, then the conformance harness (the primary metric),
# then the unit test suite as a secondary signal.
set -euo pipefail
cd "$(dirname "$0")/.."

# ---- 0. fast syntax gate (<1s) -------------------------------------------
SYNTAX=0
for f in src/core/*.js src/data/*.js src/render/*.js src/ui/*.js tests/conformance.mjs; do
  [ -e "$f" ] || continue
  if ! node --check "$f" >/dev/null 2>&1; then
    echo "SYNTAX FAIL: $f"
    node --check "$f" 2>&1 | head -5 || true
    SYNTAX=1
  fi
done
echo "METRIC syntax_errors=$SYNTAX"
if [ "$SYNTAX" != "0" ]; then exit 1; fi

# ---- 0.5 build the shipped bundle (also validates build-web.js) ----------
if node scripts/build-web.js >/dev/null 2>&1; then
  echo "METRIC build_ok=1"
else
  echo "METRIC build_ok=0"
fi

# ---- 1. primary: spec conformance ---------------------------------------
node tests/conformance.mjs || echo "conformance harness crashed"

# ---- 2. secondary: unit tests -------------------------------------------
if compgen -G "tests/*.test.js" > /dev/null; then
  TESTS=$(node --test tests/*.test.js 2>&1 || true)
  PASS=$(printf '%s\n' "$TESTS" | sed -n 's/^# pass \([0-9]*\)$/\1/p' | tail -1)
  FAIL=$(printf '%s\n' "$TESTS" | sed -n 's/^# fail \([0-9]*\)$/\1/p' | tail -1)
  echo "METRIC tests_pass=${PASS:-0}"
  echo "METRIC tests_fail=${FAIL:-0}"
else
  echo "METRIC tests_pass=0"
  echo "METRIC tests_fail=0"
fi

# ---- 3. diagnostics -----------------------------------------------------
echo "METRIC src_kb=$(find src -name '*.js' -exec cat {} + 2>/dev/null | wc -c | awk '{printf "%.1f", $1/1024}')"
echo "METRIC core_loc=$(find src/core -name '*.js' -exec cat {} + 2>/dev/null | wc -l | tr -d ' ')"
echo "METRIC data_loc=$(find src/data -name '*.js' -exec cat {} + 2>/dev/null | wc -l | tr -d ' ')"
