#!/usr/bin/env bash
# Checks for Docker, installs it if missing (Linux via the official
# convenience script, macOS via Homebrew if available), makes sure the
# daemon is running, then builds and starts the game.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

os="$(uname -s)"

have_docker() { command -v docker >/dev/null 2>&1; }

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
until docker info >/dev/null 2>&1; do
  tries=$((tries + 1))
  if [ "$tries" -gt 30 ]; then
    echo "Docker still isn't responding after 60 seconds."
    if [ "$os" = "Darwin" ]; then
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

echo "Building and starting the game..."
docker compose up -d --build

port="$(grep -oE '"[0-9]+:8000"' docker-compose.yml | head -1 | tr -d '"' | cut -d: -f1)"
port="${port:-8000}"
echo ""
echo "Running. Open http://localhost:${port}/ in a browser."
echo "DM console: http://localhost:${port}/dm"
