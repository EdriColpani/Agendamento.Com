Write-Host "========================================" -ForegroundColor Cyan
Write-Host "DEPLOY: finalize-appointment-by-collaborator" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$functionPath = "supabase\functions\finalize-appointment-by-collaborator\index.ts"

# Verificar se o arquivo existe
if (-not (Test-Path $functionPath)) {
    Write-Host "ERRO: Arquivo nao encontrado!" -ForegroundColor Red
    Write-Host "Procurando: $functionPath" -ForegroundColor Red
    Read-Host "Pressione Enter para sair"
    exit 1
}

Write-Host "[1/3] Lendo codigo..." -ForegroundColor Yellow
$code = Get-Content $functionPath -Raw

Write-Host "[2/3] Copiando codigo para clipboard..." -ForegroundColor Yellow
$code | Set-Clipboard
Write-Host "OK! Codigo copiado para clipboard." -ForegroundColor Green
Write-Host ""

Write-Host "[3/3] Abrindo Supabase Dashboard..." -ForegroundColor Yellow
$projectRef = if ($env:SUPABASE_PROJECT_REF) { $env:SUPABASE_PROJECT_REF } else { "ocawpokndruxakzmhzsa" }
Start-Process "https://supabase.com/dashboard/project/$projectRef/functions/finalize-appointment-by-collaborator"
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "INSTRUCOES:" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. No Supabase Dashboard, clique no editor de codigo" -ForegroundColor White
Write-Host "2. Selecione TODO o codigo (Ctrl+A)" -ForegroundColor White
Write-Host "3. Cole o novo codigo (Ctrl+V) - ja esta no clipboard!" -ForegroundColor White
Write-Host "4. Clique em 'Deploy' ou 'Save'" -ForegroundColor White
Write-Host "5. Aguarde a confirmacao" -ForegroundColor White
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PRONTO! Codigo copiado e dashboard aberto." -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Read-Host "Pressione Enter para sair"

