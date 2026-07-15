# Creates GitHub issues from docs/PROD-READINESS-BACKLOG.md and adds them to a
# GitHub Project. Idempotent-ish: skips creating an issue whose exact title
# already exists in the repo.
#
# Prereqs: `gh auth login` completed with scopes: repo, project (read:project).
# Usage:
#   pwsh scripts/create-issues.ps1 -Repo CognitronTechnologies/overlay `
#        -ProjectOwner CognitronTechnologies -ProjectTitle "Ship Overlay Bets V1"
#   Add -DryRun to preview without creating anything.

[CmdletBinding()]
param(
  [string]$Repo = 'CognitronTechnologies/overlay',
  [string]$ProjectOwner = 'CognitronTechnologies',
  [string]$ProjectTitle = 'Ship Overlay Bets V1',
  [string]$BacklogPath = "$PSScriptRoot/../docs/PROD-READINESS-BACKLOG.md",
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

# --- Explicit exclusion: the 40 issues already created in the first run. ---
# Belt-and-suspenders on top of the existing-title check, so these are NEVER
# recreated even if the network fetch is unreliable.
$ExcludeIds = @(
  'OB-001','OB-002','OB-003','OB-004','OB-005','OB-006','OB-007',
  'OB-010','OB-011','OB-012','OB-013','OB-014','OB-015','OB-016',
  'OB-020','OB-021','OB-022','OB-023','OB-024',
  'OB-025','OB-026','OB-027','OB-028','OB-029',
  'OB-035','OB-036','OB-037','OB-038',
  'OB-045','OB-046','OB-047','OB-048','OB-049',
  'OB-055','OB-056','OB-057',
  'OB-060','OB-061','OB-062','OB-063'
)

function Get-GhPath {
  $cmd = Get-Command gh -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $fallback = "C:\Program Files\GitHub CLI\gh.exe"
  if (Test-Path $fallback) { return $fallback }
  throw "GitHub CLI (gh) not found. Install it and re-run."
}
$gh = Get-GhPath

# --- Category -> area label slug ------------------------------------------
$areaMap = @{
  'Auth'          = 'area:auth'
  'User UI'       = 'area:ui-user'
  'Tipster UI'    = 'area:ui-tipster'
  'Admin UI'      = 'area:ui-admin'
  'Integrity'     = 'area:integrity'
  'Sports Data'   = 'area:settlement'
  'Stats'         = 'area:stats'
  'Payments'      = 'area:payments'
  'Payouts'       = 'area:payouts'
  'Notifications' = 'area:notifications'
  'SEO'           = 'area:content'
  'Content'       = 'area:content'
  'Security'      = 'area:security'
  'Compliance'    = 'area:security'
  'Observability' = 'area:observability'
  'Ops'           = 'area:observability'
  'Infra'         = 'area:infra'
  'Testing'       = 'area:testing'
  'Database'      = 'area:database'
  'Performance'   = 'area:performance'
  'Legal'         = 'area:legal'
  'Tools'         = 'area:tools'
  'Growth'        = 'area:growth'
  'Reporting'     = 'area:reporting'
}
$labelColors = @{
  'priority:P0' = 'b60205'; 'priority:P1' = 'd93f0b'; 'priority:P2' = 'fbca04'
}
$areaColor = '0e8a16'

# --- Parse backlog into issues --------------------------------------------
$lines = Get-Content -LiteralPath $BacklogPath
$issues = @()
$cur = $null
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

Write-Host "Parsed $($issues.Count) issues from backlog." -ForegroundColor Cyan
if ($issues.Count -eq 0) { throw "No issues parsed — check backlog format." }

# --- Ensure labels exist ---------------------------------------------------
$neededLabels = @{}
foreach ($p in $labelColors.Keys) { $neededLabels[$p] = $labelColors[$p] }
foreach ($a in ($areaMap.Values | Select-Object -Unique)) { $neededLabels[$a] = $areaColor }

if (-not $DryRun) {
  foreach ($name in $neededLabels.Keys) {
    & $gh label create $name --repo $Repo --color $neededLabels[$name] --force 2>$null | Out-Null
  }
  Write-Host "Ensured $($neededLabels.Count) labels." -ForegroundColor Cyan
}

# --- Resolve project number ------------------------------------------------
$projectNumber = $null
if (-not $DryRun) {
  $projJson = & $gh project list --owner $ProjectOwner --format json 2>$null | ConvertFrom-Json
  $match = $projJson.projects | Where-Object { $_.title -eq $ProjectTitle } | Select-Object -First 1
  if ($match) { $projectNumber = $match.number; Write-Host "Project '$ProjectTitle' = #$projectNumber" -ForegroundColor Cyan }
  else { Write-Warning "Project '$ProjectTitle' not found for owner '$ProjectOwner'. Issues will be created but NOT added to a project." }
}

# --- Existing titles (skip duplicates) ------------------------------------
# CRITICAL: if this fetch fails (e.g. network blip), ABORT rather than treat an
# empty result as "nothing exists" — otherwise we mass-create duplicates.
$existingTitles = @()
if (-not $DryRun) {
  $existingRaw = & $gh issue list --repo $Repo --state all --limit 500 --json title 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to fetch existing issues (network?). Aborting to avoid duplicates.`n$existingRaw"
  }
  $existingTitles = ($existingRaw | ConvertFrom-Json).title
}

# --- Create issues ---------------------------------------------------------
$created = 0; $skipped = 0
foreach ($issue in $issues) {
  $labels = @()
  if ($issue.Priority) { $labels += "priority:$($issue.Priority)" }
  if ($issue.Category -and $areaMap.ContainsKey($issue.Category)) { $labels += $areaMap[$issue.Category] }

  $body = ($issue.Body -join "`n").Trim()

  if ($ExcludeIds -contains $issue.Id) {
    Write-Host "skip (excluded): $($issue.Title)" -ForegroundColor DarkGray
    $skipped++; continue
  }
  if ($DryRun) {
    Write-Host "[dry-run] $($issue.Title)  [$($labels -join ', ')]"
    continue
  }
  if ($existingTitles -contains $issue.Title) {
    Write-Host "skip (exists): $($issue.Title)" -ForegroundColor DarkGray
    $skipped++; continue
  }

  $labelArgs = @(); foreach ($l in $labels) { $labelArgs += @('--label', $l) }
  $url = & $gh issue create --repo $Repo --title $issue.Title --body $body @labelArgs 2>&1 | Select-Object -Last 1

  if ($LASTEXITCODE -ne 0 -or $url -notmatch 'https://github.com/') {
    Write-Warning "Failed to create: $($issue.Title) -> $url"; continue
  }
  Write-Host "created: $($issue.Title)" -ForegroundColor Green
  $created++

  if ($projectNumber) {
    & $gh project item-add $projectNumber --owner $ProjectOwner --url $url 2>$null | Out-Null
  }
}

Write-Host "`nDone. Created $created, skipped $skipped." -ForegroundColor Cyan
