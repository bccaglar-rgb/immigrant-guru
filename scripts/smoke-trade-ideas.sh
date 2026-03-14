#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-18090}"
FRONTEND_HOST="${FRONTEND_HOST:-127.0.0.1}"
FRONTEND_PORT="${FRONTEND_PORT:-4174}"
USER_ID="${USER_ID:-demo-user}"
RUN_BUILD="${RUN_BUILD:-1}"

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
  local delay="${3:-0.4}"
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

echo "== TRADE IDEAS LOCAL SMOKE =="
echo "Backend:  ${BASE_URL}"
echo "Frontend: ${FRONT_URL}"
echo

echo "1) Starting backend..."
if HOST="$BACKEND_HOST" PORT="$BACKEND_PORT" npm run server:dev >/tmp/bitrium-ti-backend.log 2>&1 &
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

echo "2) Health endpoint..."
if HEALTH_JSON="$(curl -sS "${BASE_URL}/api/health" 2>/dev/null)" && json_has_ok_true "$HEALTH_JSON"; then
  add_pass "GET /api/health ok=true"
else
  add_fail "GET /api/health failed"
fi

echo "3) Create idea + lock checks..."
SYMBOL="SMOKE$((RANDOM % 900000 + 100000))USDT"
TIMES="$(node -e 'const now=new Date();const until=new Date(Date.now()+90*60000);process.stdout.write(JSON.stringify({now:now.toISOString(),until:until.toISOString()}));')"
NOW_UTC="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(x.now);' "$TIMES")"
UNTIL_UTC="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(x.until);' "$TIMES")"

PAYLOAD="$(cat <<EOF
{
  "symbol": "${SYMBOL}",
  "direction": "LONG",
  "confidence": 0.82,
  "scoring_mode": "NORMAL",
  "entry_low": 99.10,
  "entry_high": 99.50,
  "sl_levels": [98.80, 98.40],
  "tp_levels": [100.10, 100.60],
  "horizon": "INTRADAY",
  "timeframe": "15m",
  "setup": "Smoke Test Setup",
  "trade_validity": "VALID",
  "entry_window": "OPEN",
  "slippage_risk": "MED",
  "triggers_to_activate": ["Entry window OPEN"],
  "invalidation": "Invalid on 15m close below entry range.",
  "timestamp_utc": "${NOW_UTC}",
  "valid_until_bars": 6,
  "valid_until_utc": "${UNTIL_UTC}",
  "market_state": {
    "trend": "Up",
    "htfBias": "Bullish",
    "volatility": "Normal",
    "execution": "Good liquidity"
  },
  "flow_analysis": ["Smoke flow 1", "Smoke flow 2"],
  "trade_intent": ["Smoke intent"],
  "raw_text": "SMOKE PAYLOAD"
}
EOF
)"

CREATE_STATUS="$(curl -sS -o /tmp/bitrium-ti-create.json -w "%{http_code}" -X POST "${BASE_URL}/api/trade-ideas" \
  -H "Content-Type: application/json" -H "x-user-id: ${USER_ID}" -d "$PAYLOAD" 2>/dev/null || true)"
CREATE_BODY="$(cat /tmp/bitrium-ti-create.json 2>/dev/null || true)"

IDEA_ID=""
if [[ "$CREATE_STATUS" == "200" ]] && json_has_ok_true "$CREATE_BODY"; then
  IDEA_ID="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(String(x?.idea?.id ?? ""));' "$CREATE_BODY" 2>/dev/null || true)"
  if [[ -n "$IDEA_ID" ]]; then
    add_pass "POST /api/trade-ideas created idea (${SYMBOL})"
  else
    add_fail "POST /api/trade-ideas ok but idea id missing"
  fi
else
  add_fail "POST /api/trade-ideas failed (HTTP ${CREATE_STATUS})"
fi

LOCK_STATUS="$(curl -sS -o /tmp/bitrium-ti-lock.json -w "%{http_code}" -X POST "${BASE_URL}/api/trade-ideas" \
  -H "Content-Type: application/json" -H "x-user-id: ${USER_ID}" -d "$PAYLOAD" 2>/dev/null || true)"
LOCK_BODY="$(cat /tmp/bitrium-ti-lock.json 2>/dev/null || true)"
if [[ "$LOCK_STATUS" == "409" ]] && node -e 'const x=JSON.parse(process.argv[1]); if(x?.reason!=="SYMBOL_LOCKED") process.exit(1);' "$LOCK_BODY" >/dev/null 2>&1; then
  add_pass "Symbol lock works (second create blocked)"
