#!/bin/bash
# Forge server bootstrap. Idempotent by design — safe to run more than once,
# which matters because it runs automatically both when Forge provisions a
# brand-new EC2 instance (as raw UserData) and again if you ever re-sync an
# existing connected server.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

log() { echo "[forge-bootstrap] $*"; }

log "Updating package index..."
sudo apt-get update -y

log "Installing base packages..."
sudo apt-get install -y --no-install-recommends \
  ca-certificates curl gnupg git ufw unattended-upgrades

# --- Docker: official convenience script tracks the current stable release
if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker..."
  curl -fsSL https://get.docker.com | sudo sh
else
  log "Docker already present, skipping install."
fi

TARGET_USER="${SUDO_USER:-${USER:-ubuntu}}"
if id "$TARGET_USER" >/dev/null 2>&1; then
  sudo usermod -aG docker "$TARGET_USER" || true
fi
sudo systemctl enable --now docker

# --- Firewall: deny-by-default, explicit allowlist (PRD 9.16 / 9.17)
sudo ufw allow OpenSSH >/dev/null 2>&1 || true
sudo ufw allow 80/tcp >/dev/null 2>&1 || true
sudo ufw allow 443/tcp >/dev/null 2>&1 || true
sudo ufw default deny incoming >/dev/null 2>&1 || true
sudo ufw default allow outgoing >/dev/null 2>&1 || true
yes | sudo ufw enable >/dev/null 2>&1 || true

# --- Automatic security patches (PRD 9.19)
sudo systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true

# --- SSH hardening: key-only access. Safe because Forge only ever connects
# using a key that is already in authorized_keys by the time this runs.
SSHD_CONFIG=/etc/ssh/sshd_config
if [ -f "$SSHD_CONFIG" ]; then
  sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' "$SSHD_CONFIG"
  sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' "$SSHD_CONFIG"
  sudo systemctl reload ssh 2>/dev/null || sudo systemctl reload sshd 2>/dev/null || true
fi

# --- Basic security scanning tools (PRD 9.11 / 9.15 / 9.20 "MVP: basic
# vulnerability scanning"). Both are single static binaries, official
# install scripts, no package-manager surface added.
if ! command -v trivy >/dev/null 2>&1; then
  log "Installing Trivy (container image vulnerability scanner)..."
  curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh \
    | sudo sh -s -- -b /usr/local/bin v0.54.1 || log "Trivy install failed, continuing without it."
fi
if ! command -v gitleaks >/dev/null 2>&1; then
  log "Installing Gitleaks (committed-secret scanner)..."
  GITLEAKS_VERSION="8.18.4"
  curl -sfL "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" \
    -o /tmp/gitleaks.tar.gz \
    && sudo tar -xzf /tmp/gitleaks.tar.gz -C /usr/local/bin gitleaks \
    && rm -f /tmp/gitleaks.tar.gz \
    || log "Gitleaks install failed, continuing without it."
fi

# --- Workspace Forge deploys into
sudo mkdir -p /opt/forge-apps
sudo chown "$TARGET_USER":"$TARGET_USER" /opt/forge-apps 2>/dev/null || sudo chmod 777 /opt/forge-apps

log "Bootstrap complete."
echo "FORGE_BOOTSTRAP_OK"
