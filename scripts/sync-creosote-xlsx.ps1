param(
  # Local (OneDrive-synced) copy of the SharePoint workbook.
  [string]$WorkbookPath = "",
  [string]$ServiceUrl = "https://carbon-bed-predictability-model.onrender.com",
  [string]$ImportApiKey = $env:CARBON_IMPORT_API_KEY,
  # Deliveries and tank readings from this date onward are sent (and replace the
  # platform's copy for that range). Earlier history in the platform is left alone.
  [string]$SinceDate = "2024-01-01",
  # Optional: DPAPI-encrypted key file written by install-creosote-sync-task.ps1.
  [string]$KeyFile = "",
  # Optional: append all output to this log file (used by the scheduled task).
  [string]$LogFile = "",
  # Optional: remembers the last synced file version so unchanged files are skipped.
  [string]$StateFile = "",
  # Parse the workbook and print a summary without posting anything.
  [switch]$DryRun,
  # Post even if the workbook has not changed since the last successful sync.
  [switch]$Force
)

# Creosote log sync: "Creosote Tank and Flash Point Log.xlsx" -> Render
#   POST /api/imports/creosote/xlsx-sync   (header X-Import-Api-Key)
#
# Reads two tabs straight from the .xlsx file (no Excel needed; the file is opened
# read-only and shared, so it is safe while someone has the workbook open):
#   Deliveries - one row per load, with the Koppers CoA results
#   Daily Log  - the morning SCADA tank readings, usage and ambient temperature
# Columns are found by their header text, not by letter, so inserting a column in the
# workbook does not break the sync. Cached formula results are used, as saved by Excel.
#
# Usage (first test, nothing is sent):
#   powershell -ExecutionPolicy Bypass -File .\sync-creosote-xlsx.ps1 -WorkbookPath "<path>" -DryRun
# One real sync:
#   powershell -ExecutionPolicy Bypass -File .\sync-creosote-xlsx.ps1 -WorkbookPath "<path>" -ImportApiKey "<key>" -Force

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$inv = [Globalization.CultureInfo]::InvariantCulture

