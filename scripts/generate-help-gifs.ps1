# Generate short looping help GIFs (Windows System.Drawing + ffmpeg).
# Run: npm run gifs:help
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root "assets\gifs"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$ffCandidates = @(
  $env:FFMPEG_PATH,
  "ffmpeg",
  "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.1-full_build\bin\ffmpeg.exe"
) | Where-Object { $_ }

$ff = $null
foreach ($c in $ffCandidates) {
  try {
    if ($c -eq "ffmpeg") {
      $null = & ffmpeg -version 2>$null
      if ($LASTEXITCODE -eq 0) { $ff = "ffmpeg"; break }
    } elseif (Test-Path $c) { $ff = $c; break }
  } catch {}
}
if (-not $ff) { throw "ffmpeg not found" }
Write-Host "ffmpeg: $ff"

$jobs = @(
  @{ name = "home"; hex = "#1c1917"; lines = @("GreekBot Help", "Tap a category", "Stack HellCatCoins", "Cool cats. Cool games.") },
  @{ name = "wallet"; hex = "#b45309"; lines = @("/daily  claim HCC", "/balance  check stack", "/tip  send coins", "/leaderboard  climb") },
  @{ name = "pvp"; hex = "#7f1d1d"; lines = @("Challenge a player", "Accept or Decline", "Buttons lock the duel", "Winner takes the pot") },
  @{ name = "casino"; hex = "#991b1b"; lines = @("/slots  spin reels", "/crash  cash out", "/roulette  pick color", "/highlow  climb cards") },
  @{ name = "inferno"; hex = "#0c0a09"; lines = @("Join Inferno Games", "Host hits Start", "Survive day & night", "Last cat standing") },
  @{ name = "admin"; hex = "#44403c"; lines = @("Need Manage Server", "/admin grant", "/admin bigwin feed", "/admin arenamaster") }
)

function HexColor([string]$hex) {
  $h = $hex.TrimStart("#")
  $r = [Convert]::ToInt32($h.Substring(0, 2), 16)
  $g = [Convert]::ToInt32($h.Substring(2, 2), 16)
  $b = [Convert]::ToInt32($h.Substring(4, 2), 16)
  return [System.Drawing.Color]::FromArgb(255, $r, $g, $b)
}

foreach ($job in $jobs) {
  $tmp = Join-Path $outDir ("_tmp_" + $job.name)
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  $i = 0
  $bg = HexColor $job.hex
  $fg = [System.Drawing.Color]::FromArgb(255, 250, 250, 249)
  $accent = [System.Drawing.Color]::FromArgb(255, 245, 158, 11)
  $font = New-Object System.Drawing.Font "Segoe UI Semibold", 22
  $small = New-Object System.Drawing.Font "Segoe UI", 12
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center

  foreach ($line in $job.lines) {
    $i++
    $bmp = New-Object System.Drawing.Bitmap 480, 270
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear($bg)
    $g.FillRectangle((New-Object System.Drawing.SolidBrush $accent), 0, 0, 480, 6)
    $g.FillRectangle((New-Object System.Drawing.SolidBrush $accent), 0, 264, 480, 6)
    $brush = New-Object System.Drawing.SolidBrush $fg
    $g.DrawString($line, $font, $brush, (New-Object System.Drawing.RectangleF 20, 70, 440, 100), $sf)
    $g.DrawString("GreekBot  ·  HellCatCoins", $small, (New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(180, 250, 250, 249))), (New-Object System.Drawing.RectangleF 20, 200, 440, 40), $sf)
    $frame = Join-Path $tmp ("f{0:D2}.png" -f $i)
    $bmp.Save($frame, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
  }

  $outGif = Join-Path $outDir ($job.name + ".gif")
  & $ff -y -framerate 1 -i (Join-Path $tmp "f%02d.png") -filter_complex "[0:v]split[a][b];[a]palettegen=max_colors=48[p];[b][p]paletteuse=dither=bayer" -loop 0 $outGif
  if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed for $($job.name)" }
  Remove-Item -Recurse -Force $tmp
  Write-Host "wrote $outGif"
}

Write-Host "done"
