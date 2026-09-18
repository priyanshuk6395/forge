#!/usr/bin/env bash
# ============================================================================
# FORGE - AWS UNIVERSAL LINUX BOOTSTRAP
#
# Supports common AWS Linux distributions:
#   - Ubuntu
#   - Debian
#   - Amazon Linux 2 / 2023
#   - RHEL
#   - Rocky Linux
#   - AlmaLinux
#   - Fedora
#   - SUSE / openSUSE
#
# Properties:
#   - Idempotent
#   - Retry-safe
#   - Network failure tolerant
#   - Package-manager detection
#   - Service-user detection
#   - systemd detection
#   - Safe AWS metadata lookup
#   - Node.js 20 installation
#   - Forge service auto-restart
#   - Detailed logging
# ============================================================================

set -uo pipefail

# ----------------------------------------------------------------------------
# CONFIGURATION
# ----------------------------------------------------------------------------

REPO_URL="https://github.com/YOUR_GITHUB_USERNAME/forge.git"
REPO_BRANCH="main"

APP_DIR="/opt/forge"
APP_PORT="${FORGE_PORT:-3000}"

SERVICE_NAME="forge"
LOG_FILE="/var/log/forge-bootstrap.log"

NODE_MAJOR="20"

# ----------------------------------------------------------------------------
# GLOBAL STATE
# ----------------------------------------------------------------------------

BOOTSTRAP_FAILED=0

# ----------------------------------------------------------------------------
# LOGGING
# ----------------------------------------------------------------------------

mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true
touch "$LOG_FILE" 2>/dev/null || true

log() {
    local msg="$*"
    echo "[forge-userdata] $(date '+%Y-%m-%d %H:%M:%S') $msg" \
        | tee -a "$LOG_FILE" 2>/dev/null || \
        echo "[forge-userdata] $msg"
}

warn() {
    log "WARNING: $*"
}

fail() {
    log "ERROR: $*"
    BOOTSTRAP_FAILED=1
}

run() {
    local description="$1"
    shift

    log "$description"

    if "$@"; then
        return 0
    fi

    fail "Command failed: $*"
    return 1
}

retry() {
    local attempts="$1"
    local delay="$2"
    shift 2

    local i

    for ((i=1; i<=attempts; i++)); do
        if "$@"; then
            return 0
        fi

        warn "Attempt $i/$attempts failed."

        if [ "$i" -lt "$attempts" ]; then
            sleep "$delay"
        fi
    done

    return 1
}

# ----------------------------------------------------------------------------
# ROOT CHECK
# ----------------------------------------------------------------------------

if [ "$(id -u)" -ne 0 ]; then
    echo "This script must run as root."
    exit 1
fi

# ----------------------------------------------------------------------------
# OS DETECTION
# ----------------------------------------------------------------------------

detect_os() {

    OS_ID="unknown"
    OS_VERSION="unknown"
    OS_FAMILY="unknown"

    if [ -f /etc/os-release ]; then
        # shellcheck disable=SC1091
        . /etc/os-release

        OS_ID="${ID:-unknown}"
        OS_VERSION="${VERSION_ID:-unknown}"

        case "$OS_ID" in

            ubuntu|debian|linuxmint)
                OS_FAMILY="debian"
                ;;

            amzn)
                OS_FAMILY="amazon"
                ;;

            rhel|rocky|almalinux|centos|fedora|
            ol|oracle)
                OS_FAMILY="redhat"
                ;;

            opensuse*|sles|suse)
                OS_FAMILY="suse"
                ;;

            *)
                OS_FAMILY="unknown"
                ;;
        esac
    fi

    log "Detected OS: ${OS_ID} ${OS_VERSION}"
    log "Detected family: ${OS_FAMILY}"
}

detect_os

# ----------------------------------------------------------------------------
# PACKAGE MANAGER
# ----------------------------------------------------------------------------

PACKAGE_MANAGER=""

detect_package_manager() {

    if command -v apt-get >/dev/null 2>&1; then
        PACKAGE_MANAGER="apt"

    elif command -v dnf >/dev/null 2>&1; then
        PACKAGE_MANAGER="dnf"

    elif command -v yum >/dev/null 2>&1; then
        PACKAGE_MANAGER="yum"

    elif command -v zypper >/dev/null 2>&1; then
        PACKAGE_MANAGER="zypper"

    else
        fail "No supported package manager found."
        return 1
    fi

    log "Package manager: ${PACKAGE_MANAGER}"
}

detect_package_manager || exit 1

# ----------------------------------------------------------------------------
# PACKAGE INSTALLATION
# ----------------------------------------------------------------------------

