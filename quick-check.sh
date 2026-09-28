#!/bin/bash
# Forge EC2 One-Line Diagnostic
# Run on EC2: bash -c "$(curl -sSL https://raw.githubusercontent.com/USER/forge/main/quick-check.sh)"

set -euo pipefail

echo "🔍 Forge EC2 Quick Health Check"
echo "================================"

echo -n "Health endpoint: "
curl -s -o /dev/null -w "%{http_code}" http://localhost:80/api/health | grep -q "200" && echo "✅ 200 OK" || echo "❌ FAILED"

echo -n "Auth status: "
curl -s -o /dev/null -w "%{http_code}" http://localhost:80/api/auth/status | grep -q "200" && echo "✅ 200 OK" || echo "❌ FAILED"

echo -n "Dashboard: "
curl -s -o /dev/null -w "%{http_code}" http://localhost:80/api/dashboard | grep -q "200" && echo "✅ 200 OK" || echo "❌ FAILED"

echo -n "Forge service: "
systemctl is-active --quiet forge && echo "✅ Running" || echo "❌ Not running"

cookie=$(curl -s -c /tmp/test_cookie.txt -b /tmp/test_cookie.txt -X POST http://localhost:80/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"password123"}' 2>/dev/null | grep -o 'forge_sid=[^;]*' || true)

if [ -n "$cookie" ]; then
    echo "✅ Cookie auth working"
else
    echo "❌ Cookie auth failed"
fi

echo ""
echo "If any checks fail, run full diagnostic:"
echo "  bash -c \"\$(curl -sSL https://raw.githubusercontent.com/priyanshuk6395/forge/main/diagnose-ec2.sh)\""