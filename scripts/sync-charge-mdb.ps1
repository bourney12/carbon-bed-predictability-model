$ErrorActionPreference = "Stop"

param(
  [string]$DatabasePath = "O:\CALDERS & GRANDIDGE\Jake\1ChargeData\ChargeDB.mdb",
  [string]$ServiceUrl = "https://carbon-bed-predictability-model.onrender.com",
  [string]$ImportApiKey = "",
  [int]$PollSeconds = 60
)

if ([string]::IsNullOrWhiteSpace($ImportApiKey)) {
  throw "ImportApiKey is required."
}

function Get-ChargeRowsFromMdb {
  param([string]$Path)

  $conn = New-Object System.Data.OleDb.OleDbConnection("Provider=Microsoft.ACE.OLEDB.12.0;Data Source=$Path;Persist Security Info=False;")
  $conn.Open()
  try {
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = "SELECT ID, Plant, Charge_Start, Charge_End FROM ChargeData"
    $adapter = New-Object System.Data.OleDb.OleDbDataAdapter($cmd)
    $dt = New-Object System.Data.DataTable
    [void]$adapter.Fill($dt)
    $rows = @()
    foreach ($row in $dt.Rows) {
      if ($null -eq $row.Charge_Start -or $null -eq $row.Charge_End) { continue }
      $start = [datetime]$row.Charge_Start
      $end = [datetime]$row.Charge_End
      $durationHrs = [math]::Round((New-TimeSpan -Start $start -End $end).TotalHours, 2)
      if ($durationHrs -le 0) { continue }
      $plantValue = [string]$row.Plant
      $type = if ($plantValue -eq "1") { "plant1" } elseif ($plantValue -eq "2") { "plant2" } else { "" }
      if ([string]::IsNullOrWhiteSpace($type)) { continue }
      $rows += [pscustomobject]@{
        id = "mdb-" + [string]$row.ID
        plant = $plantValue
        type = $type
        date = $start.ToString("yyyy-MM-dd")
        durationHrs = $durationHrs
        count = 1
        notes = "mdb-sync"
        importTag = "mdb-sync"
      }
    }
    return $rows
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
  $payload = @{ rows = $rows } | ConvertTo-Json -Depth 5
  $headers = @{
    "Content-Type" = "application/json"
    "x-import-api-key" = $ApiKey
  }
  $endpoint = $Url.TrimEnd("/") + "/api/imports/charges/mdb-sync"
  $response = Invoke-RestMethod -Method Post -Uri $endpoint -Headers $headers -Body $payload
  $summary = if ($response.imports -and $response.imports.charges) { $response.imports.charges.lastSummary } else { "No summary returned." }
  Write-Host ("[{0}] MDB sync complete. {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $summary)
}

if (!(Test-Path -LiteralPath $DatabasePath)) {
  throw "MDB file not found: $DatabasePath"
}

$lastWrite = [datetime]::MinValue
Write-Host ("Watching MDB: {0}" -f $DatabasePath)
Write-Host ("Posting to: {0}" -f ($ServiceUrl.TrimEnd("/") + "/api/imports/charges/mdb-sync"))

while ($true) {
  try {
    $item = Get-Item -LiteralPath $DatabasePath
    if ($item.LastWriteTime -gt $lastWrite) {
      $lastWrite = $item.LastWriteTime
      Invoke-ChargeSync -Path $DatabasePath -Url $ServiceUrl -ApiKey $ImportApiKey
    }
  }
  catch {
    Write-Warning $_
  }
  Start-Sleep -Seconds $PollSeconds
}
