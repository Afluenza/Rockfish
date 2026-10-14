# Rockfish setup for Windows (PowerShell).
# Downloads the Stockfish 18.0.8 engine from the official npm package,
# checks the SHA-256 hash of each file, and places the files in engine\.
# Safe to run more than once: files that already match are left alone.

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

$Version = '18.0.8'
$TarballUrl = if ($env:ROCKFISH_TARBALL_URL) { $env:ROCKFISH_TARBALL_URL } else { "https://registry.npmjs.org/stockfish/-/stockfish-$Version.tgz" }

$Expected = @{
  'engine\stockfish-18-lite-single.js'   = '5243fd9b276cab7dfe3ad1d43ab9ead73568fac76468c614242977a210c4a391'
  'engine\stockfish-18-lite-single.wasm' = 'a8fbc05ec6920b56d7485826dcb02c5ffd2826bcbf751cf973046f237a9096f1'
  'engine\LICENSE-stockfish.txt'         = '0b383d5a63da644f628d99c33976ea6487ed89aaa59f0b3257992deac1171e6b'
}

function Test-EngineFiles {
  foreach ($file in $Expected.Keys) {
    if (-not (Test-Path $file)) { return $false }
    $hash = (Get-FileHash -Algorithm SHA256 -Path $file).Hash.ToLower()
    if ($hash -ne $Expected[$file]) { return $false }
  }
  return $true
}

Write-Host 'Rockfish setup'
Write-Host ''

if (Test-EngineFiles) {
  Write-Host 'Engine files are already in place and verified. Nothing to download.'
} else {
  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ('rockfish-' + [guid]::NewGuid())
  New-Item -ItemType Directory -Path $tmp | Out-Null
  try {
    Write-Host "Downloading Stockfish $Version from the official npm package..."
    $tgz = Join-Path $tmp 'stockfish.tgz'
    Invoke-WebRequest -Uri $TarballUrl -OutFile $tgz -UseBasicParsing
    # tar.exe ships with Windows 10 and later.
    tar -xzf $tgz -C $tmp

    New-Item -ItemType Directory -Force -Path 'engine' | Out-Null
    Copy-Item (Join-Path $tmp 'package\bin\stockfish-18-lite-single.js') 'engine\' -Force
    Copy-Item (Join-Path $tmp 'package\bin\stockfish-18-lite-single.wasm') 'engine\' -Force
    Copy-Item (Join-Path $tmp 'package\Copying.txt') 'engine\LICENSE-stockfish.txt' -Force

    Write-Host 'Checking file hashes...'
    if (-not (Test-EngineFiles)) {
      Remove-Item 'engine\stockfish-18-lite-single.js', 'engine\stockfish-18-lite-single.wasm', 'engine\LICENSE-stockfish.txt' -ErrorAction SilentlyContinue
      throw 'A downloaded file did not match its expected SHA-256 hash. The engine files were removed. Try again, or add them by hand (see README).'
    }
    Write-Host 'Engine files installed and verified.'
  } finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  }
}

Write-Host ''
if (-not (Test-Path 'assets\king.png')) {
  throw 'assets\king.png is missing. Rockfish needs this icon to load. Copy it from the Rockfish download, then run setup again.'
}

Write-Host 'Setup complete. Next steps:'
Write-Host '  1. Open chrome://extensions (Opera: opera://extensions).'
Write-Host '  2. Turn on Developer mode.'
Write-Host '  3. Click Load unpacked and choose this folder:'
Write-Host "     $PSScriptRoot"
