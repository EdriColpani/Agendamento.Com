# Consulta relatório de observabilidade do fluxo de troca de plano.
# Uso:
#   $env:SUPABASE_ANON_KEY="<anon_key>"
#   $env:SUPABASE_USER_ACCESS_TOKEN="<jwt_usuario_com_acesso>"
#   .\scripts\test-subscription-change-report.ps1 -CompanyId "<company_id>" -Days 30

param(
    [Parameter(Mandatory = $true)]
    [string]$CompanyId,

    [Parameter(Mandatory = $false)]
    [int]$Days = 30
)

$SUPABASE_URL = if ($env:SUPABASE_URL) { $env:SUPABASE_URL } else { "https://ocawpokndruxakzmhzsa.supabase.co" }
$FUNCTION_NAME = "get-subscription-change-report"

if (-not $env:SUPABASE_ANON_KEY) {
    Write-Host "Missing SUPABASE_ANON_KEY env var." -ForegroundColor Red
    exit 1
}
if (-not $env:SUPABASE_USER_ACCESS_TOKEN) {
    Write-Host "Missing SUPABASE_USER_ACCESS_TOKEN env var." -ForegroundColor Red
    exit 1
}

$headers = @{
    "apikey" = $env:SUPABASE_ANON_KEY
    "Authorization" = "Bearer $env:SUPABASE_USER_ACCESS_TOKEN"
    "Content-Type" = "application/json"
}

$body = @{
    companyId = $CompanyId
    days = $Days
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod `
        -Uri "${SUPABASE_URL}/functions/v1/${FUNCTION_NAME}" `
        -Method Post `
        -Headers $headers `
        -Body $body `
        -ContentType "application/json"

    Write-Host "Report generated successfully." -ForegroundColor Green
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Report call failed." -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message -ForegroundColor Red
    }
    exit 1
}

