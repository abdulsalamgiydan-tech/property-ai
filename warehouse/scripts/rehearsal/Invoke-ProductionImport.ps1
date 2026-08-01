<#
.SYNOPSIS
  Secure interactive runner for the ONE-TIME Sprint 18 snapshot import +
  verify against the real Production database.

.DESCRIPTION
  This is deliberately a separate script from Invoke-RehearsalImport.ps1,
  which exists specifically to refuse the Production ref outright. This
  script exists specifically to target Production, once, under the
  runbook in warehouse/reports/sprint18_3_final_release_proof.md Part 7
  step 9, after Abdul has explicitly approved executing that runbook.

  Same credential-handling guarantees as the rehearsal runner:
    - Password entered via a hidden Read-Host -AsSecureString prompt.
    - Converted only transiently in process memory (SecureStringToBSTR ->
      PtrToStringBSTR -> immediate ZeroFreeBSTR).
    - Passed to the child `node` process solely via a process-scoped
      PGPASSWORD environment variable (never a file, never a CLI
      argument, never printed or logged).
    - PGPASSWORD and every other PG*/SNAPSHOT_ALLOW_PRODUCTION_TARGET env
      var this script sets are removed in a finally block regardless of
      outcome.

  Additional Production-specific safeguards beyond the rehearsal runner:
    - Requires the operator to type the literal phrase
      "IMPORT TO PRODUCTION" before proceeding -- a script invocation
      alone is not enough for an action this consequential.
    - Sets SNAPSHOT_ALLOW_PRODUCTION_TARGET=true and passes
      --i-acknowledge-production-target explicitly -- this is the double
      opt-in resolveTarget()/assertNotProduction() in lib.mjs require
      specifically to allow a Production target; omitting either leaves
      the tooling refusing Production, as it should by default.
    - Runs import.mjs then verify.mjs against the frozen snapshot ID only
      (not configurable via a stray argument), matching the exact
      approval sentence in the frozen release report.

.PARAMETER SnapshotId
  The frozen snapshot ID to import. Defaults to the one frozen and
  approved for this Sprint 18 launch. Do not change unless a new snapshot
  has been frozen and approved through the same process.

.EXAMPLE
  .\warehouse\scripts\rehearsal\Invoke-ProductionImport.ps1
#>

param(
    [string]$SnapshotId = "wh-snap-2026-07-31-ed76873c-min21"
)

$ErrorActionPreference = "Stop"
$ProdRef = "oshquaxsloolqucwvigc"
$PgHost = "db.$ProdRef.supabase.co"
$Port = 5432
$DbUser = "postgres"
$Database = "postgres"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path

Write-Host "=== PRODUCTION snapshot import runner (Sprint 18 launch) ===" -ForegroundColor Red
Write-Host "This will import $SnapshotId into the REAL Production database." -ForegroundColor Yellow
Write-Host "Host         : $PgHost"
Write-Host "Port         : $Port"
Write-Host "Database     : $Database"
Write-Host "User         : $DbUser"
Write-Host "Snapshot ID  : $SnapshotId"
Write-Host "Repo root    : $RepoRoot"
Write-Host ""
Write-Host "The password you enter is never displayed, printed, logged, or written to disk." -ForegroundColor Yellow
Write-Host ""

$confirmation = Read-Host -Prompt 'Type "IMPORT TO PRODUCTION" (exactly) to proceed'
if ($confirmation -ne "IMPORT TO PRODUCTION") {
    Write-Host "Confirmation text did not match. Aborting -- no changes made." -ForegroundColor Red
    exit 1
}

$secure = Read-Host -Prompt "Enter the Production database password" -AsSecureString

$bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $plain = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
}
finally {
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

$exitCode = 1
try {
    $env:PGHOST = $PgHost
    $env:PGPORT = "$Port"
    $env:PGUSER = $DbUser
    $env:PGDATABASE = $Database
    $env:PGPASSWORD = $plain
    $env:SNAPSHOT_ALLOW_PRODUCTION_TARGET = "true"

    Push-Location $RepoRoot
    try {
        Write-Host ""
        Write-Host "--- Running warehouse:snapshot:import against PRODUCTION ---" -ForegroundColor Red
        node warehouse/scripts/snapshot/import.mjs --snapshot-id=$SnapshotId --target-pg-env --i-acknowledge-production-target --target-label="PRODUCTION"
        $importExit = $LASTEXITCODE

        if ($importExit -eq 0) {
            Write-Host ""
            Write-Host "--- Running warehouse:snapshot:verify against PRODUCTION ---" -ForegroundColor Red
            node warehouse/scripts/snapshot/verify.mjs --snapshot-id=$SnapshotId --target-pg-env --i-acknowledge-production-target
            $verifyExit = $LASTEXITCODE
        }
        else {
            Write-Host "Import failed (exit $importExit) -- skipping verify." -ForegroundColor Red
            $verifyExit = 1
        }

        $exitCode = if ($importExit -eq 0 -and $verifyExit -eq 0) { 0 } else { 1 }
    }
    finally {
        Pop-Location
    }
}
finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:\PGHOST -ErrorAction SilentlyContinue
    Remove-Item Env:\PGPORT -ErrorAction SilentlyContinue
    Remove-Item Env:\PGUSER -ErrorAction SilentlyContinue
    Remove-Item Env:\PGDATABASE -ErrorAction SilentlyContinue
    Remove-Item Env:\SNAPSHOT_ALLOW_PRODUCTION_TARGET -ErrorAction SilentlyContinue
    $plain = $null
    $secure = $null
    [System.GC]::Collect()
}

if ($exitCode -eq 0) {
    Write-Host ""
    Write-Host "PRODUCTION import + verify PASSED." -ForegroundColor Green
}
else {
    Write-Host ""
    Write-Host "PRODUCTION import + verify FAILED (see output above)." -ForegroundColor Red
}

exit $exitCode
