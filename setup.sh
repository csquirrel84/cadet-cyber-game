#!/usr/bin/env bash
# One script: checks for Docker (installs it if missing), builds the
# game, starts one isolated instance per team (ports 8000-8009), and
# brings up a WiFi access point on this machine for the team laptops to
# connect to. No internet is shared -- cadets only need to reach this
# machine.
#
# Run this on the machine the DM will actually sit at. The DM console
# (/dm) only answers requests from this machine's own loopback
# interface, so it is never reachable over the WiFi network this script
# creates -- nothing to configure for that, it's just how the server
# listens.
#
# To undo everything this does, run ./teardown.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

os="$(uname -s)"
SSID="OPERATION-BLACKOUT"
WIFI_PASSWORD="blackout2026"
IMAGE="cadet-cyber-game-lan:latest"
TEAMS=(alpha:8000 bravo:8001 charlie:8002 delta:8003 echo:8004 foxtrot:8005 golf:8006 hotel:8007 india:8008 juliett:8009)

have_docker() { command -v docker >/dev/null 2>&1; }
have_nmcli() { command -v nmcli >/dev/null 2>&1; }

install_docker_linux() {
  echo "Docker not found. Installing via Docker's official convenience script..."
  echo "This runs 'sudo', so it may prompt for your password."
  curl -fsSL https://get.docker.com | sudo sh
  echo "Adding $USER to the docker group so you don't need sudo for every command."
  sudo usermod -aG docker "$USER" || true
  echo "You may need to log out and back in for the group change to take effect."
}

install_docker_mac() {
  if command -v brew >/dev/null 2>&1; then
    echo "Docker not found. Installing Docker Desktop via Homebrew..."
    brew install --cask docker
    echo "Starting Docker Desktop..."
    open -a Docker
  else
    echo "Docker not found, and Homebrew isn't installed either."
    echo "Install Docker Desktop manually: https://www.docker.com/products/docker-desktop/"
    echo "Then re-run this script."
    exit 1
  fi
}

if ! have_docker; then
  case "$os" in
    Linux) install_docker_linux ;;
    Darwin) install_docker_mac ;;
    *)
      echo "Unrecognised OS '$os'. Install Docker manually:"
      echo "  https://www.docker.com/products/docker-desktop/"
      exit 1
      ;;
  esac
fi

echo "Waiting for the Docker daemon to respond..."
tries=0
docker_err=""
until docker_err="$(docker info 2>&1 >/dev/null)"; do
  tries=$((tries + 1))
  if [ "$tries" -gt 30 ]; then
    echo "Docker still isn't responding after 60 seconds."
    if echo "$docker_err" | grep -qi "permission denied"; then
      echo "This looks like a group-membership issue, not a stopped daemon --"
      echo "the daemon is running, but this shell session predates being added"
      echo "to the 'docker' group. Log out and back in (or run 'newgrp docker'"
      echo "in this shell), then re-run this script."
    elif [ "$os" = "Darwin" ]; then
      echo "Open Docker Desktop manually (check the whale icon in the menu bar), then re-run this script."
    else
      echo "Try: sudo systemctl start docker"
    fi
    exit 1
  fi
  sleep 2
done
echo "Docker is up."

if ! docker compose version >/dev/null 2>&1; then
  echo "The 'docker compose' plugin isn't available. It ships with current Docker"
  echo "Desktop and current Docker Engine installs -- update Docker and try again."
  exit 1
fi

ap_ip=""
if [ "$os" = "Linux" ] && have_nmcli; then
  wifi_if="${1:-}"
  if [ -z "$wifi_if" ]; then
    wifi_if="$(nmcli -t -f TYPE,DEVICE device | awk -F: '$1=="wifi"{print $2; exit}')"
  fi
  if [ -n "$wifi_if" ]; then
    echo "Using WiFi interface: $wifi_if"
    echo "Starting the access point ($SSID)..."
    nmcli device wifi hotspot ifname "$wifi_if" ssid "$SSID" password "$WIFI_PASSWORD"
    ap_ip="$(nmcli -g IP4.ADDRESS device show "$wifi_if" | cut -d/ -f1)"
    ap_ip="${ap_ip:-10.42.0.1}"
  else
    echo "No WiFi device found -- skipping the access point."
    echo "Team laptops will need another way to reach this machine (e.g. plugged into the same LAN)."
  fi
else
  echo "WiFi access point setup isn't automated on this OS yet."
  echo "Team laptops will need another way to reach this machine (e.g. plugged into the same LAN)."
fi

echo "Building the game image..."
docker build -t "$IMAGE" .

echo "Starting one game per team..."
docker compose -f docker-compose.lan.yml up -d

echo ""
echo "================================================================"
if [ -n "$ap_ip" ]; then
  echo "WiFi network:  $SSID"
  echo "Password:      $WIFI_PASSWORD"
  echo "================================================================"
fi
echo "Team     Connect to"
for entry in "${TEAMS[@]}"; do
  name="${entry%%:*}"
  port="${entry##*:}"
  if [ -n "$ap_ip" ]; then
    printf "%-10s http://%s:%s/\n" "$name" "$ap_ip" "$port"
  else
    printf "%-10s http://<this-machine's-LAN-IP>:%s/\n" "$name" "$port"
  fi
done
echo "================================================================"
echo "DM consoles (this machine only, not reachable by the teams):"
for entry in "${TEAMS[@]}"; do
  port="${entry##*:}"
  echo "  http://127.0.0.1:${port}/dm"
done
echo "================================================================"
echo "To shut everything down: ./teardown.sh"
