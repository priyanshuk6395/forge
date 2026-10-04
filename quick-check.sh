#!/bin/bash
# Forge EC2 One-Line Diagnostic
# Run on EC2: bash -c "$(curl -sSL https://raw.githubusercontent.com/USER/forge/main/quick-check.sh)"

set -euo pipefail

BASE_URL="${FORGE_URL:-http://localhost:80}"
FAILED=0
cookie_file=""
password=""

cleanup() {
  if [ -n "$cookie_file" ]; then rm -f "$cookie_file"; fi
  unset password
}
trap cleanup EXIT

check_http() {
  local label="$1"
  local url="$2"
  local expected="$3"
  local status

  status="$(curl -sS --connect-timeout 5 --max-time 10 -o /dev/null -w '%{http_code}' "$url" || true)"
  if [ "$status" = "$expected" ]; then
    echo "✅ $label: $status"
  else
    echo "❌ $label: expected $expected, got ${status:-no response}"
    FAILED=1
  fi
}

json_escape() {
  local value="$1"
  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  value=${value//$'\n'/\\n}
  value=${value//$'\r'/\\r}
  value=${value//$'\t'/\\t}
  printf '%s' "$value"
}

echo "Forge EC2 Quick Health Check"
echo "============================"
check_http "Health endpoint" "$BASE_URL/api/health" 200
check_http "Auth status" "$BASE_URL/api/auth/status" 200

if systemctl is-active --quiet forge; then
  echo "✅ Forge service: running"
else
  echo "❌ Forge service: not running"
  FAILED=1
fi

username="${FORGE_USERNAME:-}"
if [ -n "${FORGE_PASSWORD:-}" ]; then
  password="$FORGE_PASSWORD"
fi

if [ -z "$username" ] && [ -z "$password" ] && [ -t 0 ]; then
  read -r -p "Forge owner username (blank to skip authenticated checks): " username
  if [ -n "$username" ]; then
    read -r -s -p "Forge owner password: " password
    printf '\n'
  fi
fi

if [ -n "$username" ] && [ -n "$password" ]; then
  cookie_file="$(mktemp)"
  chmod 600 "$cookie_file"
  printf -v login_payload '{"username":"%s","password":"%s"}' \
    "$(json_escape "$username")" "$(json_escape "$password")"
  login_status="$(printf '%s' "$login_payload" | curl -sS --connect-timeout 5 --max-time 10 \
    -o /dev/null -w '%{http_code}' -c "$cookie_file" \
    -H 'Content-Type: application/json' -H 'X-Forge-Client: 1' \
    --data-binary @- "$BASE_URL/api/auth/login" || true)"

  if [ "$login_status" = "200" ]; then
    echo "✅ Owner login: $login_status"
    dashboard_status="$(curl -sS --connect-timeout 5 --max-time 10 -o /dev/null -w '%{http_code}' \
      -b "$cookie_file" -H 'X-Forge-Client: 1' "$BASE_URL/api/dashboard" || true)"
    if [ "$dashboard_status" = "200" ]; then
      echo "✅ Authenticated dashboard: $dashboard_status"
    else
      echo "❌ Authenticated dashboard: expected 200, got ${dashboard_status:-no response}"
      FAILED=1
    fi
  else
    echo "❌ Owner login: expected 200, got ${login_status:-no response}"
    FAILED=1
  fi
else
  echo "[SKIP] Dashboard/session checks: provide Forge owner credentials to test them."
fi

if [ "$FAILED" -ne 0 ]; then
  echo "Run the full diagnostic for more detail:"
  echo "  bash -c \"\$(curl -sSL https://raw.githubusercontent.com/priyanshuk6395/forge/main/diagnose-ec2.sh)\""
fi

exit "$FAILED"