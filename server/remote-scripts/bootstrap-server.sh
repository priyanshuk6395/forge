#!/bin/bash
# Forge server bootstrap. Idempotent by design — safe to run more than once,
# which matters because it runs automatically both when Forge provisions a
# brand-new EC2 instance (as raw UserData) and again if you ever re-sync an
# existing connected server.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

log() { echo "[forge-bootstrap] $*"; }

run_privileged() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    command sudo "$@"
  fi
}

sudo() { run_privileged "$@"; }

if [ -r /etc/os-release ]; then . /etc/os-release; else ID=unknown; ID_LIKE=; fi

check_requirements() {
  if [ -r /etc/os-release ]; then . /etc/os-release; else ID=unknown; ID_LIKE=; fi
  printf 'FORGE_CHECK_CHECKED_AT=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'FORGE_CHECK_PLATFORM=%s\n' "${ID:-unknown}"
  printf 'FORGE_CHECK_PLATFORM_LIKE=%s\n' "${ID_LIKE:-}"
  if [ "$(id -u)" -eq 0 ] || (command -v sudo >/dev/null 2>&1 && command sudo -n true >/dev/null 2>&1); then
    printf 'FORGE_CHECK_PRIVILEGE=ready\n'
  else
    printf 'FORGE_CHECK_PRIVILEGE=missing\n'
  fi
  if command -v apt-get >/dev/null 2>&1; then printf 'FORGE_CHECK_APT_GET=ready\n'; else printf 'FORGE_CHECK_APT_GET=missing\n'; fi
  if command -v systemctl >/dev/null 2>&1; then printf 'FORGE_CHECK_SYSTEMD=ready\n'; else printf 'FORGE_CHECK_SYSTEMD=missing\n'; fi
  if command -v docker >/dev/null 2>&1; then
    printf 'FORGE_CHECK_DOCKER=ready\n'
    if docker info >/dev/null 2>&1 || { [ "$(id -u)" -eq 0 ] || command sudo -n true >/dev/null 2>&1; } && sudo docker info >/dev/null 2>&1; then
      printf 'FORGE_CHECK_DOCKER_DAEMON=ready\n'
    else
      printf 'FORGE_CHECK_DOCKER_DAEMON=missing\n'
    fi
  else
    printf 'FORGE_CHECK_DOCKER=missing\nFORGE_CHECK_DOCKER_DAEMON=missing\n'
  fi
  if command -v git >/dev/null 2>&1; then printf 'FORGE_CHECK_GIT=ready\n'; else printf 'FORGE_CHECK_GIT=missing\n'; fi
  if command -v curl >/dev/null 2>&1; then printf 'FORGE_CHECK_CURL=ready\n'; else printf 'FORGE_CHECK_CURL=missing\n'; fi
}

PRE_INIT_REPORT="$(check_requirements)"
log "Pre-initialization requirements:"
printf '%s\n' "$PRE_INIT_REPORT"

case "${ID:-unknown} ${ID_LIKE:-}" in
  *ubuntu*|*debian*) ;;
  *) log "Unsupported Linux distribution; use Debian or Ubuntu."; exit 1 ;;
esac
if ! command -v apt-get >/dev/null 2>&1; then log "APT is required to initialize this host."; exit 1; fi
if ! command -v systemctl >/dev/null 2>&1; then log "systemd is required to initialize this host."; exit 1; fi
if [ "$(id -u)" -ne 0 ] && ! command sudo -n true >/dev/null 2>&1; then
  log "Root or passwordless sudo is required to initialize this host."
  exit 1
fi

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

TARGET_USER="${FORGE_SSH_USER:-${SUDO_USER:-${USER:-ubuntu}}}"
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

# --- SSH hardening: key-only access when Forge connected using a key.
SSHD_CONFIG=/etc/ssh/sshd_config
if [ "${FORGE_SSH_PASSWORD_AUTH:-false}" = "true" ]; then
  log "Keeping password SSH authentication enabled for this password-based connection."
elif [ -f "$SSHD_CONFIG" ]; then
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
printf '%s\n' "$PRE_INIT_REPORT" | sudo tee /opt/forge-apps/.forge-pre-init-checks >/dev/null
sudo chmod 0644 /opt/forge-apps/.forge-pre-init-checks

POST_INIT_MISSING=()
for command_name in docker git curl; do
  if ! command -v "$command_name" >/dev/null 2>&1; then POST_INIT_MISSING+=("$command_name"); fi
done
if ! sudo systemctl is-active --quiet docker || ! sudo docker info >/dev/null 2>&1; then POST_INIT_MISSING+=("Docker daemon"); fi
if [ "${#POST_INIT_MISSING[@]}" -gt 0 ]; then
  log "Post-initialization check failed. Missing: ${POST_INIT_MISSING[*]}"
  exit 1
fi

log "Bootstrap complete."
echo "FORGE_BOOTSTRAP_OK"
