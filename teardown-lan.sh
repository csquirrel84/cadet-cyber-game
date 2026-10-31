#!/usr/bin/env bash
# Undoes everything setup-lan.sh did: stops and removes the 10 team
# containers, and tears down the WiFi access point so this machine's
# WiFi adapter goes back to normal.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

echo "Stopping team containers..."
docker compose -f docker-compose.lan.yml down

wifi_if="${1:-}"
if [ -z "$wifi_if" ] && command -v nmcli >/dev/null 2>&1; then
  wifi_if="$(nmcli -t -f TYPE,DEVICE device | awk -F: '$1=="wifi"{print $2; exit}')"
fi

if [ -n "$wifi_if" ] && command -v nmcli >/dev/null 2>&1; then
  hotspot_conn="$(nmcli -t -f NAME,DEVICE connection show --active | awk -F: -v d="$wifi_if" '$2==d{print $1; exit}')"
  if [ -n "$hotspot_conn" ]; then
    echo "Stopping the access point ($hotspot_conn)..."
    nmcli connection down "$hotspot_conn" || true
    nmcli connection delete "$hotspot_conn" || true
  else
    echo "No active connection found on $wifi_if -- nothing to tear down there."
  fi
else
  echo "No WiFi interface found/nmcli unavailable -- skipping access point teardown."
fi

echo "Done. Containers stopped, access point torn down."
