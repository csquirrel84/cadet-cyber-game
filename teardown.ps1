# Undoes everything setup.ps1 did: stops and removes the 10 team
# containers, and (if setup.ps1 managed to bring one up) tears down the
# legacy hosted network so this machine's WiFi adapter goes back to
# normal. If you turned Mobile Hotspot on by hand because the automatic
# step failed, turn it off by hand too -- this script only reverses
# what it could have set up itself.
#
# Run from PowerShell: .\teardown.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "Stopping team containers..."
docker compose -f docker-compose.lan.windows.yml down

try {
    $status = netsh wlan show hostednetwork
    if ($status -match "Status\s*:\s*Started") {
        Write-Host "Stopping the access point..."
        try {
            $hnetShare = New-Object -ComObject HNetCfg.HNetShare
            foreach ($conn in $hnetShare.EnumEveryConnection) {
                $cfg = $hnetShare.INetSharingConfigurationForINetConnection.Invoke($conn)
                if ($cfg.SharingEnabled) {
                    $cfg.DisableSharing()
                }
            }
        } catch {
            Write-Host "Could not disable Internet Connection Sharing automatically: $($_.Exception.Message)"
        }
        netsh wlan stop hostednetwork | Out-Null
    } else {
        Write-Host "No hosted network running."
        Write-Host "(If you turned on Mobile Hotspot by hand, turn it off in Settings.)"
    }
} catch {
    Write-Host "Could not check/stop the hosted network: $($_.Exception.Message)"
}

Write-Host "Done. Containers stopped, access point torn down."
