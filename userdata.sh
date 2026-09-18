#!/bin/bash
# ============================================================================
# Forge control-plane bootstrap.
#
# Paste this whole file into the EC2 "User data" field when launching an
# instance (Advanced details → User data), after editing REPO_URL below to
# point at YOUR public GitHub fork/copy of this repo. On first boot the
# instance will:
#   1. install Node.js + git
#   2. clone your Forge repo into /opt/forge
#   3. generate this machine's own encryption/session secrets
#   4. install a systemd service so Forge starts on boot and restarts if it
#      ever crashes
#   5. start Forge on port 80, so visiting the instance's public IP in a
#      browser takes you straight to the setup wizard — no SSH required.
#
# Idempotent: re-running it (e.g. by SSHing in and running
# `sudo bash /opt/forge/userdata.sh`) pulls the latest commit on REPO_BRANCH
# and restarts the service, which is the easiest way to update Forge later.
# ============================================================================
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

# ---- EDIT THIS ----
REPO_URL="https://github.com/YOUR_GITHUB_USERNAME/forge.git"
REPO_BRANCH="main"
# -------------------

APP_DIR="/opt/forge"
SERVICE_USER="ubuntu"

log() { echo "[forge-userdata] $*"; }

if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  SERVICE_USER="$(logname 2>/dev/null || echo root)"
fi

log "Updating package index..."
sudo apt-get update -y

log "Installing git, curl..."
sudo apt-get install -y --no-install-recommends ca-certificates curl git

if ! command -v node >/dev/null 2>&1; then
  log "Installing Node.js 20.x..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  log "Node.js already installed ($(node --version)), skipping."
fi

if [ -d "$APP_DIR/.git" ]; then
  log "Forge already present — pulling latest ${REPO_BRANCH}..."
  cd "$APP_DIR"
  sudo -u "$SERVICE_USER" git fetch origin "$REPO_BRANCH"
  sudo -u "$SERVICE_USER" git checkout "$REPO_BRANCH"
  sudo -u "$SERVICE_USER" git reset --hard "origin/${REPO_BRANCH}"
else
  log "Cloning ${REPO_URL}..."
  sudo mkdir -p "$APP_DIR"
  sudo chown "$SERVICE_USER":"$SERVICE_USER" "$APP_DIR"
  sudo -u "$SERVICE_USER" git clone --branch "$REPO_BRANCH" "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"
log "Installing dependencies..."
if [ -f package-lock.json ]; then
  sudo -u "$SERVICE_USER" npm ci --omit=dev
else
  sudo -u "$SERVICE_USER" npm install --omit=dev
fi

log "Generating this machine's secrets (.env)..."
sudo -u "$SERVICE_USER" npm run setup

# Let Node bind port 80 without running the whole app as root.
NODE_BIN="$(readlink -f "$(command -v node)")"
sudo setcap 'cap_net_bind_service=+ep' "$NODE_BIN"

log "Installing systemd service..."
sudo tee /etc/systemd/system/forge.service >/dev/null <<EOF
[Unit]
Description=Forge
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${APP_DIR}
ExecStart=${NODE_BIN} server/index.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable forge
sudo systemctl restart forge

# ---- Print the URL so it's visible in the EC2 console output / cloud-init log ----
TOKEN="$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" || true)"
PUBLIC_IP="$(curl -s -H "X-aws-ec2-metadata-token: ${TOKEN}" http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || true)"

{
  echo "Forge is starting up."
  echo "Open http://${PUBLIC_IP:-<this-instance-public-ip>}/ in a browser to finish setup."
} | sudo -u "$SERVICE_USER" tee "/home/${SERVICE_USER}/forge-info.txt" >/dev/null

log "Done. Visit http://${PUBLIC_IP:-<this-instance-public-ip>}/ to finish setup."
