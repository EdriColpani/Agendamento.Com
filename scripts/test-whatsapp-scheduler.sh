#!/bin/bash

# Script para testar a função whatsapp-message-scheduler
# Uso: ./scripts/test-whatsapp-scheduler.sh

SUPABASE_URL="${SUPABASE_URL:-https://ocawpokndruxakzmhzsa.supabase.co}"
FUNCTION_NAME="whatsapp-message-scheduler"

# Você precisa definir a SERVICE_ROLE_KEY como variável de ambiente
# ou substituir aqui diretamente
if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "❌ Erro: Variável SUPABASE_SERVICE_ROLE_KEY não definida"
    echo "Defina com: export SUPABASE_SERVICE_ROLE_KEY='sua-chave-aqui'"
    exit 1
fi

echo "🚀 Executando função $FUNCTION_NAME..."
echo ""

response=$(curl -s -w "\n%{http_code}" -X POST \
  "${SUPABASE_URL}/functions/v1/${FUNCTION_NAME}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{}')

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

echo "Status HTTP: $http_code"
echo ""
echo "Resposta:"
echo "$body" | jq '.' 2>/dev/null || echo "$body"

if [ "$http_code" -eq 200 ]; then
    echo ""
    echo "✅ Função executada com sucesso!"
else
    echo ""
    echo "❌ Erro na execução (HTTP $http_code)"
fi

