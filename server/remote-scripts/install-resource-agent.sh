#!/usr/bin/env bash
set -euo pipefail

SERVICE_USER=${1:-}
SERVER_NAME=${2:-}

if ! [[ "$SERVICE_USER" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]]; then
  echo 'Invalid service user.' >&2
  exit 2
fi
if ! [[ "$SERVER_NAME" =~ ^[A-Za-z0-9.-]{1,255}$ ]]; then
  echo 'Invalid telemetry host.' >&2
  exit 2
fi
if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  echo 'The SSH user does not exist on this host.' >&2
  exit 2
fi
if [ "$(id -u)" -ne 0 ]; then
  exec sudo -n bash "$0" "$SERVICE_USER" "$SERVER_NAME"
fi

AGENT_USER=forge-agent
if ! id "$AGENT_USER" >/dev/null 2>&1; then
  useradd --system --user-group --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin "$AGENT_USER"
fi

install -o root -g root -m 0755 /tmp/forge-resource-agent.sh /usr/local/sbin/forge-resource-agent
install -d -o "$AGENT_USER" -g "$AGENT_USER" -m 0750 /var/lib/forge-resource-agent

cat > /etc/systemd/system/forge-resource-agent.service <<EOF
[Unit]
Description=Forge read-only host resource sampler
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=$AGENT_USER
Group=$AGENT_USER
Environment=FORGE_TELEMETRY_SERVER_NAME=$SERVER_NAME
ExecStart=/usr/local/sbin/forge-resource-agent
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/forge-resource-agent
EOF

cat > /etc/systemd/system/forge-resource-agent.timer <<'EOF'
[Unit]
Description=Collect Forge host telemetry every minute

[Timer]
OnBootSec=10s
OnUnitActiveSec=60s
AccuracySec=5s
Persistent=true
Unit=forge-resource-agent.service

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now forge-resource-agent.timer
systemctl start forge-resource-agent.service
echo 'FORGE_AGENT_INSTALLED=ready'