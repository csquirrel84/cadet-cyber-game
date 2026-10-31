# One script: checks for WSL and Docker (installs either if missing),
# builds the game, starts one isolated instance per team (ports
# 8000-8009), and attempts to bring up a WiFi access point on this
# machine for the team laptops to connect to. No internet is shared --
# cadets only need to reach this machine.
#
# If WSL needs installing, this exits after kicking it off -- it needs a
# reboot before Docker Desktop can be installed or started. Re-run the
# script after rebooting.
#
# The WiFi access point step is best-effort: Windows has no first-class
# scriptable "create a hotspot" command (the Settings app's Mobile
# Hotspot toggle is the only officially supported route, and it has no
# command-line equivalent). This script tries the older netsh hosted
# network + Internet Connection Sharing mechanism, which is scriptable
# but depends on your WiFi adapter's driver and your Windows version. If
# it fails, it prints the exact manual steps to turn on Mobile Hotspot
# by hand instead -- the game itself and the per-team deployment still
# work fine either way, this only affects how team laptops connect.
#
# Run from PowerShell: .\setup.ps1
# If scripts are blocked on this machine, run once first:
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#
# To undo everything this does, run .\teardown.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# ------------------------------------------------------------------- WSL

function Test-WSL {
    if (-not (Get-Command wsl -ErrorAction SilentlyContinue)) { return $false }
    try {
        wsl --status *> $null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

if (-not (Test-WSL)) {
    Write-Host "WSL (Windows Subsystem for Linux) not found -- Docker Desktop needs it."
    Write-Host "Installing WSL. This needs admin rights and a reboot before it finishes."
    wsl --install
    Write-Host ""
    Write-Host "WSL is installing. Reboot this machine, then re-run this script."
    exit 1
}

# Make sure WSL2 (not the older WSL1) is the default -- Docker Desktop
# needs WSL2 specifically. Harmless to run even if it is already WSL2.
try {
    wsl --set-default-version 2 *> $null
} catch {
    Write-Host "Could not confirm WSL2 is the default version: $($_.Exception.Message)"
    Write-Host "If Docker Desktop fails to start later, check Settings > Apps > Optional features,"
    Write-Host "or run 'wsl --set-default-version 2' yourself."
}
Write-Host "WSL is up."

$SSID = "OPERATION-BLACKOUT"
$WifiPassword = "blackout2026"
$Image = "cadet-cyber-game-lan:latest"
$Teams = @(
    @{ Name = "alpha";   Port = 8000 },
    @{ Name = "bravo";   Port = 8001 },
    @{ Name = "charlie"; Port = 8002 },
    @{ Name = "delta";   Port = 8003 },
    @{ Name = "echo";    Port = 8004 },
    @{ Name = "foxtrot"; Port = 8005 },
    @{ Name = "golf";    Port = 8006 },
    @{ Name = "hotel";   Port = 8007 },
    @{ Name = "india";   Port = 8008 },
    @{ Name = "juliett"; Port = 8009 }
)

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

# ------------------------------------------------------------ WiFi access point

function Show-ManualHotspotFallback {
    Write-Host ""
    Write-Host "=== Set up the WiFi network by hand instead ==="
    Write-Host "1. Open Settings > Network & internet > Mobile hotspot"
    Write-Host "2. Edit the network name to: $SSID"
    Write-Host "3. Edit the network password to: $WifiPassword"
    Write-Host "4. Turn Mobile hotspot On"
    Write-Host "5. Note the IP address Windows shows there (usually 192.168.137.1)"
    Write-Host "   -- use that instead of the address this script would have printed."
    Write-Host "================================================="
    Write-Host ""
}

$apIp = $null
try {
    $driverInfo = netsh wlan show drivers
    if ($driverInfo -notmatch "Hosted network supported\s*:\s*Yes") {
        Write-Host "This machine's WiFi adapter doesn't support a hosted network."
        Show-ManualHotspotFallback
    } else {
        Write-Host "Starting the access point ($SSID)..."
        netsh wlan set hostednetwork mode=allow ssid=$SSID key=$WifiPassword keyUsage=persistent | Out-Null
        $startResult = netsh wlan start hostednetwork
        if ($startResult -notmatch "started") {
            throw "netsh wlan start hostednetwork did not report success: $startResult"
        }
        Start-Sleep -Seconds 2

        # netsh has no switch to actually hand out IP addresses to clients --
        # that needs Internet Connection Sharing enabled on the hosted
        # network's virtual adapter, which has no CLI either. This drives
        # the same legacy COM API the old Network Connections GUI used.
        # "Public" side just needs to be *some* LAN-type adapter for ICS to
        # accept the configuration -- it does not need to actually be
        # connected to the internet, since nothing is being shared to it.
        $hnetShare = New-Object -ComObject HNetCfg.HNetShare
        $hostedConn = $null
        $publicConn = $null
        foreach ($conn in $hnetShare.EnumEveryConnection) {
            $props = $hnetShare.NetConnectionProps.Invoke($conn)
            if ($props.DeviceName -like "*Hosted Network*" -or $props.DeviceName -like "*Virtual Wi-Fi*" -or $props.Name -like "*Hosted Network*") {
                $hostedConn = $conn
            } elseif (-not $publicConn -and $props.MediaType -eq 0) {
                $publicConn = $conn
            }
        }

        if (-not $hostedConn -or -not $publicConn) {
            throw "Could not identify the hosted network's virtual adapter for sharing."
        }

        $hnetShare.INetSharingConfigurationForINetConnection.Invoke($publicConn).EnableSharing(0)  # 0 = ICS_PUBLIC
        $hnetShare.INetSharingConfigurationForINetConnection.Invoke($hostedConn).EnableSharing(1)   # 1 = ICS_PRIVATE
        Start-Sleep -Seconds 3
        $apIp = "192.168.137.1"
        Write-Host "Access point is up."
    }
} catch {
    Write-Host "Automatic WiFi access point setup failed: $($_.Exception.Message)"
    Show-ManualHotspotFallback
}

# ------------------------------------------------------------------- build + run

Write-Host "Building the game image..."
docker build -t $Image .

Write-Host "Starting one game per team..."
docker compose -f docker-compose.lan.yml up -d

Write-Host ""
Write-Host "================================================================"
if ($apIp) {
    Write-Host "WiFi network:  $SSID"
    Write-Host "Password:      $WifiPassword"
    Write-Host "================================================================"
}
Write-Host "Team     Connect to"
foreach ($team in $Teams) {
    $addr = if ($apIp) { $apIp } else { "<this machine's hotspot IP>" }
    Write-Host ("{0,-10} http://{1}:{2}/" -f $team.Name, $addr, $team.Port)
}
Write-Host "================================================================"
Write-Host "DM consoles (this machine only, not reachable by the teams):"
foreach ($team in $Teams) {
    Write-Host ("  http://127.0.0.1:{0}/dm" -f $team.Port)
}
Write-Host "================================================================"
Write-Host "To shut everything down: .\teardown.ps1"
