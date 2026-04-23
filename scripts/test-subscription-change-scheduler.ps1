# Dispara manualmente o scheduler de troca de plano (downgrade agendado).
# Uso:
#   $env:SUPABASE_SERVICE_ROLE_KEY="<service_role_key>"
#   .\scripts\test-subscription-change-scheduler.ps1

$SUPABASE_URL = if ($env:SUPABASE_URL) { $env:SUPABASE_URL } else { "https://ocawpokndruxakzmhzsa.supabase.co" }
$FUNCTION_NAME = "subscription-change-scheduler"

if (-not $env:SUPABASE_SERVICE_ROLE_KEY) {
    Write-Host "Missing SUPABASE_SERVICE_ROLE_KEY env var." -ForegroundColor Red
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $env:SUPABASE_SERVICE_ROLE_KEY"
    "Content-Type" = "application/json"
}

$body = @{
    limit = 200
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod `
        -Uri "${SUPABASE_URL}/functions/v1/${FUNCTION_NAME}" `
        -Method Post `
        -Headers $headers `
        -Body $body `
        -ContentType "application/json"

    Write-Host "Scheduler executed successfully." -ForegroundColor Green
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Scheduler call failed." -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message -ForegroundColor Red
    }
    exit 1
}

