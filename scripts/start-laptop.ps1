$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path ".env")) {
  throw "Missing .env. Copy .env.example to .env and set the Discord and local hosting values first."
}

$dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
$dockerExecutable = $dockerCommand.Source
if (-not $dockerExecutable) {
  $dockerPath = Join-Path $env:ProgramFiles "Docker\Docker\resources\bin\docker.exe"
  if (Test-Path $dockerPath) {
    $dockerExecutable = $dockerPath
  } else {
    throw "Docker Desktop is not installed or not available on PATH."
  }
}

Write-Host "Starting local Postgres and Redis..."
& $dockerExecutable compose up -d postgres redis
if ($LASTEXITCODE -ne 0) {
  throw "Docker Compose could not start the local services."
}

Write-Host "Applying Prisma migrations..."
npm run db:migrate:deploy
if ($LASTEXITCODE -ne 0) {
  throw "Prisma migrations failed."
}

Write-Host "Building Cerberus..."
npm run build
if ($LASTEXITCODE -ne 0) {
  throw "Cerberus build failed."
}

Write-Host "Starting Cerberus. Keep this terminal open."
npm run start:prod
