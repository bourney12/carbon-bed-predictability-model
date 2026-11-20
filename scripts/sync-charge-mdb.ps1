param(
  [string]$DatabasePath = "O:\CALDERS & GRANDIDGE\Jake\1ChargeData\ChargeDB.mdb",
  [string]$ServiceUrl = "https://carbon-bed-predictability-model.onrender.com",
  [string]$ImportApiKey = $env:CARBON_IMPORT_API_KEY,
  [int]$PollSeconds = 60,
  [switch]$Once
)

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
# Requires the Microsoft Access Database Engine (ACE OLEDB 12.0). Its bitness must
# match PowerShell: 64-bit ACE -> normal PowerShell; 32-bit ACE ->
# C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

if ([string]::IsNullOrWhiteSpace($ImportApiKey)) {
  throw "ImportApiKey is required (pass -ImportApiKey or set CARBON_IMPORT_API_KEY). It must match CARBON_IMPORT_API_KEY in the Render dashboard."
}

function Get-ChargeRowsFromMdb {
  param([string]$Path)

  $connString = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=$Path;Mode=Read|Share Deny None;Persist Security Info=False;"
  $conn = New-Object System.Data.OleDb.OleDbConnection($connString)
  $conn.Open()
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
  Invoke-ChargeSync -Path $DatabasePath -Url $ServiceUrl -ApiKey $ImportApiKey
  return
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