install_packages() {

    case "$PACKAGE_MANAGER" in

        apt)

            retry 5 5 apt-get update -y || return 1

            retry 5 3 apt-get install -y \
                ca-certificates \
                curl \
                git \
                sudo \
                tar \
                gzip \
                openssl \
                || return 1
            ;;

        dnf)

            retry 5 3 dnf makecache || true

            retry 5 3 dnf install -y \
                ca-certificates \
                curl \
                git \
                sudo \
                tar \
                gzip \
                openssl \
                || return 1
            ;;

        yum)

            retry 5 3 yum makecache || true

            retry 5 3 yum install -y \
                ca-certificates \
                curl \
                git \
                sudo \
                tar \
                gzip \
                openssl \
                || return 1
            ;;

        zypper)

            retry 5 3 zypper --non-interactive refresh || true

            retry 5 3 zypper --non-interactive install \
                curl \
                git \
                sudo \
                tar \
                gzip \
                openssl \
                ca-certificates \
                || return 1
            ;;

        *)
            fail "Unsupported package manager."
            return 1
            ;;
    esac

    return 0
}

install_packages || exit 1

# ----------------------------------------------------------------------------
# SERVICE USER
# ----------------------------------------------------------------------------

detect_service_user() {

    # Prefer existing Forge user
    if id forge >/dev/null 2>&1; then
        SERVICE_USER="forge"
        return
    fi

    # AWS Ubuntu
    if id ubuntu >/dev/null 2>&1; then
        SERVICE_USER="ubuntu"
        return
    fi

    # Amazon Linux / RHEL
    if id ec2-user >/dev/null 2>&1; then
        SERVICE_USER="ec2-user"
        return
    fi

    # Debian
    if id admin >/dev/null 2>&1; then
        SERVICE_USER="admin"
        return
    fi

    # Generic fallback
    SERVICE_USER="root"

    warn "No standard AWS user found. Using root."
}

detect_service_user

log "Forge service user: ${SERVICE_USER}"

# ----------------------------------------------------------------------------
# NODE.JS
# ----------------------------------------------------------------------------

install_node() {

    if command -v node >/dev/null 2>&1; then

        NODE_VERSION="$(node --version 2>/dev/null || true)"

        if [[ "$NODE_VERSION" =~ ^v20\. ]]; then
            log "Node.js already installed: ${NODE_VERSION}"
            return 0
        fi

        warn "Existing Node.js version ${NODE_VERSION} is not Node.js ${NODE_MAJOR}."
    fi

    log "Installing Node.js ${NODE_MAJOR}..."

    case "$PACKAGE_MANAGER" in

        apt|dnf|yum)

            # NodeSource supports the major Debian/RHEL families.
            if curl -fsSL \
                "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" \
                | bash -; then

                case "$PACKAGE_MANAGER" in
                    apt)
                        retry 5 3 apt-get install -y nodejs
                        ;;
                    dnf)
                        retry 5 3 dnf install -y nodejs
                        ;;
                    yum)
                        retry 5 3 yum install -y nodejs
                        ;;
                esac

            else
                warn "NodeSource installation failed."
            fi
            ;;

        zypper)
            warn "Using system Node.js package on SUSE."

            retry 5 3 zypper --non-interactive install nodejs20 \
                || retry 5 3 zypper --non-interactive install nodejs
            ;;

        *)
            return 1
            ;;
    esac

    if ! command -v node >/dev/null 2>&1; then
        fail "Node.js installation failed."
        return 1
    fi

    if ! command -v npm >/dev/null 2>&1; then
        fail "npm is not available."
        return 1
    fi

    log "Node.js: $(node --version)"
    log "npm: $(npm --version)"

    return 0
}

install_node || exit 1

# ----------------------------------------------------------------------------
# APPLICATION DIRECTORY
# ----------------------------------------------------------------------------

mkdir -p "$APP_DIR"

if [ "$SERVICE_USER" != "root" ]; then
    chown -R "$SERVICE_USER":"$SERVICE_USER" "$APP_DIR" 2>/dev/null || true
fi

# ----------------------------------------------------------------------------
# GIT / FORGE REPOSITORY
# ----------------------------------------------------------------------------

clone_or_update_repo() {

    if [ -d "$APP_DIR/.git" ]; then

        log "Existing Forge repository detected."

        cd "$APP_DIR" || return 1

        # Never let an update failure destroy an otherwise working install.
        if git fetch origin "$REPO_BRANCH"; then

            git checkout "$REPO_BRANCH" || return 1

            git reset --hard "origin/${REPO_BRANCH}" || return 1

            log "Forge repository updated."

        else

            warn "Git fetch failed."
            warn "Keeping existing Forge installation."
        fi

    else

        log "Cloning Forge repository..."

        # Remove incomplete directory if necessary
        if [ -d "$APP_DIR" ]; then
            find "$APP_DIR" -mindepth 1 -maxdepth 1 \
                -exec rm -rf {} + 2>/dev/null || true
        fi

        if [ "$SERVICE_USER" = "root" ]; then

            git clone \
                --branch "$REPO_BRANCH" \
                "$REPO_URL" \
                "$APP_DIR"

        else

            sudo -u "$SERVICE_USER" git clone \
                --branch "$REPO_BRANCH" \
                "$REPO_URL" \
                "$APP_DIR"
        fi
    fi
}