else
  add_fail "Symbol lock check failed (HTTP ${LOCK_STATUS})"
fi

if LOCKS_JSON="$(curl -sS "${BASE_URL}/api/trade-ideas/locks" -H "x-user-id: ${USER_ID}" 2>/dev/null)" && json_has_ok_true "$LOCKS_JSON" \
  && node -e 'const x=JSON.parse(process.argv[1]); const s=process.argv[2]; if(!Array.isArray(x.items)||!x.items.some(i=>String(i.symbol).toUpperCase()===s)) process.exit(1);' "$LOCKS_JSON" "$SYMBOL" >/dev/null 2>&1; then
  add_pass "GET /api/trade-ideas/locks contains created symbol"
else
  add_fail "GET /api/trade-ideas/locks missing created symbol"
fi

if IDEAS_JSON="$(curl -sS "${BASE_URL}/api/trade-ideas?limit=50&scoring_mode=NORMAL" -H "x-user-id: ${USER_ID}" 2>/dev/null)" && json_has_ok_true "$IDEAS_JSON" \
  && node -e 'const x=JSON.parse(process.argv[1]); const s=process.argv[2]; if(!Array.isArray(x.items)||!x.items.some(i=>String(i.symbol).toUpperCase()===s)) process.exit(1);' "$IDEAS_JSON" "$SYMBOL" >/dev/null 2>&1; then
  add_pass "GET /api/trade-ideas list includes created symbol"
else
  add_fail "GET /api/trade-ideas list check failed"
fi

if [[ -n "$IDEA_ID" ]]; then
  if IDEA_JSON="$(curl -sS "${BASE_URL}/api/trade-ideas/${IDEA_ID}" -H "x-user-id: ${USER_ID}" 2>/dev/null)" && json_has_ok_true "$IDEA_JSON"; then
    add_pass "GET /api/trade-ideas/:id works"
  else
    add_fail "GET /api/trade-ideas/:id failed"
  fi

  if EVENTS_JSON="$(curl -sS "${BASE_URL}/api/trade-ideas/${IDEA_ID}/events" -H "x-user-id: ${USER_ID}" 2>/dev/null)" && json_has_ok_true "$EVENTS_JSON" \
    && node -e 'const x=JSON.parse(process.argv[1]); if(!Array.isArray(x.events)||!x.events.some(e=>e.event_type==="IDEA_CREATED")) process.exit(1);' "$EVENTS_JSON" >/dev/null 2>&1; then
    add_pass "GET /api/trade-ideas/:id/events contains IDEA_CREATED"
  else
    add_fail "GET /api/trade-ideas/:id/events failed"
  fi
fi

echo "4) Frontend /trade-ideas route..."
if [[ "$RUN_BUILD" == "1" || ! -f "dist/index.html" ]]; then
  if npm run build >/tmp/bitrium-ti-build.log 2>&1; then
    add_pass "Frontend build passed"
  else
    add_fail "Frontend build failed"
  fi
fi

if npm run preview -- --host "$FRONTEND_HOST" --port "$FRONTEND_PORT" >/tmp/bitrium-ti-preview.log 2>&1 &
then
  FRONTEND_PID=$!
  if wait_for_http_ok "${FRONT_URL}/trade-ideas" 50 0.4; then
    FRONT_STATUS="$(curl -sS -o /dev/null -w "%{http_code}" "${FRONT_URL}/trade-ideas" 2>/dev/null || true)"
    if [[ "$FRONT_STATUS" =~ ^2[0-9][0-9]$ || "$FRONT_STATUS" =~ ^3[0-9][0-9]$ ]]; then
      add_pass "Frontend /trade-ideas page reachable"
    else
      add_fail "Frontend /trade-ideas returned HTTP ${FRONT_STATUS}"
    fi
  else
    add_fail "Frontend /trade-ideas not reachable"
  fi
else
  add_fail "Failed to launch frontend preview process"
fi

echo
echo "== TRADE IDEAS SMOKE REPORT =="
for line in "${REPORT_LINES[@]}"; do
  echo "$line"
done
echo "SUMMARY  pass=${PASS_COUNT} fail=${FAIL_COUNT}"

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  echo
  echo "Backend log: /tmp/bitrium-ti-backend.log"
  echo "Build log:   /tmp/bitrium-ti-build.log"
  echo "Preview log: /tmp/bitrium-ti-preview.log"
  exit 1
fi

exit 0
