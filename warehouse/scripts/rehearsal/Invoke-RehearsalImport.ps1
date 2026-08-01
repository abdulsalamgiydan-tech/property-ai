<#
.SYNOPSIS
  Secure interactive runner for a warehouse rehearsal snapshot import +
  verify (Sprint 18.3, Part 1).

.DESCRIPTION
  Prompts for the rehearsal branch's Postgres password using a hidden
  SecureString prompt, converts it only transiently in process memory,
  and passes it to the child `node` process solely via a process-scoped
  PGPASSWORD environment variable (which `node warehouse/scripts/snapshot/
  {import,verify}.mjs --target-pg-env` reads directly through `pg`'s own
  standard libpq env var support -- see lib.mjs#resolveTarget).

  The password is never:
    - written to a file (including .env.local)
    - passed as a command-line argument
    - left in shell history (Read-Host is an interactive prompt, not a
      command-line value)
    - committed (this script contains no secret)
    - printed or logged (only the non-secret host/ref/port/database are)

  PGPASSWORD and the other PG* env vars this script sets are removed in a
  finally block regardless of success or failure, and the SecureString's
  unmanaged buffer is explicitly zeroed immediately after conversion.

  Refuses to run against the Production project ref
  (oshquaxsloolqucwvigc) under any circumstance.

.PARAMETER BranchRef
  The disposable Supabase branch's project ref (e.g. from `list_branches`
  or the branch name shown in the dashboard). Never Production.

.PARAMETER PgHost
  Optional override for the Postgres host. Defaults to
  db.<BranchRef>.supabase.co (the direct-host pattern; the shared pooler
  can lag behind a just-reset branch password -- see project memory).

.PARAMETER SnapshotId
  The frozen snapshot ID to import. Defaults to the one currently frozen
  for Sprint 18.2/18.3.

.EXAMPLE
  .\warehouse\scripts\rehearsal\Invoke-RehearsalImport.ps1 -BranchRef gzjmteznukcwvdakximu
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$BranchRef,

    [string]$PgHost,
    [int]$Port = 5432,
    [string]$DbUser = "postgres",
    [string]$Database = "postgres",
    [string]$SnapshotId = "wh-snap-2026-07-31-ed76873c-min21"
)

$ErrorActionPreference = "Stop"
$ProdRef = "oshquaxsloolqucwvigc"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path

if ($BranchRef -eq $ProdRef) {
    Write-Error "Refusing to target the Production project ref ($ProdRef). This runner is for disposable rehearsal branches only."
    exit 1
}
if (-not $PgHost) {
    $PgHost = "db.$BranchRef.supabase.co"
}
if ($PgHost.Contains($ProdRef)) {
    Write-Error "Refusing to target a host referencing the Production project ref ($ProdRef)."
    exit 1
}

Write-Host "=== Warehouse rehearsal import runner ===" -ForegroundColor Cyan
Write-Host "Branch ref   : $BranchRef"
Write-Host "Host         : $PgHost"
Write-Host "Port         : $Port"
Write-Host "Database     : $Database"
Write-Host "User         : $DbUser"
Write-Host "Snapshot ID  : $SnapshotId"
Write-Host "Repo root    : $RepoRoot"
Write-Host ""
Write-Host "The password you enter is never displayed, printed, logged, or written to disk." -ForegroundColor Yellow

$secure = Read-Host -Prompt "Enter the rehearsal branch DB password" -AsSecureString

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

    Push-Location $RepoRoot
    try {
        Write-Host ""
        Write-Host "--- Running warehouse:snapshot:import ---" -ForegroundColor Cyan
        node warehouse/scripts/snapshot/import.mjs --snapshot-id=$SnapshotId --target-pg-env --target-label="$BranchRef (rehearsal)"
        $importExit = $LASTEXITCODE

        if ($importExit -eq 0) {
            Write-Host ""
            Write-Host "--- Running warehouse:snapshot:verify ---" -ForegroundColor Cyan
            node warehouse/scripts/snapshot/verify.mjs --snapshot-id=$SnapshotId --target-pg-env
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
    # Clear every secret/process-scoped variable this script set, whether
    # the run succeeded or failed -- never leave PGPASSWORD lingering in
    # this shell session's environment.
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:\PGHOST -ErrorAction SilentlyContinue
    Remove-Item Env:\PGPORT -ErrorAction SilentlyContinue
    Remove-Item Env:\PGUSER -ErrorAction SilentlyContinue
    Remove-Item Env:\PGDATABASE -ErrorAction SilentlyContinue
    $plain = $null
    $secure = $null
    [System.GC]::Collect()
}

if ($exitCode -eq 0) {
    Write-Host ""
    Write-Host "Rehearsal import + verify PASSED." -ForegroundColor Green
}
else {
    Write-Host ""
    Write-Host "Rehearsal import + verify FAILED (see output above)." -ForegroundColor Red
}

exit $exitCode
