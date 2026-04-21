# Script PowerShell para testar a API LiotPRO usando curl
# Uso: .\scripts\test-whatsapp-curl.ps1

$SUPABASE_URL = if ($env:SUPABASE_URL) { $env:SUPABASE_URL } else { "https://ocawpokndruxakzmhzsa.supabase.co" }
$SERVICE_ROLE_KEY = $env:SUPABASE_SERVICE_ROLE_KEY

if (-not $SERVICE_ROLE_KEY) {
    Write-Host "❌ Erro: Variável SUPABASE_SERVICE_ROLE_KEY não definida" -ForegroundColor Red
    Write-Host "Defina com: `$env:SUPABASE_SERVICE_ROLE_KEY = 'sua-chave-aqui'" -ForegroundColor Yellow
    exit 1
}

Write-Host "🔍 Buscando provedor ativo no banco de dados...`n" -ForegroundColor Cyan

# Buscar provedor
$headers = @{
    "apikey" = $SERVICE_ROLE_KEY
    "Authorization" = "Bearer $SERVICE_ROLE_KEY"
    "Content-Type" = "application/json"
}

try {
    $providerResponse = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/messaging_providers?channel=eq.WHATSAPP&is_active=eq.true&limit=1" -Method Get -Headers $headers
    
    if ($providerResponse.Count -eq 0) {
        Write-Host "❌ Nenhum provedor WHATSAPP ativo encontrado." -ForegroundColor Red
        exit 1
    }
    
    $provider = $providerResponse[0]
    
    Write-Host "✅ Provedor encontrado:" -ForegroundColor Green
    Write-Host "   Nome: $($provider.name)"
    Write-Host "   URL: $($provider.base_url)"
    Write-Host "   Método: $($provider.http_method)"
    Write-Host "   Auth Key: $($provider.auth_key)`n"
    
    # Preparar payload
    $payload = @{
        body = "Teste via curl PowerShell"
        number = "+5546999151842"
        status = "pending"
        userId = $provider.user_id
        queueId = $provider.queue_id
        closeTicket = $false
        sendSignature = $false
    } | ConvertTo-Json
    
    Write-Host "📤 Enviando requisição via curl...`n" -ForegroundColor Cyan
    Write-Host "URL: $($provider.base_url)"
    Write-Host "Token: $($provider.auth_token.Substring(0, [Math]::Min(30, $provider.auth_token.Length)))..."
    Write-Host "Payload: $payload`n"
    
    # Fazer requisição com curl
    $curlHeaders = @(
        "Authorization: $($provider.auth_token)",
        "Content-Type: application/json"
    )
    
    $response = curl.exe -X POST `
        -H "Authorization: $($provider.auth_token)" `
        -H "Content-Type: application/json" `
        -d $payload `
        --max-time 30 `
        --connect-timeout 15 `
        --verbose `
        $provider.base_url 2>&1
    
    Write-Host "`n📥 Resposta:" -ForegroundColor Cyan
    $response | ForEach-Object { Write-Host $_ }
    
} catch {
    Write-Host "`n❌ Erro: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        Write-Host "Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Yellow
    }
    exit 1
}