clone_or_update_repo || exit 1

cd "$APP_DIR" || exit 1

# ----------------------------------------------------------------------------
# DEPENDENCIES
# ----------------------------------------------------------------------------

install_dependencies() {

    log "Installing Forge dependencies..."

    if [ ! -f package.json ]; then
        fail "package.json not found."
        return 1
    fi

    if [ "$SERVICE_USER" = "root" ]; then

        if [ -f package-lock.json ]; then
            npm ci --omit=dev
        else
            npm install --omit=dev
        fi

    else

        if [ -f package-lock.json ]; then

            sudo -u "$SERVICE_USER" npm ci --omit=dev

        else

            sudo -u "$SERVICE_USER" npm install --omit=dev
        fi
    fi
}

install_dependencies || exit 1

# ----------------------------------------------------------------------------
# FORGE SETUP
# ----------------------------------------------------------------------------

run_setup() {

    if npm run | grep -q " setup"; then

        log "Running Forge setup..."

        if [ "$SERVICE_USER" = "root" ]; then
            npm run setup
        else
            sudo -u "$SERVICE_USER" npm run setup
        fi

    else

        warn "No npm setup script found."
    fi
}

run_setup || warn "Forge setup reported an error."

# ----------------------------------------------------------------------------
# NODE BINARY
# ----------------------------------------------------------------------------

NODE_BIN="$(command -v node)"

if [ -z "$NODE_BIN" ]; then
    fail "Unable to locate Node.js binary."
    exit 1
fi

NODE_BIN="$(readlink -f "$NODE_BIN" 2>/dev/null || echo "$NODE_BIN")"

log "Node binary: $NODE_BIN"

# ----------------------------------------------------------------------------
# SYSTEMD
# ----------------------------------------------------------------------------

SYSTEMD_AVAILABLE="false"

if command -v systemctl >/dev/null 2>&1 &&
   [ -d /run/systemd/system ]; then

    SYSTEMD_AVAILABLE="true"
fi

# ----------------------------------------------------------------------------
# SYSTEMD SERVICE
# ----------------------------------------------------------------------------

install_systemd_service() {

    log "Installing systemd service..."

    cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=Forge Control Plane
Documentation=https://github.com/YOUR_GITHUB_USERNAME/forge
After=network-online.target
Wants=network-online.target

[Service]
Type=simple

User=${SERVICE_USER}
WorkingDirectory=${APP_DIR}

ExecStart=${NODE_BIN} server/index.js

Environment=NODE_ENV=production
Environment=PORT=${APP_PORT}

Restart=always
RestartSec=5

TimeoutStartSec=120
TimeoutStopSec=30

StartLimitIntervalSec=60
StartLimitBurst=10

NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload

    systemctl enable "$SERVICE_NAME"

    systemctl restart "$SERVICE_NAME"

    sleep 3

    if systemctl is-active --quiet "$SERVICE_NAME"; then
        log "Forge systemd service is running."
        return 0
    fi

    fail "Forge systemd service failed to start."

    systemctl status "$SERVICE_NAME" --no-pager \
        >> "$LOG_FILE" 2>&1 || true

    journalctl -u "$SERVICE_NAME" \
        -n 50 \
        --no-pager \
        >> "$LOG_FILE" 2>&1 || true

    return 1
}

# ----------------------------------------------------------------------------
# FALLBACK PROCESS SUPERVISOR
# ----------------------------------------------------------------------------

start_fallback_service() {

    log "systemd unavailable. Using fallback supervisor."

    cat > /usr/local/bin/forge-start.sh <<EOF
#!/usr/bin/env bash

while true; do

    echo "[forge-supervisor] Starting Forge..."

    cd "${APP_DIR}" || exit 1

    export NODE_ENV=production
    export PORT="${APP_PORT}"

    "${NODE_BIN}" server/index.js

    EXIT_CODE=\$?

    echo "[forge-supervisor] Forge exited with code \$EXIT_CODE"

    sleep 5

done
EOF

    chmod +x /usr/local/bin/forge-start.sh

    nohup /usr/local/bin/forge-start.sh \
        >> /var/log/forge.log 2>&1 &

    log "Fallback Forge supervisor started."
}

# ----------------------------------------------------------------------------
# START SERVICE
# ----------------------------------------------------------------------------

