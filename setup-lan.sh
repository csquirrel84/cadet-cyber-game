#!/usr/bin/env bash
# Field deployment, Linux only: builds the game, starts one isolated
# instance per team (ports 8000-8009), and stands up a WiFi access point
# on this machine for the team laptops to connect to. No internet is
# shared -- cadets only need to reach this machine.
#
# Run this on the machine the DM will actually sit at. The DM console
# (/dm) only answers requests from this machine's own loopback interface,
# so it is never reachable over the WiFi network this script creates --
# nothing to configure for that, it's just how the server listens.
#
# Run with: ./setup-lan.sh [wifi-interface]
# If no interface is given, the script picks the first Wi-Fi device
# NetworkManager knows about.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

SSID="OPERATION-BLACKOUT"
WIFI_PASSWORD="blackout2026"
IMAGE="cadet-cyber-game-lan:latest"
TEAMS=(alpha:8000 bravo:8001 charlie:8002 delta:8003 echo:8004 foxtrot:8005 golf:8006 hotel:8007 india:8008 juliett:8009)

have_docker() { command -v docker >/dev/null 2>&1; }
have_nmcli() { command -v nmcli >/dev/null 2>&1; }

if ! have_docker; then
  echo "Docker isn't installed. Run ./setup.sh first (it installs Docker),"
  echo "then run this script."
  exit 1
fi

if ! have_nmcli; then
  echo "NetworkManager (nmcli) isn't available on this machine, so this"
  echo "script can't bring up the WiFi access point automatically."
  echo "Install NetworkManager, or set up the hotspot by hand, then re-run."
  exit 1
fi

echo "Waiting for the Docker daemon to respond..."
tries=0
docker_err=""
until docker_err="$(docker info 2>&1 >/dev/null)"; do
  tries=$((tries + 1))
  if [ "$tries" -gt 30 ]; then
    echo "Docker still isn't responding after 60 seconds."
    if echo "$docker_err" | grep -qi "permission denied"; then
      echo "This looks like a group-membership issue -- log out and back in"
      echo "(or run 'newgrp docker' in this shell), then re-run this script."
    else
      echo "Try: sudo systemctl start docker"
    fi
    exit 1
  fi
  sleep 2
done
echo "Docker is up."

wifi_if="${1:-}"
if [ -z "$wifi_if" ]; then
  wifi_if="$(nmcli -t -f TYPE,DEVICE device | awk -F: '$1=="wifi"{print $2; exit}')"
fi
if [ -z "$wifi_if" ]; then
  echo "No WiFi device found. Plug one in, or pass the interface name:"
  echo "  ./setup-lan.sh wlan0"
  exit 1
fi
echo "Using WiFi interface: $wifi_if"

echo "Starting the access point ($SSID)..."
nmcli device wifi hotspot ifname "$wifi_if" ssid "$SSID" password "$WIFI_PASSWORD"

ap_ip="$(nmcli -g IP4.ADDRESS device show "$wifi_if" | cut -d/ -f1)"
ap_ip="${ap_ip:-10.42.0.1}"

echo "Building the game image..."
docker build -t "$IMAGE" .

echo "Starting one game per team..."
docker compose -f docker-compose.lan.yml up -d

echo ""
echo "================================================================"
echo "WiFi network:  $SSID"
echo "Password:      $WIFI_PASSWORD"
echo "================================================================"
echo "Team     Connect to"
for entry in "${TEAMS[@]}"; do
  name="${entry%%:*}"
  port="${entry##*:}"
  printf "%-10s http://%s:%s/\n" "$name" "$ap_ip" "$port"
done
echo "================================================================"
echo "DM consoles (this machine only, not reachable over WiFi):"
for entry in "${TEAMS[@]}"; do
  port="${entry##*:}"
  echo "  http://127.0.0.1:${port}/dm"
done
echo "================================================================"
