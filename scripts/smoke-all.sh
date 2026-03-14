#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-18090}"
FRONTEND_HOST="${FRONTEND_HOST:-127.0.0.1}"
FRONTEND_PORT="${FRONTEND_PORT:-4174}"
BASE_URL="http://${BACKEND_HOST}:${BACKEND_PORT}"
FRONT_URL="http://${FRONTEND_HOST}:${FRONTEND_PORT}"

BACKEND_PID=""
FRONTEND_PID=""

PASS_COUNT=0
FAIL_COUNT=0
REPORT_LINES=()

add_pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  REPORT_LINES+=("PASS  $1")
}

add_fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  REPORT_LINES+=("FAIL  $1")
}

cleanup() {
  if [[ -n "${FRONTEND_PID}" ]] && kill -0 "${FRONTEND_PID}" 2>/dev/null; then
    kill "${FRONTEND_PID}" >/dev/null 2>&1 || true
    wait "${FRONTEND_PID}" 2>/dev/null || true
  fi
  if [[ -n "${BACKEND_PID}" ]] && kill -0 "${BACKEND_PID}" 2>/dev/null; then
    kill "${BACKEND_PID}" >/dev/null 2>&1 || true
    wait "${BACKEND_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

wait_for_http_ok() {
  local url="$1"
  local attempts="${2:-40}"
  local delay="${3:-0.5}"
  for _ in $(seq 1 "$attempts"); do
    if curl -sSf "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$delay"
  done
  return 1
}

json_has_ok_true() {
  local payload="$1"
  node -e 'const x=JSON.parse(process.argv[1]); if(!(x&&x.ok===true)) process.exit(1);' "$payload" >/dev/null 2>&1
}

echo "== BITRIUM SYSTEM SMOKE CHECK =="
echo "Backend:  ${BASE_URL}"
echo "Frontend: ${FRONT_URL}"
echo

echo "1) Starting backend..."
if HOST="$BACKEND_HOST" PORT="$BACKEND_PORT" npm run server:dev >/tmp/bitrium-smoke-backend.log 2>&1 &
then
  BACKEND_PID=$!
  if wait_for_http_ok "${BASE_URL}/api/health" 50 0.4; then
    add_pass "Backend started and /api/health reachable"
  else
    add_fail "Backend failed to start or /api/health unreachable"
  fi
else
  add_fail "Failed to launch backend process"
fi

echo "2) Backend health endpoint..."
if HEALTH_JSON="$(curl -sS "${BASE_URL}/api/health" 2>/dev/null)" && json_has_ok_true "$HEALTH_JSON"; then
  add_pass "GET /api/health returned ok=true"
else
  add_fail "GET /api/health did not return ok=true"
fi

echo "3) Payment + Token Creator endpoint smoke..."
if PLANS_JSON="$(curl -sS "${BASE_URL}/api/payments/plans" 2>/dev/null)" && json_has_ok_true "$PLANS_JSON"; then
  add_pass "GET /api/payments/plans ok=true"
else
  add_fail "GET /api/payments/plans failed"
fi

if TC_CFG_JSON="$(curl -sS "${BASE_URL}/api/token-creator/config" 2>/dev/null)" && json_has_ok_true "$TC_CFG_JSON"; then
  add_pass "GET /api/token-creator/config ok=true"
else
  add_fail "GET /api/token-creator/config failed"
fi

TC_QUOTE_BODY='{"name":"SmokeToken","symbol":"SMK","decimals":18,"initialSupply":1000000,"totalSupply":1000000,"supplyType":"fixed","accessType":"none","transferType":"unstoppable","burnable":false,"mintable":false,"verifiedSource":true,"erc1363":false,"recoverable":false}'
if TC_QUOTE_JSON="$(curl -sS -X POST "${BASE_URL}/api/token-creator/quote" -H "Content-Type: application/json" -d "$TC_QUOTE_BODY" 2>/dev/null)" && json_has_ok_true "$TC_QUOTE_JSON"; then
  add_pass "POST /api/token-creator/quote ok=true"
else
  add_fail "POST /api/token-creator/quote failed"
fi

echo "4) Frontend build..."
if npm run build >/tmp/bitrium-smoke-build.log 2>&1; then
  add_pass "Frontend build passed"
else
  add_fail "Frontend build failed"
fi

echo "5) Frontend preview smoke..."
if npm run preview -- --host "$FRONTEND_HOST" --port "$FRONTEND_PORT" >/tmp/bitrium-smoke-preview.log 2>&1 &
then
  FRONTEND_PID=$!
  if wait_for_http_ok "${FRONT_URL}/" 40 0.4; then
    add_pass "Frontend preview started and index reachable"
    if HTML="$(curl -sS "${FRONT_URL}/" 2>/dev/null)" && grep -qi "<!doctype html>" <<<"$HTML"; then
      add_pass "Frontend preview returned HTML document"
    else
      add_fail "Frontend preview did not return expected HTML"
    fi
  else
    add_fail "Frontend preview not reachable"
  fi
else
  add_fail "Failed to launch frontend preview process"
fi

echo
echo "== SMOKE REPORT =="
for line in "${REPORT_LINES[@]}"; do
  echo "$line"
done
echo "SUMMARY  pass=${PASS_COUNT} fail=${FAIL_COUNT}"

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  echo
  echo "Backend log:  /tmp/bitrium-smoke-backend.log"
  echo "Build log:    /tmp/bitrium-smoke-build.log"
  echo "Preview log:  /tmp/bitrium-smoke-preview.log"
  exit 1
fi

exit 0

