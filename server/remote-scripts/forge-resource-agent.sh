#!/usr/bin/env bash
set -u
export LC_ALL=C

DATA_DIR=/var/lib/forge-resource-agent
DATA_FILE="$DATA_DIR/telemetry.env"
SERVER_NAME=${FORGE_TELEMETRY_SERVER_NAME:-}

read_cpu() {
  awk '/^cpu / { total=0; for (i=2; i<=9; i++) total += $i; print total, $5+$6; exit }' /proc/stat
}

set -- $(read_cpu)
total_before=${1:-0}
idle_before=${2:-0}
sleep 1
set -- $(read_cpu)
total_after=${1:-0}
idle_after=${2:-0}
cpu_percent=$(awk -v tb="$total_before" -v ib="$idle_before" -v ta="$total_after" -v ia="$idle_after" 'BEGIN { delta=ta-tb; if (delta <= 0) printf "0.0"; else printf "%.1f", 100*(delta-(ia-ib))/delta }')

mem_total=$(awk '/^MemTotal:/ { print $2 * 1024 }' /proc/meminfo)
mem_available=$(awk '/^MemAvailable:/ { print $2 * 1024 }' /proc/meminfo)
mem_used=$((mem_total - mem_available))
mem_percent=$(awk -v used="$mem_used" -v total="$mem_total" 'BEGIN { if (total > 0) printf "%.1f", used*100/total; else printf "0.0" }')

set -- $(df -Pk / | awk 'NR == 2 { gsub(/%/, "", $5); print $3 * 1024, $2 * 1024, $5 }')
disk_used=${1:-0}
disk_total=${2:-0}
disk_percent=${3:-0}

set -- $(awk -F: 'NR > 2 { iface=$1; gsub(/[ \t]/, "", iface); if (iface != "lo") { split($2, stat); rx+=stat[1]; tx+=stat[9]; count++ } } END { printf "%.0f %.0f %d", rx, tx, count }' /proc/net/dev)
network_received=${1:-0}
network_sent=${2:-0}
network_interfaces=${3:-0}
checked_epoch=$(date +%s)
previous_received=$(awk -F= '$1 == "FORGE_TELEMETRY_NETWORK_RECEIVED_BYTES" { print $2 }' "$DATA_FILE" 2>/dev/null || true)
previous_sent=$(awk -F= '$1 == "FORGE_TELEMETRY_NETWORK_SENT_BYTES" { print $2 }' "$DATA_FILE" 2>/dev/null || true)
previous_epoch=$(awk -F= '$1 == "FORGE_TELEMETRY_CHECKED_EPOCH" { print $2 }' "$DATA_FILE" 2>/dev/null || true)
network_received_bps=0
network_sent_bps=0
if [[ "$previous_received" =~ ^[0-9]+$ && "$previous_sent" =~ ^[0-9]+$ && "$previous_epoch" =~ ^[0-9]+$ ]]; then
  elapsed=$((checked_epoch - previous_epoch))
  if [ "$elapsed" -gt 0 ]; then
    network_received_bps=$(awk -v current="$network_received" -v previous="$previous_received" -v seconds="$elapsed" 'BEGIN { delta=current-previous; if (delta < 0) delta=0; printf "%.0f", delta/seconds }')
    network_sent_bps=$(awk -v current="$network_sent" -v previous="$previous_sent" -v seconds="$elapsed" 'BEGIN { delta=current-previous; if (delta < 0) delta=0; printf "%.0f", delta/seconds }')
  fi
fi

set -- $(awk '{ printf "%.2f %.2f %.2f", $1, $2, $3 }' /proc/loadavg)
load_one=${1:-0}
load_five=${2:-0}
load_fifteen=${3:-0}
uptime_seconds=$(awk '{ printf "%.0f", $1 }' /proc/uptime)
cpu_cores=$(getconf _NPROCESSORS_ONLN 2>/dev/null || printf '1')
platform=$(. /etc/os-release 2>/dev/null; printf '%s' "${PRETTY_NAME:-$(uname -s)}")