if ($LogFile) {
  $logDir = Split-Path -Parent $LogFile
  if ($logDir -and !(Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
  if ((Test-Path $LogFile) -and (Get-Item $LogFile).Length -gt 1MB) { Move-Item $LogFile ($LogFile + ".old") -Force }
  Start-Transcript -Path $LogFile -Append | Out-Null
}

function Stop-Log { if ($LogFile) { try { Stop-Transcript | Out-Null } catch {} } }

try {
  if ([string]::IsNullOrWhiteSpace($WorkbookPath)) { throw "WorkbookPath is required." }
  if (!(Test-Path -LiteralPath $WorkbookPath)) { throw "Workbook not found at: $WorkbookPath (is the OneDrive shortcut synced on this PC?)" }

  if (-not $DryRun) {
    if ([string]::IsNullOrWhiteSpace($ImportApiKey) -and $KeyFile -and (Test-Path $KeyFile)) {
      $secure = Get-Content $KeyFile | ConvertTo-SecureString
      $ImportApiKey = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
    }
    if ([string]::IsNullOrWhiteSpace($ImportApiKey)) {
      throw "ImportApiKey is required (pass -ImportApiKey, -KeyFile, or set CARBON_IMPORT_API_KEY)."
    }
  }

  $item = Get-Item -LiteralPath $WorkbookPath
  $fileStamp = "{0}|{1}" -f $item.LastWriteTimeUtc.ToString("o"), $item.Length
  if (-not $Force -and -not $DryRun -and $StateFile -and (Test-Path $StateFile)) {
    if ((Get-Content $StateFile -Raw).Trim() -eq $fileStamp) {
      Write-Host ("{0} Workbook unchanged since last sync - nothing to do." -f (Get-Date -Format s))
      Stop-Log
      exit 0
    }
  }

  # ---------- read the .xlsx (zip of XML parts) ----------
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem

  $fs = [IO.File]::Open($item.FullName, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete)
  $mem = New-Object IO.MemoryStream
  $fs.CopyTo($mem); $fs.Close()
  $mem.Position = 0
  $zip = New-Object IO.Compression.ZipArchive($mem, [IO.Compression.ZipArchiveMode]::Read)

  function Get-Part([string]$name) {
    $entry = $zip.GetEntry($name)
    if (-not $entry) { return $null }
    $reader = New-Object IO.StreamReader($entry.Open())
    try { return $reader.ReadToEnd() } finally { $reader.Close() }
  }

  $ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"

  # Shared strings
  $shared = New-Object System.Collections.Generic.List[string]
  $ssXml = Get-Part "xl/sharedStrings.xml"
  if ($ssXml) {
    $doc = New-Object Xml.XmlDocument; $doc.LoadXml($ssXml)
    $nsm = New-Object Xml.XmlNamespaceManager($doc.NameTable); $nsm.AddNamespace("x", $ns)
    foreach ($si in $doc.SelectNodes("//x:si", $nsm)) {
      $parts = $si.SelectNodes(".//x:t", $nsm) | ForEach-Object { $_.InnerText }
      $shared.Add(($parts -join ""))
    }
  }

  # Sheet name -> part path
  $wbDoc = New-Object Xml.XmlDocument; $wbDoc.LoadXml((Get-Part "xl/workbook.xml"))
  $relDoc = New-Object Xml.XmlDocument; $relDoc.LoadXml((Get-Part "xl/_rels/workbook.xml.rels"))
  $relMap = @{}
  foreach ($r in $relDoc.DocumentElement.ChildNodes) { $relMap[$r.GetAttribute("Id")] = $r.GetAttribute("Target") }
  $sheetPaths = @{}
  foreach ($s in $wbDoc.GetElementsByTagName("sheet", $ns)) {
    $rid = $s.GetAttribute("id", "http://schemas.openxmlformats.org/officeDocument/2006/relationships")
    $target = $relMap[$rid] -replace '^/?xl/', ''
    $sheetPaths[$s.GetAttribute("name")] = "xl/" + $target.TrimStart('/')
  }

  function Get-ColIndex([string]$ref) {
    $letters = ($ref -replace '\d', '').ToUpper(); $n = 0
    foreach ($ch in $letters.ToCharArray()) { $n = $n * 26 + ([int][char]$ch - 64) }
    return $n
  }

  # Returns a list of hashtables: column index -> raw cell text (shared strings resolved).
  function Read-Sheet([string]$sheetName, [int]$maxCol) {
    if (-not $sheetPaths.ContainsKey($sheetName)) { throw "Tab '$sheetName' not found in the workbook." }
    $entry = $zip.GetEntry($sheetPaths[$sheetName])
    $rows = New-Object System.Collections.Generic.List[object]
    $settings = New-Object Xml.XmlReaderSettings; $settings.IgnoreWhitespace = $true
    $xr = [Xml.XmlReader]::Create($entry.Open(), $settings)
    try {
      $row = $null; $col = 0; $type = ""; $val = $null
      while ($xr.Read()) {
        if ($xr.NodeType -eq [Xml.XmlNodeType]::Element) {
          switch ($xr.LocalName) {
            "row" { $row = @{}; if ($xr.IsEmptyElement) { $rows.Add($row); $row = $null } }
            "c" {
              $col = Get-ColIndex $xr.GetAttribute("r"); $type = [string]$xr.GetAttribute("t"); $val = $null
            }
            "v" { if ($col -le $maxCol) { $val = $xr.ReadElementContentAsString(); if ($type -eq "s") { $val = $shared[[int]$val] }; if ($null -ne $row -and $val -ne "") { $row[$col] = $val } } }
            "t" { if ($type -eq "inlineStr" -and $col -le $maxCol) { $val = $xr.ReadElementContentAsString(); if ($null -ne $row -and $val -ne "") { $row[$col] = $val } } }
          }
        } elseif ($xr.NodeType -eq [Xml.XmlNodeType]::EndElement -and $xr.LocalName -eq "row") {
          if ($null -ne $row) { $rows.Add($row) }; $row = $null
        }
      }
    } finally { $xr.Close() }
    return ,$rows
  }

  # Find each wanted column by the start of its header text (first line only).
  function Get-HeaderMap($headerRow, [hashtable]$wanted, [string]$sheetName) {
    $map = @{}
    foreach ($key in $wanted.Keys) {
      $prefix = $wanted[$key].ToLower()
      foreach ($c in ($headerRow.Keys | Sort-Object)) {
        $h = ([string]$headerRow[$c]).Split("`n")[0].Trim().ToLower()
        if ($h.StartsWith($prefix)) { $map[$key] = $c; break }
      }
      if (-not $map.ContainsKey($key)) { Write-Warning "Column '$($wanted[$key])' not found on '$sheetName' - it will be sent blank." }
    }
    return $map
  }

  function To-IsoDate($v) {
    if ($null -eq $v -or "$v" -eq "") { return "" }
    $d = 0.0
    if ([double]::TryParse([string]$v, [Globalization.NumberStyles]::Float, $inv, [ref]$d) -and $d -gt 20000 -and $d -lt 80000) {
      return [DateTime]::FromOADate($d).ToString("yyyy-MM-dd")
    }
    $dt = [DateTime]::MinValue
    if ([DateTime]::TryParse([string]$v, [Globalization.CultureInfo]::GetCultureInfo("en-GB"), [Globalization.DateTimeStyles]::None, [ref]$dt)) { return $dt.ToString("yyyy-MM-dd") }
    return ""
  }

  function To-Num($v) {
    if ($null -eq $v -or "$v" -eq "") { return $null }
    $d = 0.0
    $clean = ([string]$v) -replace '[<>,\s]', ''
    if ([double]::TryParse($clean, [Globalization.NumberStyles]::Float, $inv, [ref]$d)) { return [Math]::Round($d, 6) }
    return $null
  }

  function Cell($row, $map, $key) { if ($map.ContainsKey($key) -and $row.ContainsKey($map[$key])) { return $row[$map[$key]] }; return $null }

  # ---------- Deliveries ----------
  $delRows = Read-Sheet "Deliveries" 40
  $delMap = Get-HeaderMap $delRows[0] @{
    date = "Delivery date"; intoTankDate = "Date into tanks"; status = "Status"; supplier = "Supplier"; type = "Type";
    qtyKg = "Quantity"; certNo = "Cert no"; flashpoint = "Flash point"; crystallisation = "Crystallisation"; tarAcid = "Tar acid";
    tolueneInsol = "Toluene insol"; naphthalene = "Naphthalene"; bap = "BaP"; water = "Water"; density = "Density";
    dist235 = "Distillation 0-235"; dist300 = "Distillation 0-300"; dist355 = "Distillation 0-355"; orderNo = "Order no";
    transport = "Transport"; stockDate = "Stock date"; outOfSpec = "Out-of-spec"
  } "Deliveries"
  if (-not $delMap.ContainsKey("date")) { throw "Deliveries tab: 'Delivery date' column not found." }

  $numericDel = @("qtyKg","flashpoint","crystallisation","tarAcid","tolueneInsol","naphthalene","bap","water","density","dist235","dist300","dist355")
  $dateDel = @("date","intoTankDate","stockDate")
  $deliveries = New-Object System.Collections.Generic.List[object]
  for ($i = 1; $i -lt $delRows.Count; $i++) {
    $r = $delRows[$i]
    $date = To-IsoDate (Cell $r $delMap "date")
    if (-not $date -or $date -lt $SinceDate) { continue }
    $o = [ordered]@{}
    foreach ($k in $delMap.Keys) {
      $v = Cell $r $delMap $k
      if ($dateDel -contains $k) { $o[$k] = To-IsoDate $v }
      elseif ($numericDel -contains $k) { $o[$k] = To-Num $v }
      else { $o[$k] = if ($null -eq $v) { "" } else { ([string]$v).Trim() } }
    }
    $o["date"] = $date
    $deliveries.Add([pscustomobject]$o)
  }

  # ---------- Daily Log ----------
  $logRows = Read-Sheet "Daily Log" 40
  $logMap = Get-HeaderMap $logRows[0] @{
    date = "Date"; store1Kg = "Store Tank 1"; store2Kg = "Store Tank 2"; work1Kg = "Work Tank 1"; work2Kg = "Work Tank 2";
    totalKg = "Total stock"; deliveredKg = "Delivered since"; usageKg = "Usage since"; workingDays = "Working days";
    usagePerDayKg = "Usage per working day"; ambientC = "Ambient"; correctedKg = "Corrected stock"; idleDays = "Idle working days"
  } "Daily Log"
  if (-not $logMap.ContainsKey("date")) { throw "Daily Log tab: 'Date' column not found." }

  $dailyLog = New-Object System.Collections.Generic.List[object]
  for ($i = 1; $i -lt $logRows.Count; $i++) {
    $r = $logRows[$i]
    $date = To-IsoDate (Cell $r $logMap "date")
    if (-not $date -or $date -lt $SinceDate) { continue }
    # Skip pre-filled formula rows with no tank readings yet.
    if ($null -eq (Cell $r $logMap "store1Kg") -and $null -eq (Cell $r $logMap "totalKg")) { continue }
    $o = [ordered]@{ date = $date }
    foreach ($k in $logMap.Keys) { if ($k -ne "date") { $o[$k] = To-Num (Cell $r $logMap $k) } }
    $dailyLog.Add([pscustomobject]$o)
  }
  $zip.Dispose(); $mem.Dispose()

  $withCert = @($deliveries | Where-Object { $_.certNo }).Count
  $lastDel = if ($deliveries.Count) { $deliveries[$deliveries.Count - 1] } else { $null }
  $lastLog = if ($dailyLog.Count) { $dailyLog[$dailyLog.Count - 1] } else { $null }
  Write-Host ("{0} Read workbook: {1} deliveries ({2} with CoA), {3} tank readings since {4}." -f (Get-Date -Format s), $deliveries.Count, $withCert, $dailyLog.Count, $SinceDate)
  if ($lastDel) { Write-Host ("  Latest delivery: {0} {1} {2} kg, FP {3}" -f $lastDel.date, $lastDel.certNo, $lastDel.qtyKg, $lastDel.flashpoint) }
  if ($lastLog) { Write-Host ("  Latest reading:  {0} total {1} kg, usage {2} kg" -f $lastLog.date, $lastLog.totalKg, $lastLog.usageKg) }

  if ($DryRun) { Write-Host "Dry run - nothing sent."; Stop-Log; exit 0 }

  $payload = [ordered]@{
    fileName = $item.Name
    fileModifiedAt = $item.LastWriteTimeUtc.ToString("o")
    sinceDate = $SinceDate
    deliveries = @($deliveries.ToArray())
    dailyLog = @($dailyLog.ToArray())
  }
  $json = $payload | ConvertTo-Json -Depth 5 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $uri = $ServiceUrl.TrimEnd('/') + "/api/imports/creosote/xlsx-sync"

  # Render's free tier sleeps; retry while it wakes up.
  $result = $null
  for ($attempt = 1; $attempt -le 4; $attempt++) {
    try {
      $result = Invoke-RestMethod -Uri $uri -Method Post -Body $bytes -ContentType "application/json; charset=utf-8" `
        -Headers @{ "X-Import-Api-Key" = $ImportApiKey } -TimeoutSec 120
      break
    } catch {
      $code = $null; if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
      if ($code -eq 401) { throw "Render rejected the import key (401). Check it matches CARBON_IMPORT_API_KEY in the Render dashboard." }
      if ($attempt -eq 4) { throw }
      Write-Warning "Post attempt $attempt failed ($($_.Exception.Message)); retrying in 20 s."
      Start-Sleep -Seconds 20
    }
  }
  Write-Host ("{0} {1}" -f (Get-Date -Format s), $result.summary)
  if ($StateFile) { Set-Content -Path $StateFile -Value $fileStamp }
  Stop-Log
  exit 0
}
catch {
  Write-Host ("{0} SYNC FAILED: {1}" -f (Get-Date -Format s), $_.Exception.Message)
  Stop-Log
  exit 1
}
