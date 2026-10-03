param(
  [string]$Python = "python",
  [Parameter(Mandatory = $true)][string]$Model,
  [string]$TrainFile,
  [string]$OutputDir
)

$ErrorActionPreference = "Stop"
$Project = Split-Path -Parent $PSScriptRoot
if (-not $TrainFile) { $TrainFile = Join-Path $Project "data\processed\soulchat-v1\train.jsonl" }
if (-not $OutputDir) { $OutputDir = Join-Path $Project "training\output\smoke" }
$env:TOKENIZERS_PARALLELISM = "false"
$env:PYTORCH_CUDA_ALLOC_CONF = "expandable_segments:True"

& $Python (Join-Path $Project "scripts\train_qlora.py") `
  --model $Model `
  --train-file $TrainFile `
  --output-dir $OutputDir `
  --max-samples 16 `
  --max-length 256 `
  --max-steps 1 `
  --gradient-accumulation 1

if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
