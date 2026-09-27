#!/bin/bash
# Forge EC2 Diagnostic Script - Inline Version
# Run directly on EC2: curl -sSL https://raw.githubusercontent.com/USER/forge/main/diagnose-ec2.sh | bash

set -euo pipefail

echo "=========================================="
echo "Forge EC2 Diagnostic Report"
echo "=========================================="
echo "Date: $(date)"
echo "Host: $(hostname)"
echo "IP: $(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo 'N/A')"
echo ""

# 1. System Info
echo "=== System Info ==="
echo "OS: $(lsb_release -d | cut -f2)"
echo "Kernel: $(uname -r)"
echo "Node: $(node --version 2>/dev/null || echo 'Not installed')"
echo "NPM: $(npm --version 2>/dev/null || echo 'Not installed')"
echo "Docker: $(docker --version 2>/dev/null || echo 'Not installed')"
echo ""

# 2. Service Status
echo "=== Service Status ==="
if systemctl is-active --quiet forge; then
    echo "✅ forge.service: ACTIVE"
    systemctl status forge --no-pager | head -20
else
    echo "❌ forge.service: INACTIVE/FAILED"
    systemctl status forge --no-pager | head -30
fi
echo ""

# 3. Port Check
echo "=== Port Status ==="
for port in 22 80 443; do
    if ss -tlnp | grep -q ":$port "; then
        echo "✅ Port $port: LISTENING"
        ss -tlnp | grep ":$port "
    else
        echo "❌ Port $port: NOT LISTENING"
    fi
done
echo ""

# 4. Disk Space
echo "=== Disk Space ==="
df -h /opt/forge /home 2>/dev/null | head -5
echo ""

# 4. Memory
echo "=== Memory ==="
free -h
echo ""

# 5. Forge Directory
echo "=== Forge Directory ==="
if [ -d /opt/forge ]; then
    echo "✅ /opt/forge exists"
    echo "Git status:"
    cd /opt/forge && git status --short 2>/dev/null | head -10
    echo "Last commit: $(cd /opt/forge && git log --oneline -1)"
    echo "Branch: $(cd /opt/forge && git branch --show-current)"
    echo "Remote: $(cd /opt/forge && git remote -v | head -1)"
else
    echo "❌ /opt/forge NOT FOUND"
fi
echo ""

# 6. Config Files
echo "=== Config Files ==="
if [ -f /opt/forge/.env ]; then
    echo "✅ .env exists"
    for var in SESSION_SECRET ENCRYPTION_KEY PORT; do
        if grep -q "^$var=" /opt/forge/.env; then
            echo "  ✅ $var: SET"
        else
            echo "  ❌ $var: MISSING"
        fi
    done
else
    echo "❌ .env MISSING"
fi
echo ""

# 6. Logs
echo "=== Recent Forge Logs ==="
journalctl -u forge -n 30 --no-pager 2>/dev/null || echo "No journalctl access"
echo ""

# 7. API Health Checks
echo "=== API Health Checks ==="
for endpoint in /api/health /api/auth/status /api/dashboard; do
    echo -n "Testing $endpoint... "
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:80$endpoint | grep -q "200"; then
        echo "✅ 200 OK"
    else
        code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:80$endpoint 2>/dev/null || echo "000")
        echo "❌ HTTP $code"
    fi
done
echo ""

# 7. Auth Test
echo "=== Auth Cookie Test ==="
cookie=$(curl -s -c /tmp/cookie.txt -b /tmp/cookie.txt -X POST http://localhost:80/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"password123"}' 2>/dev/null | grep -o 'forge_sid=[^;]*' || true)
if [ -n "$cookie" ]; then
    echo "✅ Login works, cookie set"
    curl -s -b /tmp/cookie.txt http://localhost:80/api/dashboard | head -c 200
else
    echo "❌ Login failed"
    curl -s -X POST http://localhost:80/api/auth/login \
      -H "Content-Type: application/json" \
      -d '{"username":"testuser","password":"password123"}' 2>/dev/null | head -c 200
fi
echo ""

# 8. Auth Debug
echo "=== Auth Debug ==="
curl -s -b /tmp/cookie.txt http://localhost:80/api/auth/debug | jq . 2>/dev/null || curl -s -b /tmp/cookie.txt http://localhost:80/api/auth/debug
echo ""

# 7. GitHub Webhook
echo "=== GitHub Webhook ==="
if curl -s http://localhost:80/webhook/github -X POST -H "X-GitHub-Event: ping" | grep -q "ok\|pong\|success"; then
    echo "✅ Webhook endpoint responds"
else
    echo "⚠️ Webhook may need configuration"
fi
echo ""

# 9. Nginx/Proxy Check
echo "=== Reverse Proxy Check ==="
if systemctl is-active --quiet nginx 2>/dev/null; then
    echo "✅ nginx running"
    nginx -T 2>/dev/null | grep -A5 -B5 "proxy_pass" | head -20
else
    echo "ℹ️ nginx not running (direct Node.js on port 80)"
fi
echo ""

echo "=========================================="
echo "Diagnostic Complete"
echo "=========================================="
echo ""
echo "If issues persist, check:"
echo "  1. GitHub webhook URL in repo settings"
echo "  2. AWS credentials in Settings → AWS"
echo "  3. Server SSH keys in Servers page"
echo "  4. CloudWatch logs for userdata.sh"
echo ""
echo "Logs: journalctl -u forge -f"