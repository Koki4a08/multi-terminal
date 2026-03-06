param(
    [string]$WikiRepoUrl = "https://github.com/Koki4a08/multi-terminal.wiki.git",
    [string]$TargetDir = "..\\multi-terminal.wiki"
)

$ErrorActionPreference = "Stop"

$sourceDir = Join-Path $PSScriptRoot "..\\wiki"
$resolvedSourceDir = (Resolve-Path $sourceDir).Path
$resolvedTargetDir = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot $TargetDir))

if (-not (Test-Path $resolvedSourceDir)) {
    throw "Wiki source folder not found: $resolvedSourceDir"
}

if (-not (Test-Path $resolvedTargetDir)) {
    git clone $WikiRepoUrl $resolvedTargetDir
} elseif (-not (Test-Path (Join-Path $resolvedTargetDir ".git"))) {
    throw "Target directory exists but is not a git repository: $resolvedTargetDir"
}

Push-Location $resolvedTargetDir
try {
    git fetch origin
    $currentBranch = git branch --show-current
    if (-not $currentBranch) {
        git checkout -b master
    } else {
        git pull --ff-only origin $currentBranch
    }

    Get-ChildItem -Path $resolvedSourceDir -File -Filter *.md | ForEach-Object {
        Copy-Item $_.FullName -Destination (Join-Path $resolvedTargetDir $_.Name) -Force
    }

    git status --short
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "Wiki repository synced locally at: $resolvedTargetDir"
Write-Host "Review changes there, then commit and push."
