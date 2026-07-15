# One-off: create the Bettor Value & Growth feature issues (OB-150..OB-159)
# from docs/PROD-READINESS-BACKLOG.md. Idempotent: skips titles that already exist.
[CmdletBinding()]
param(
  [string]$Repo = 'CognitronTechnologies/overlay',
  [string]$ProjectOwner = 'CognitronTechnologies',
  [string]$ProjectTitle = 'Ship Overlay Bets V1',
  [string]$BacklogPath = "$PSScriptRoot/../docs/PROD-READINESS-BACKLOG.md",
  [int]$MinId = 150,
  [int]$MaxId = 159,
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'

function Get-GhPath {
  $cmd = Get-Command gh -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $fallback = "C:\Program Files\GitHub CLI\gh.exe"
  if (Test-Path $fallback) { return $fallback }
  throw "GitHub CLI (gh) not found."
}
$gh = Get-GhPath

$areaMap = @{
  'User UI' = 'area:ui-user'; 'Sports Data' = 'area:settlement'; 'Tools' = 'area:tools'
  'Stats' = 'area:stats'; 'Content' = 'area:content'; 'Legal' = 'area:legal'
  'Growth' = 'area:growth'; 'Notifications' = 'area:notifications'; 'Reporting' = 'area:reporting'
}
$labelColors = @{ 'priority:P0' = 'b60205'; 'priority:P1' = 'd93f0b'; 'priority:P2' = 'fbca04' }
$areaColor = '0e8a16'

# --- Parse backlog, keep only OB-<MinId..MaxId> ---
$lines = Get-Content -LiteralPath $BacklogPath
$issues = @(); $cur = $null
foreach ($line in $lines) {
  if ($line -match '^###\s+(OB-\d+)\s+—\s+(.+?)\s*$') {
    if ($cur) { $issues += $cur }
    $cur = [pscustomobject]@{ Id = $Matches[1]; Title = "$($Matches[1]) — $($Matches[2])"; Body = New-Object System.Collections.Generic.List[string]; Category = $null; Priority = $null }
    continue
  }
  if ($line -match '^##\s') { if ($cur) { $issues += $cur; $cur = $null }; continue }
  if ($cur) {
    if ($line -match '^\*\*Category:\*\*\s*(.+?)\s*·\s*\*\*Priority:\*\*\s*(P\d)') {
      $cur.Category = $Matches[1].Trim(); $cur.Priority = $Matches[2].Trim()
    }
    $cur.Body.Add($line)
  }
}
if ($cur) { $issues += $cur }

$issues = $issues | Where-Object {
  $_.Id -match '^OB-(\d+)$' -and [int]$Matches[1] -ge $MinId -and [int]$Matches[1] -le $MaxId
}
Write-Host "Selected $($issues.Count) issues (OB-$MinId..OB-$MaxId)." -ForegroundColor Cyan
if ($issues.Count -eq 0) { throw "No issues parsed in range." }

# --- Ensure labels ---
$needed = @{}
foreach ($p in $labelColors.Keys) { $needed[$p] = $labelColors[$p] }
foreach ($a in ($areaMap.Values | Select-Object -Unique)) { $needed[$a] = $areaColor }
if (-not $DryRun) {
  foreach ($name in $needed.Keys) { & $gh label create $name --repo $Repo --color $needed[$name] --force 2>$null | Out-Null }
}

# --- Resolve project ---
$projectNumber = $null
if (-not $DryRun) {
  $projJson = & $gh project list --owner $ProjectOwner --format json 2>$null | ConvertFrom-Json
  $match = $projJson.projects | Where-Object { $_.title -eq $ProjectTitle } | Select-Object -First 1
  if ($match) { $projectNumber = $match.number; Write-Host "Project '$ProjectTitle' = #$projectNumber" -ForegroundColor Cyan }
  else { Write-Warning "Project '$ProjectTitle' not found; issues created without project." }
}

# --- Existing titles (abort on fetch failure to avoid dupes) ---
$existingTitles = @()
if (-not $DryRun) {
  $existingRaw = & $gh issue list --repo $Repo --state all --limit 500 --json title 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Failed to fetch existing issues. Aborting.`n$existingRaw" }
  $existingTitles = ($existingRaw | ConvertFrom-Json).title
}

$created = 0; $skipped = 0
foreach ($issue in $issues) {
  $labels = @()
  if ($issue.Priority) { $labels += "priority:$($issue.Priority)" }
  if ($issue.Category -and $areaMap.ContainsKey($issue.Category)) { $labels += $areaMap[$issue.Category] }
  $labels += 'type:feature'
  $body = ($issue.Body -join "`n").Trim()

  if ($DryRun) { Write-Host "[dry-run] $($issue.Title)  [$($labels -join ', ')]"; continue }
  if ($existingTitles -contains $issue.Title) { Write-Host "skip (exists): $($issue.Title)" -ForegroundColor DarkGray; $skipped++; continue }

  $labelArgs = @(); foreach ($l in $labels) { $labelArgs += @('--label', $l) }
  & $gh label create 'type:feature' --repo $Repo --color 'a2eeef' --force 2>$null | Out-Null
  $url = & $gh issue create --repo $Repo --title $issue.Title --body $body @labelArgs 2>&1 | Select-Object -Last 1
  if ($LASTEXITCODE -ne 0 -or $url -notmatch 'https://github.com/') { Write-Warning "Failed: $($issue.Title) -> $url"; continue }
  Write-Host "created: $url" -ForegroundColor Green
  $created++
  if ($projectNumber) { & $gh project item-add $projectNumber --owner $ProjectOwner --url $url 2>$null | Out-Null }
}
Write-Host "`nDone. Created $created, skipped $skipped." -ForegroundColor Cyan
