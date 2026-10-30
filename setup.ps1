# Checks for Docker Desktop, installs it if missing (via winget when
# available), makes sure the daemon is running, then builds and starts
# the game. Run this from PowerShell: .\setup.ps1
# If scripts are blocked on this machine, run once first:
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Test-Docker {
    return [bool](Get-Command docker -ErrorAction SilentlyContinue)
}

if (-not (Test-Docker)) {
    Write-Host "Docker not found."
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($winget) {
        Write-Host "Installing Docker Desktop via winget. This needs a reboot or"
        Write-Host "logout afterwards before Docker will actually run."
        winget install -e --id Docker.DockerDesktop --accept-source-agreements --accept-package-agreements
        Write-Host ""
        Write-Host "Docker Desktop is installed. Log out and back in (or reboot),"
        Write-Host "start Docker Desktop from the Start menu, then re-run this script."
        exit 1
    } else {
        Write-Host "winget isn't available on this machine."
        Write-Host "Install Docker Desktop manually: https://www.docker.com/products/docker-desktop/"
        Write-Host "Then re-run this script."
        exit 1
    }
}

Write-Host "Checking the Docker daemon is running..."
$dockerRunning = $false
try {
    docker info *> $null
    $dockerRunning = $true
} catch {
    $dockerRunning = $false
}

if (-not $dockerRunning) {
    $dockerExe = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerExe) {
        Write-Host "Docker Desktop isn't running. Starting it..."
        Start-Process $dockerExe
    } else {
        Write-Host "Docker is installed but the daemon isn't responding, and"
        Write-Host "Docker Desktop wasn't found at the usual path. Start it manually."
    }
    Write-Host "Waiting for the Docker daemon to respond (this can take a minute the first time)..."
    $tries = 0
    while ($true) {
        $tries++
        try {
            docker info *> $null
            break
        } catch {
            if ($tries -gt 60) {
                Write-Host "Docker still isn't responding after 2 minutes."
                Write-Host "Make sure Docker Desktop has finished starting (check the whale icon"
                Write-Host "in the system tray), then re-run this script."
                exit 1
            }
            Start-Sleep -Seconds 2
        }
    }
}
Write-Host "Docker is up."

$composeOk = $true
try { docker compose version *> $null } catch { $composeOk = $false }
if (-not $composeOk) {
    Write-Host "The 'docker compose' plugin isn't available. Update Docker Desktop and try again."
    exit 1
}

Write-Host "Building and starting the game..."
docker compose up -d --build

$composeFile = Get-Content "$PSScriptRoot\docker-compose.yml" -Raw
$port = "8000"
if ($composeFile -match '"(\d+):8000"') {
    $port = $Matches[1]
}

Write-Host ""
Write-Host "Running. Open http://localhost:$port/ in a browser."
Write-Host "DM console: http://localhost:$port/dm"
