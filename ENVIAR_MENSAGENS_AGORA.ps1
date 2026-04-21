# =====================================================
# ENVIAR MENSAGENS WHATSAPP AGORA
# =====================================================
# Este script executa a Edge Function manualmente
# para processar e enviar todas as mensagens PENDING
# =====================================================

$SUPABASE_URL = if ($env:SUPABASE_URL) { $env:SUPABASE_URL } else { "https://ocawpokndruxakzmhzsa.supabase.co" }
$FUNCTION_NAME = "whatsapp-message-scheduler"

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  ENVIAR MENSAGENS WHATSAPP AGORA" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Verificar se a SERVICE_ROLE_KEY está definida
if (-not $env:SUPABASE_SERVICE_ROLE_KEY) {
    Write-Host "❌ ERRO: Variável SUPABASE_SERVICE_ROLE_KEY não definida" -ForegroundColor Red
    Write-Host ""
    Write-Host "Para definir a chave, execute:" -ForegroundColor Yellow
    Write-Host '  $env:SUPABASE_SERVICE_ROLE_KEY="sua-chave-aqui"' -ForegroundColor White
    Write-Host ""
    Write-Host "Ou adicione no início deste script:" -ForegroundColor Yellow
    Write-Host '  $env:SUPABASE_SERVICE_ROLE_KEY="sua-chave-aqui"' -ForegroundColor White
    Write-Host ""
    exit 1
}

Write-Host "🚀 Executando função $FUNCTION_NAME..." -ForegroundColor Cyan
Write-Host "   URL: ${SUPABASE_URL}/functions/v1/${FUNCTION_NAME}" -ForegroundColor Gray
Write-Host ""

$headers = @{
    "Authorization" = "Bearer $env:SUPABASE_SERVICE_ROLE_KEY"
    "Content-Type" = "application/json"
}

$body = @{} | ConvertTo-Json

try {
    Write-Host "⏳ Enviando requisição..." -ForegroundColor Yellow
    
    $response = Invoke-RestMethod -Uri "${SUPABASE_URL}/functions/v1/${FUNCTION_NAME}" `
        -Method Post `
        -Headers $headers `
        -Body $body `
        -ContentType "application/json"
    
    Write-Host ""
    Write-Host "✅ Função executada com sucesso!" -ForegroundColor Green
    Write-Host ""
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host "  RESULTADO:" -ForegroundColor Cyan
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host ""
    
    $response | ConvertTo-Json -Depth 10 | Write-Host
    
    Write-Host ""
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host "  PRÓXIMOS PASSOS:" -ForegroundColor Cyan
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "1. Verifique os logs no Supabase Dashboard:" -ForegroundColor Yellow
    Write-Host "   Edge Functions → whatsapp-message-scheduler → Logs" -ForegroundColor White
    Write-Host ""
    Write-Host "2. Verifique a tabela message_send_log:" -ForegroundColor Yellow
    Write-Host "   SELECT * FROM message_send_log WHERE appointment_id = 'e84f26c7-7d14-4a9b-97be-bb01b1235557';" -ForegroundColor White
    Write-Host ""
    Write-Host "3. Se as mensagens foram enviadas, o status será 'SENT'" -ForegroundColor Green
    Write-Host "   Se falharam, o status será 'FAILED' e haverá detalhes em provider_response" -ForegroundColor Red
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "❌ ERRO na execução:" -ForegroundColor Red
    Write-Host ""
    Write-Host "Mensagem:" -ForegroundColor Yellow
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    
    if ($_.ErrorDetails.Message) {
        Write-Host "Detalhes:" -ForegroundColor Yellow
        Write-Host $_.ErrorDetails.Message -ForegroundColor Red
        Write-Host ""
    }
    
    Write-Host "Verifique:" -ForegroundColor Yellow
    Write-Host "  - Se a SERVICE_ROLE_KEY está correta" -ForegroundColor White
    Write-Host "  - Se a Edge Function está deployada" -ForegroundColor White
    Write-Host "  - Se há conexão com a internet" -ForegroundColor White
    Write-Host ""
    exit 1
}





















