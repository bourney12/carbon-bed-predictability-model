param(
  [string]$DatabasePath = "O:\CALDERS & GRANDIDGE\Jake\1ChargeData\ChargeDB.mdb",
  [string]$ServiceUrl = "https://carbon-bed-predictability-model.onrender.com",
  [int]$EveryMinutes = 15,
  [string]$TaskName = "Carbon Bed - Charge Data Sync",
  # Run even when nobody is logged on (asks for this Windows account's password once).
  [switch]$RunWhenLoggedOff,
  [switch]$Uninstall
)

# One-time setup: registers a Windows scheduled task that pushes ChargeDB.mdb to the
# Carbon Bed Predictability Model on Render every $EveryMinutes minutes.
#
# Run once, in a normal (not admin) PowerShell window, from the repo's scripts folder:
#   powershell -ExecutionPolicy Bypass -File .\install-charge-sync-task.ps1
# Remove it again:
#   powershell -ExecutionPolicy Bypass -File .\install-charge-sync-task.ps1 -Uninstall
#
# What it does:
#  1. Copies sync-charge-mdb.ps1 to %LOCALAPPDATA%\CarbonChargeSync
#  2. Asks for the import API key and stores it encrypted (Windows DPAPI: only your
#     Windows account on this PC can decrypt it; it is never written in plain text)
#  3. Converts the O: drive path to its \\server\share path, because mapped drive
#     letters are not available to scheduled tasks
#  4. Runs one test sync so you see it work
#  5. Registers the scheduled task (at logon + every N minutes, no overlapping runs)
# Log: %LOCALAPPDATA%\CarbonChargeSync\sync.log

$ErrorActionPreference = "Stop"
$installDir = Join-Path $env:LOCALAPPDATA "CarbonChargeSync"
$keyFile = Join-Path $installDir "import-key.dat"
$logFile = Join-Path $installDir "sync.log"
$scriptDest = Join-Path $installDir "sync-charge-mdb.ps1"

if ($Uninstall) {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Scheduled task removed."
  } else { Write-Host "No scheduled task named '$TaskName' found." }
  Write-Host "Files left in $installDir (delete the folder to remove the stored key)."
  return
}

# 1. Copy the sync script
$scriptSrc = Join-Path $PSScriptRoot "sync-charge-mdb.ps1"
if (!(Test-Path $scriptSrc)) { throw "sync-charge-mdb.ps1 not found next to this installer ($PSScriptRoot)." }
New-Item -ItemType Directory -Path $installDir -Force | Out-Null
Copy-Item $scriptSrc $scriptDest -Force
Write-Host "Sync script copied to $scriptDest"

# 2. Store the API key encrypted
if ((Test-Path $keyFile) -and ((Read-Host "An import key is already stored. Replace it? (y/N)") -notmatch '^[yY]')) {
  Write-Host "Keeping the stored key."
} else {
  $secure = Read-Host "Paste the CARBON_IMPORT_API_KEY value from the Render dashboard" -AsSecureString
  if ($secure.Length -eq 0) { throw "No key entered." }
  $secure | ConvertFrom-SecureString | Set-Content $keyFile
  Write-Host "Key stored encrypted at $keyFile"
}

# 3. Resolve a mapped drive letter to its UNC path
$dbPath = $DatabasePath
if ($dbPath -match '^([A-Za-z]):\\') {
  $letter = $Matches[1].ToUpper()
  $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='${letter}:'" -ErrorAction SilentlyContinue
  if ($disk -and $disk.DriveType -eq 4 -and $disk.ProviderName) {
    $dbPath = $disk.ProviderName.TrimEnd('\') + $dbPath.Substring(2)
    Write-Host "Mapped drive ${letter}: resolved to network path: $dbPath"
  }
}
if (!(Test-Path -LiteralPath $dbPath)) { throw "Charge database not found at: $dbPath" }

# Pick the PowerShell matching the installed Access driver (ACE OLEDB) bitness.
$ps64 = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
$ps32 = Join-Path $env:WINDIR "SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
$baseArgs = "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$scriptDest`" -Once -DatabasePath `"$dbPath`" -ServiceUrl `"$ServiceUrl`" -KeyFile `"$keyFile`" -LogFile `"$logFile`""

# 4. Test run (tries 64-bit first, then 32-bit if the Access driver is 32-bit only)
$psExe = $null
foreach ($candidate in @($ps64, $ps32)) {
  if (!(Test-Path $candidate)) { continue }
  Write-Host "Test sync using $candidate ..."
  $p = Start-Process -FilePath $candidate -ArgumentList $baseArgs -Wait -PassThru -WindowStyle Hidden
  if ($p.ExitCode -eq 0) { $psExe = $candidate; break }
  Write-Warning "Test sync failed with $candidate (exit $($p.ExitCode))."
}
Write-Host "---- last log lines ----"
if (Test-Path $logFile) { Get-Content $logFile -Tail 12 }
if (-not $psExe) { throw "Test sync failed. See $logFile. Common causes: wrong API key, Access database driver not installed, network path unreachable." }

# 5. Register the scheduled task
$action = New-ScheduledTaskAction -Execute $psExe -Argument $baseArgs
$repeat = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $EveryMinutes)
$logon = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

if ($RunWhenLoggedOff) {
  $cred = Get-Credential -UserName "$env:USERDOMAIN\$env:USERNAME" -Message "Windows password for this account (lets the task run while logged off)"
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($repeat, $logon) -Settings $settings `
    -User $cred.UserName -Password $cred.GetNetworkCredential().Password -RunLevel Limited `
    -Description "Pushes ChargeDB.mdb charges to the Carbon Bed Predictability Model every $EveryMinutes min. Log: $logFile" | Out-Null
} else {
  $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($repeat, $logon) -Settings $settings -Principal $principal `
    -Description "Pushes ChargeDB.mdb charges to the Carbon Bed Predictability Model every $EveryMinutes min. Log: $logFile" | Out-Null
}

Write-Host ""
Write-Host "Done. Task '$TaskName' runs every $EveryMinutes minutes and at logon."
Write-Host "Log file: $logFile"
if (-not $RunWhenLoggedOff) { Write-Host "Note: it runs while you are logged on to this PC. Re-run with -RunWhenLoggedOff to keep it going when logged off." }
