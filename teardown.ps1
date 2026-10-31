# Undoes everything setup.ps1 did: stops and removes the 10 team
# containers, and (if setup.ps1 managed to bring one up automatically)
# tears down the WiFi access point so this machine's WiFi adapter goes
# back to normal. If you turned Mobile Hotspot on by hand because the
# automatic step failed, turn it off by hand too -- this script only
# reverses what it could have set up itself.
#
# Run from PowerShell: .\teardown.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "Stopping team containers..."
docker compose -f docker-compose.lan.windows.yml down

try {
    $status = netsh wlan show hostednetwork
    if ($status -match "Status\s*:\s*Started") {
        Write-Host "Stopping the access point (legacy hosted network)..."
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
        Write-Host "No legacy hosted network running."
    }
} catch {
    Write-Host "Could not check/stop the hosted network: $($_.Exception.Message)"
}

try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    [void][Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager, Windows.Networking.NetworkOperators, ContentType = WindowsRuntime]
    [void][Windows.Networking.Connectivity.NetworkInformation, Windows.Networking.Connectivity, ContentType = WindowsRuntime]
    $profile = [Windows.Networking.Connectivity.NetworkInformation]::GetInternetConnectionProfile()
    if ($profile) {
        $tetheringManager = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]::CreateFromConnectionProfile($profile)
        if ($tetheringManager.TetheringOperationalState -eq [Windows.Networking.NetworkOperators.TetheringOperationalState]::On) {
            Write-Host "Stopping the access point (Mobile Hotspot API)..."
            $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
                $_.Name -eq "AsTask" -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq "IAsyncOperation``1"
            })[0].MakeGenericMethod([Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult])
            $task = $asTaskGeneric.Invoke($null, @($tetheringManager.StopTetheringAsync()))
            $task.Wait(-1) | Out-Null
        } else {
            Write-Host "No Mobile Hotspot tethering active."
        }
    }
} catch {
    Write-Host "Could not check/stop Mobile Hotspot tethering: $($_.Exception.Message)"
    Write-Host "(If you turned it on by hand, turn it off in Settings.)"
}

Write-Host "Done. Containers stopped, access point torn down."