tls_state=unavailable
tls_end_date=
if command -v openssl >/dev/null 2>&1 && command -v timeout >/dev/null 2>&1 && [ -n "$SERVER_NAME" ]; then
  if [[ "$SERVER_NAME" =~ ^[0-9.]+$ ]]; then
    tls_output=$(timeout 8 openssl s_client -connect "$SERVER_NAME:443" -verify_ip "$SERVER_NAME" -verify_return_error </dev/null 2>&1 || true)
  else
    tls_output=$(timeout 8 openssl s_client -connect "$SERVER_NAME:443" -servername "$SERVER_NAME" -verify_hostname "$SERVER_NAME" -verify_return_error </dev/null 2>&1 || true)
  fi
  tls_end_date=$(printf '%s\n' "$tls_output" | openssl x509 -noout -enddate 2>/dev/null | sed -n 's/^notAfter=//p' | head -n 1)
  if [ -n "$tls_end_date" ]; then
    if printf '%s\n' "$tls_output" | grep -q 'Verify return code: 0 (ok)'; then tls_state=valid; else tls_state=untrusted; fi
  fi
fi

temporary_file="$DATA_FILE.$$"
{
  printf 'FORGE_TELEMETRY_CHECKED_AT=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'FORGE_TELEMETRY_CHECKED_EPOCH=%s\n' "$checked_epoch"
  printf 'FORGE_TELEMETRY_CPU_PERCENT=%s\n' "$cpu_percent"
  printf 'FORGE_TELEMETRY_CPU_CORES=%s\n' "$cpu_cores"
  printf 'FORGE_TELEMETRY_LOAD_ONE=%s\n' "$load_one"
  printf 'FORGE_TELEMETRY_LOAD_FIVE=%s\n' "$load_five"
  printf 'FORGE_TELEMETRY_LOAD_FIFTEEN=%s\n' "$load_fifteen"
  printf 'FORGE_TELEMETRY_UPTIME_SECONDS=%s\n' "$uptime_seconds"
  printf 'FORGE_TELEMETRY_PLATFORM=%s\n' "$platform"
  printf 'FORGE_TELEMETRY_MEMORY_USED_BYTES=%s\n' "$mem_used"
  printf 'FORGE_TELEMETRY_MEMORY_TOTAL_BYTES=%s\n' "$mem_total"
  printf 'FORGE_TELEMETRY_MEMORY_PERCENT=%s\n' "$mem_percent"
  printf 'FORGE_TELEMETRY_DISK_USED_BYTES=%s\n' "$disk_used"
  printf 'FORGE_TELEMETRY_DISK_TOTAL_BYTES=%s\n' "$disk_total"
  printf 'FORGE_TELEMETRY_DISK_PERCENT=%s\n' "$disk_percent"
  printf 'FORGE_TELEMETRY_NETWORK_RECEIVED_BYTES=%s\n' "$network_received"
  printf 'FORGE_TELEMETRY_NETWORK_SENT_BYTES=%s\n' "$network_sent"
  printf 'FORGE_TELEMETRY_NETWORK_INTERFACES=%s\n' "$network_interfaces"
  printf 'FORGE_TELEMETRY_NETWORK_RECEIVED_BPS=%s\n' "$network_received_bps"
  printf 'FORGE_TELEMETRY_NETWORK_SENT_BPS=%s\n' "$network_sent_bps"
  printf 'FORGE_TELEMETRY_TLS_STATE=%s\n' "$tls_state"
  if [ -n "$tls_end_date" ]; then printf 'FORGE_TELEMETRY_TLS_END_DATE=%s\n' "$tls_end_date"; fi
} > "$temporary_file"
chmod 0640 "$temporary_file"
mv -f "$temporary_file" "$DATA_FILE"