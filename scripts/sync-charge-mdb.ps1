param(
  [string]$DatabasePath = "O:\CALDERS & GRANDIDGE\Jake\1ChargeData\ChargeDB.mdb",
  [string]$ServiceUrl = "https://carbon-bed-predictability-model.onrender.com",
  [string]$ImportApiKey = $env:CARBON_IMPORT_API_KEY,
  [int]$PollSeconds = 60,
  [switch]$Once,
  # Optional: DPAPI-encrypted key file written by install-charge-sync-task.ps1
  # (readable only by the Windows user who created it, on this PC).
  [string]$KeyFile = "",
  # Optional: append all output to this log file (used by the scheduled task).
  [string]$LogFile = ""
)

if ($LogFile) {
  $logDir = Split-Path -Parent $LogFile
  if ($logDir -and !(Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
  # Keep the log small: roll over at 1 MB.
  if ((Test-Path $LogFile) -and (Get-Item $LogFile).Length -gt 1MB) { Move-Item $LogFile ($LogFile + ".old") -Force }
  Start-Transcript -Path $LogFile -Append | Out-Null
}

if ([string]::IsNullOrWhiteSpace($ImportApiKey) -and $KeyFile -and (Test-Path $KeyFile)) {
  $secure = Get-Content $KeyFile | ConvertTo-SecureString
  $ImportApiKey = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
}

# Charge data sync: Access ChargeDB.mdb -> Render /api/imports/charges/mdb-sync
#
# v1.9.0 fixes:
#  - param() must be the first statement in a PowerShell script; the previous
#    version set $ErrorActionPreference first, so the script failed to start.
#  - Forces TLS 1.2 (Windows PowerShell 5.1 can default to TLS 1.0, which Render rejects).
#  - Opens the MDB read-only and shared, so it never locks the plant's charge database.
#  - Only records the file's last-write time after a SUCCESSFUL sync, so a failed
#    post (Render waking up, network drop) is retried on the next poll.
#  - Always sends rows as a JSON array (PowerShell collapses a 1-row array to an object).
#  - -Once switch: run one sync and exit (for Task Scheduler or a first test).
#  - API key can come from the CARBON_IMPORT_API_KEY environment variable instead of
#    being typed on the command line.
#
# Usage (first test):
#   powershell -ExecutionPolicy Bypass -File .\sync-charge-mdb.ps1 -ImportApiKey "<key>" -Once
# Continuous watch:
#   powershell -ExecutionPolicy Bypass -File .\sync-charge-mdb.ps1 -ImportApiKey "<key>"
#
# Uses the Access Database Engine (ACE) if installed, else the Jet 4.0 driver built into
# Windows (32-bit). Driver bitness must
# match PowerShell: 64-bit ACE -> normal PowerShell; 32-bit ACE ->
# C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

if ([string]::IsNullOrWhiteSpace($ImportApiKey)) {
  throw "ImportApiKey is required (pass -ImportApiKey or set CARBON_IMPORT_API_KEY). It must match CARBON_IMPORT_API_KEY in the Render dashboard."
}

function Get-ChargeRowsFromMdb {
  param([string]$Path)

  # Try the Access Database Engine first, then the Jet 4.0 driver built into Windows
  # (32-bit only, reads .mdb files - no install needed; run from SysWOW64 PowerShell).
  $conn = $null
  $errors = @()
  foreach ($provider in @("Microsoft.ACE.OLEDB.16.0", "Microsoft.ACE.OLEDB.12.0", "Microsoft.Jet.OLEDB.4.0")) {
    $connString = "Provider=$provider;Data Source=$Path;Mode=Read|Share Deny None;Persist Security Info=False;"
    $candidate = New-Object System.Data.OleDb.OleDbConnection($connString)
    try {
      $candidate.Open()
      $conn = $candidate
      Write-Host ("Opened MDB with {0} ({1}-bit PowerShell)." -f $provider, ([IntPtr]::Size * 8))
      break
    }
    catch {
      $msg = if ($_.Exception.InnerException) { $_.Exception.InnerException.Message } else { $_.Exception.Message }
      $errors += ("{0}: {1}" -f $provider, $msg)
      $candidate.Dispose()
    }
  }
  if ($null -eq $conn) {
    throw ("No Access/Jet driver could open the MDB in this {0}-bit PowerShell. Tried: {1}" -f ([IntPtr]::Size * 8), ($errors -join " | "))
  }
  try {
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = "SELECT ID, Plant, Charge_Start, Charge_End FROM ChargeData"
    $adapter = New-Object System.Data.OleDb.OleDbDataAdapter($cmd)
    $dt = New-Object System.Data.DataTable
    [void]$adapter.Fill($dt)
    $rows = New-Object System.Collections.Generic.List[object]
    $skipped = 0
    foreach ($row in $dt.Rows) {
      if ($row.Charge_Start -is [System.DBNull] -or $row.Charge_End -is [System.DBNull]) { $skipped++; continue }
      $start = [datetime]$row.Charge_Start
      $end = [datetime]$row.Charge_End
      $durationHrs = [math]::Round((New-TimeSpan -Start $start -End $end).TotalHours, 2)
      if ($durationHrs -le 0) { $skipped++; continue }
      $plantValue = ([string]$row.Plant).Trim()
      $type = if ($plantValue -eq "1") { "plant1" } elseif ($plantValue -eq "2") { "plant2" } else { "" }
      if ([string]::IsNullOrWhiteSpace($type)) { $skipped++; continue }
      $rows.Add([pscustomobject]@{
        id = "mdb-" + [string]$row.ID
        plant = $plantValue
        type = $type
        date = $start.ToString("yyyy-MM-dd", [System.Globalization.CultureInfo]::InvariantCulture)
        durationHrs = $durationHrs
        count = 1
        notes = "mdb-sync"
        importTag = "mdb-sync"
      })
    }
    Write-Host ("Read {0} rows from MDB ({1} usable, {2} skipped locally: open, zero-length or unknown plant)." -f $dt.Rows.Count, $rows.Count, $skipped)
    return ,$rows.ToArray()
  }
  finally {
    $conn.Close()
  }
}

function Invoke-ChargeSync {
  param(
    [string]$Path,
    [string]$Url,
    [string]$ApiKey
  )

  $rows = Get-ChargeRowsFromMdb -Path $Path
  $payload = ConvertTo-Json -InputObject @{ rows = @($rows) } -Depth 5 -Compress
  $headers = @{ "x-import-api-key" = $ApiKey }
  $endpoint = $Url.TrimEnd("/") + "/api/imports/charges/mdb-sync"
  # Render can take ~30-60 s to wake a sleeping service; allow for it.
  $response = Invoke-RestMethod -Method Post -Uri $endpoint -Headers $headers -ContentType "application/json" -Body ([System.Text.Encoding]::UTF8.GetBytes($payload)) -TimeoutSec 180
  $summary = if ($response.imports -and $response.imports.charges) { $response.imports.charges.lastSummary } else { "No summary returned." }
  Write-Host ("[{0}] MDB sync complete. {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $summary)
}

if (!(Test-Path -LiteralPath $DatabasePath)) {
  throw "MDB file not found: $DatabasePath"
}

if ($Once) {
  try {
    Invoke-ChargeSync -Path $DatabasePath -Url $ServiceUrl -ApiKey $ImportApiKey
  }
  catch {
    Write-Warning ("[{0}] Sync failed: {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $_)
    if ($LogFile) { Stop-Transcript | Out-Null }
    exit 1
  }
  if ($LogFile) { Stop-Transcript | Out-Null }
  exit 0
}

$lastWrite = [datetime]::MinValue
Write-Host ("Watching MDB: {0}" -f $DatabasePath)
Write-Host ("Posting to: {0}" -f ($ServiceUrl.TrimEnd("/") + "/api/imports/charges/mdb-sync"))

while ($true) {
  try {
    $item = Get-Item -LiteralPath $DatabasePath
    if ($item.LastWriteTime -gt $lastWrite) {
      Invoke-ChargeSync -Path $DatabasePath -Url $ServiceUrl -ApiKey $ImportApiKey
      $lastWrite = $item.LastWriteTime
    }
  }
  catch {
    Write-Warning ("[{0}] Sync failed, will retry next poll: {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $_)
  }
  Start-Sleep -Seconds $PollSeconds
}
