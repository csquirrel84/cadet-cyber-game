#!/usr/bin/env bash
# Undoes everything setup.sh did: stops and removes the 10 team
# containers, and (on Linux, if it brought one up) tears down the WiFi
# access point so this machine's WiFi adapter goes back to normal.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

echo "Stopping team containers..."
docker compose -f docker-compose.lan.yml down

os="$(uname -s)"
if [ "$os" = "Linux" ] && command -v nmcli >/dev/null 2>&1; then
  wifi_if="${1:-}"
  if [ -z "$wifi_if" ]; then
    wifi_if="$(nmcli -t -f TYPE,DEVICE device | awk -F: '$1=="wifi"{print $2; exit}')"
  fi
  if [ -n "$wifi_if" ]; then
    hotspot_conn="$(nmcli -t -f NAME,DEVICE connection show --active | awk -F: -v d="$wifi_if" '$2==d{print $1; exit}')"
    if [ -n "$hotspot_conn" ]; then
      echo "Stopping the access point ($hotspot_conn)..."
      nmcli connection down "$hotspot_conn" || true
      nmcli connection delete "$hotspot_conn" || true
    else
      echo "No active connection found on $wifi_if -- nothing to tear down there."
    fi
  fi
fi

echo "Done. Containers stopped, access point torn down."
