$ErrorActionPreference = "Stop"

$port = if ($env:PORT) { $env:PORT } else { "8787" }
$cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue

if (-not $cloudflared) {
  throw "cloudflared is not installed or not available on PATH."
}

Write-Host "Exposing http://localhost:$port through a Cloudflare Quick Tunnel."
Write-Host "Copy the generated https:// URL and append /public/live-state in Railway."
Write-Host "Keep this terminal open while the website needs the live feed."

& $cloudflared.Source tunnel --url "http://127.0.0.1:$port"
