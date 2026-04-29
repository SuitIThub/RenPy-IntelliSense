# Build script for creating a VSIX package
# Run from the project root: .\scripts\build-vsix.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

Push-Location $ProjectRoot
try {
    Write-Host "==> Installing dependencies..." -ForegroundColor Cyan
    pnpm install
    if ($LASTEXITCODE -ne 0) { throw "pnpm install failed" }

    Write-Host "==> Compiling all packages..." -ForegroundColor Cyan
    pnpm run compile
    if ($LASTEXITCODE -ne 0) { throw "Compilation failed" }

    Write-Host "==> Copying doc-index.json to server..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Force -Path "packages/server/out/data" | Out-Null
    Copy-Item "data/doc-index.json" "packages/server/out/data/"

    Write-Host "==> Bundling server into client package..." -ForegroundColor Cyan
    # Clean previous bundle
    if (Test-Path "packages/client/server") {
        Remove-Item -Recurse -Force "packages/client/server"
    }

    # Copy server output
    New-Item -ItemType Directory -Force -Path "packages/client/server/out" | Out-Null
    Copy-Item -Recurse "packages/server/out/*" "packages/client/server/out/"

    # Copy shared package (server dependency)
    New-Item -ItemType Directory -Force -Path "packages/client/server/node_modules/@renpy-intellisense/shared/out" | Out-Null
    Copy-Item -Recurse "packages/shared/out/*" "packages/client/server/node_modules/@renpy-intellisense/shared/out/"
    Copy-Item "packages/shared/package.json" "packages/client/server/node_modules/@renpy-intellisense/shared/"

    # Copy server runtime dependencies
    if (Test-Path "packages/server/node_modules") {
        Copy-Item -Recurse "packages/server/node_modules/*" "packages/client/server/node_modules/" -ErrorAction SilentlyContinue
    }

    Write-Host "==> Installing client dependencies for bundling..." -ForegroundColor Cyan
    # Install client dependencies with npm (not pnpm) so they're in a standard node_modules structure
    Push-Location "packages/client"
    try {
        # Remove pnpm-based node_modules to avoid conflicts
        if (Test-Path "node_modules") {
            Remove-Item -Recurse -Force "node_modules"
        }
        # Remove package-lock.json to start fresh
        if (Test-Path "package-lock.json") {
            Remove-Item -Force "package-lock.json"
        }
        # Install with npm - this creates package-lock.json and proper node_modules
        npm install --omit=dev --ignore-scripts
        if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
    } finally {
        Pop-Location
    }

    Write-Host "==> Verifying client dependencies..." -ForegroundColor Cyan
    if (-not (Test-Path "packages/client/node_modules/vscode-languageclient")) {
        throw "vscode-languageclient not found in packages/client/node_modules!"
    }
    Write-Host "    vscode-languageclient found" -ForegroundColor Green

    Write-Host "==> Packaging VSIX..." -ForegroundColor Cyan
    Push-Location "packages/client"
    try {
        npx --yes @vscode/vsce package --out "../../extension.vsix"
        if ($LASTEXITCODE -ne 0) { throw "VSIX packaging failed" }
    } finally {
        Pop-Location
    }

    Write-Host ""
    Write-Host "Success! VSIX created at: $ProjectRoot\extension.vsix" -ForegroundColor Green
    Write-Host "Install with: code --install-extension extension.vsix" -ForegroundColor Yellow
} finally {
    Pop-Location
}