if [ "$SYSTEMD_AVAILABLE" = "true" ]; then

    if ! install_systemd_service; then

        warn "systemd startup failed."
        warn "Attempting fallback supervisor."

        start_fallback_service
    fi

else

    start_fallback_service

fi

# ----------------------------------------------------------------------------
# FIREWALL
# ----------------------------------------------------------------------------

configure_firewall() {

    # Do NOT aggressively modify firewall rules.
    # AWS Security Groups are the primary network boundary.

    if command -v ufw >/dev/null 2>&1; then

        log "UFW detected. Leaving existing firewall policy unchanged."

    elif command -v firewall-cmd >/dev/null 2>&1; then

        log "firewalld detected. Leaving existing firewall policy unchanged."

    else

        log "No host firewall detected."
    fi
}

configure_firewall

# ----------------------------------------------------------------------------
# AWS PUBLIC IP
# ----------------------------------------------------------------------------

get_public_ip() {

    local token=""
    local ip=""

    # IMDSv2
    token="$(curl \
        --connect-timeout 2 \
        --max-time 3 \
        -fsS \
        -X PUT \
        "http://169.254.169.254/latest/api/token" \
        -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" \
        2>/dev/null || true)"

    if [ -n "$token" ]; then

        ip="$(curl \
            --connect-timeout 2 \
            --max-time 3 \
            -fsS \
            -H "X-aws-ec2-metadata-token: ${token}" \
            "http://169.254.169.254/latest/meta-data/public-ipv4" \
            2>/dev/null || true)"
    fi

    echo "$ip"
}

PUBLIC_IP="$(get_public_ip)"

# ----------------------------------------------------------------------------
# INFORMATION FILE
# ----------------------------------------------------------------------------

write_info_file() {

    local home_dir=""

    if [ "$SERVICE_USER" != "root" ]; then
        home_dir="$(getent passwd "$SERVICE_USER" | cut -d: -f6)"
    fi

    [ -n "$home_dir" ] || home_dir="/root"

    cat > "${home_dir}/forge-info.txt" <<EOF
Forge Control Plane
===================

OS:
${OS_ID} ${OS_VERSION}

Service User:
${SERVICE_USER}

Application:
${APP_DIR}

Port:
${APP_PORT}

Public IP:
${PUBLIC_IP:-unknown}

URL:
http://${PUBLIC_IP:-<INSTANCE-IP>}:${APP_PORT}/

Bootstrap Log:
${LOG_FILE}

Service:
${SERVICE_NAME}

Systemd:
${SYSTEMD_AVAILABLE}

Bootstrap Status:
$([ "$BOOTSTRAP_FAILED" -eq 0 ] && echo "SUCCESS" || echo "COMPLETED WITH WARNINGS")
EOF

    chown "$SERVICE_USER":"$SERVICE_USER" \
        "${home_dir}/forge-info.txt" 2>/dev/null || true
}

write_info_file

# ----------------------------------------------------------------------------
# FINAL HEALTH CHECK
# ----------------------------------------------------------------------------

health_check() {

    log "Running Forge health check..."

    if ! pgrep -f "server/index.js" >/dev/null 2>&1; then
        warn "Forge process was not detected."
        return 1
    fi

    log "Forge process detected."

    if command -v curl >/dev/null 2>&1; then

        if curl \
            --connect-timeout 3 \
            --max-time 5 \
            -fsS \
            "http://127.0.0.1:${APP_PORT}/" \
            >/dev/null 2>&1; then

            log "Forge HTTP health check passed."
            return 0

        else

            warn "Forge process exists but HTTP health check failed."
        fi
    fi

    return 0
}

health_check || warn "Health check reported a problem."

# ----------------------------------------------------------------------------
# FINAL RESULT
# ----------------------------------------------------------------------------

echo ""
echo "============================================================"
echo " Forge AWS Bootstrap"
echo "============================================================"

if [ "$BOOTSTRAP_FAILED" -eq 0 ]; then
    echo " Status : SUCCESS"
else
    echo " Status : COMPLETED WITH WARNINGS"
fi

echo " OS     : ${OS_ID} ${OS_VERSION}"
echo " User   : ${SERVICE_USER}"
echo " App    : ${APP_DIR}"
echo " Port   : ${APP_PORT}"
echo " Public : ${PUBLIC_IP:-unknown}"
echo " Log    : ${LOG_FILE}"

if [ -n "$PUBLIC_IP" ]; then
    echo " URL    : http://${PUBLIC_IP}:${APP_PORT}/"
fi

echo "============================================================"
echo ""

# IMPORTANT:
# Do not use `exit 1` for recoverable failures at the end.
# cloud-init should be able to finish even when an optional component failed.

exit 0