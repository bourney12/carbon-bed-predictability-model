param(
  # Leave blank to search the synced OneDrive / SharePoint folders for the workbook.
  [string]$WorkbookPath = "",
  [string]$WorkbookName = "Creosote Tank and Flash Point Log.xlsx",
  [string]$ServiceUrl = "https://carbon-bed-predictability-model.onrender.com",
  [string]$SinceDate = "2024-01-01",
  [int]$EveryMinutes = 15,
  [string]$TaskName = "Carbon Bed - Creosote Log Sync",
  [switch]$RunWhenLoggedOff,
  [switch]$Uninstall
)

# One-time setup: registers a Windows scheduled task that pushes the creosote
# Deliveries and Daily Log tabs to the Carbon Bed Predictability Model on Render.
#
# Before running: the workbook must be synced to this PC by OneDrive. In SharePoint /
# OneDrive on the web, open "Shared with me", find the workbook's folder (or the file)
# and choose "Add shortcut to My files". Then right-click the shortcut in File Explorer
# and choose "Always keep on this device".
#
# Run once, in a normal PowerShell window, from the repo's scripts folder:
#   powershell -ExecutionPolicy Bypass -File .\install-creosote-sync-task.ps1
# Remove it again:
#   powershell -ExecutionPolicy Bypass -File .\install-creosote-sync-task.ps1 -Uninstall
#
# It reuses the encrypted import key stored by the charge sync installer if present.
# Log: %LOCALAPPDATA%\CarbonCreosoteSync\sync.log

$ErrorActionPreference = "Stop"
$installDir = Join-Path $env:LOCALAPPDATA "CarbonCreosoteSync"
$keyFile = Join-Path $installDir "import-key.dat"
$chargeKeyFile = Join-Path $env:LOCALAPPDATA "CarbonChargeSync\import-key.dat"
$logFile = Join-Path $installDir "sync.log"
$stateFile = Join-Path $installDir "last-synced.txt"
$scriptDest = Join-Path $installDir "sync-creosote-xlsx.ps1"

if ($Uninstall) {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Scheduled task removed."
  } else { Write-Host "No scheduled task named '$TaskName' found." }
  Write-Host "Files left in $installDir (delete the folder to remove the stored key)."
  return
}

# 1. Locate the workbook
if ([string]::IsNullOrWhiteSpace($WorkbookPath)) {
  $roots = @($env:OneDriveCommercial, $env:OneDrive) + @(Get-ChildItem $env:USERPROFILE -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like "OneDrive*" -or $_.Name -like "SharePoint*" } | ForEach-Object { $_.FullName })
  # Organisation SharePoint libraries sync to %USERPROFILE%\<Company name>\...
  $roots += @(Get-ChildItem $env:USERPROFILE -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like "*Saint-Gobain*" -or $_.Name -like "*Calders*" -or $_.Name -like "*Borgen*" } | ForEach-Object { $_.FullName })
  $roots = $roots | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
  Write-Host "Searching for '$WorkbookName' in: $($roots -join '; ')"
  $found = @()
  foreach ($root in $roots) {
    $found += @(Get-ChildItem -Path $root -Filter $WorkbookName -Recurse -File -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName)
  }
  $found = $found | Select-Object -Unique
  if ($found.Count -eq 1) { $WorkbookPath = $found[0] }
  elseif ($found.Count -gt 1) {
    Write-Host "Found more than one copy:"; for ($i = 0; $i -lt $found.Count; $i++) { Write-Host "  [$i] $($found[$i])" }
    $WorkbookPath = $found[[int](Read-Host "Number of the one to use")]
  } else {
    Write-Host "Workbook not found in the synced folders."
    $WorkbookPath = (Read-Host "Paste the full path to '$WorkbookName' (or Ctrl+C, add the OneDrive shortcut, and re-run)").Trim('"')
  }
}
if (!(Test-Path -LiteralPath $WorkbookPath)) { throw "Workbook not found at: $WorkbookPath" }
Write-Host "Using workbook: $WorkbookPath"

# 2. Copy the sync script
$scriptSrc = Join-Path $PSScriptRoot "sync-creosote-xlsx.ps1"
if (!(Test-Path $scriptSrc)) { throw "sync-creosote-xlsx.ps1 not found next to this installer ($PSScriptRoot)." }
New-Item -ItemType Directory -Path $installDir -Force | Out-Null
Copy-Item $scriptSrc $scriptDest -Force

# 3. Import key (reuse the charge sync's encrypted key if it exists)
if (Test-Path $keyFile) {
  Write-Host "Using the import key already stored at $keyFile"
} elseif (Test-Path $chargeKeyFile) {
  Copy-Item $chargeKeyFile $keyFile -Force
  Write-Host "Reusing the import key stored by the charge sync."
} else {
  $secure = Read-Host "Paste the CARBON_IMPORT_API_KEY value from the Render dashboard" -AsSecureString
  if ($secure.Length -eq 0) { throw "No key entered." }
  $secure | ConvertFrom-SecureString | Set-Content $keyFile
  Write-Host "Key stored encrypted at $keyFile"
}

$psExe = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
$baseArgs = "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$scriptDest`" -WorkbookPath `"$WorkbookPath`" -ServiceUrl `"$ServiceUrl`" -SinceDate `"$SinceDate`" -KeyFile `"$keyFile`" -LogFile `"$logFile`" -StateFile `"$stateFile`""

# 4. Test run (forced, so it posts even if nothing changed)
Write-Host "Test sync ..."
$p = Start-Process -FilePath $psExe -ArgumentList ($baseArgs + " -Force") -Wait -PassThru -WindowStyle Hidden
Write-Host "---- last log lines ----"
if (Test-Path $logFile) { Get-Content $logFile -Tail 10 }
if ($p.ExitCode -ne 0) { throw "Test sync failed (exit $($p.ExitCode)). See $logFile." }

# 5. Register the scheduled task
$action = New-ScheduledTaskAction -Execute $psExe -Argument $baseArgs
$repeat = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $EveryMinutes)
$logon = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false }
$desc = "Pushes the creosote Deliveries and Daily Log tabs to the Carbon Bed Predictability Model every $EveryMinutes min (only when the workbook has changed). Log: $logFile"
if ($RunWhenLoggedOff) {
  $cred = Get-Credential -UserName "$env:USERDOMAIN\$env:USERNAME" -Message "Windows password for this account (lets the task run while logged off)"
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($repeat, $logon) -Settings $settings `
    -User $cred.UserName -Password $cred.GetNetworkCredential().Password -RunLevel Limited -Description $desc | Out-Null
} else {
  $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($repeat, $logon) -Settings $settings -Principal $principal -Description $desc | Out-Null
}
Write-Host ""
Write-Host "Done. Task '$TaskName' checks the workbook every $EveryMinutes minutes and at logon, and posts only when it has changed."
Write-Host "Log file: $logFile"
