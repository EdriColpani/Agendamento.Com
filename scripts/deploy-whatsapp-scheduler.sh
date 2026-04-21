#!/bin/bash

echo "========================================"
echo "DEPLOY: whatsapp-message-scheduler"
echo "========================================"
echo ""

FUNCTION_PATH="supabase/functions/whatsapp-message-scheduler/index.ts"

# Verificar se o arquivo existe
if [ ! -f "$FUNCTION_PATH" ]; then
    echo "ERRO: Arquivo não encontrado!"
    echo "Procurando: $FUNCTION_PATH"
    exit 1
fi

echo "[1/3] Lendo código..."
CODE=$(cat "$FUNCTION_PATH")

echo "[2/3] Copiando código para clipboard..."

# Detectar sistema operacional
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    echo "$CODE" | pbcopy
    echo "OK! Código copiado para clipboard."
elif command -v xclip &> /dev/null; then
    # Linux com xclip
    echo "$CODE" | xclip -selection clipboard
    echo "OK! Código copiado para clipboard."
elif command -v xsel &> /dev/null; then
    # Linux com xsel
    echo "$CODE" | xsel --clipboard --input
    echo "OK! Código copiado para clipboard."
else
    echo "AVISO: Não foi possível copiar para clipboard automaticamente."
    echo "Por favor, copie manualmente o conteúdo de: $FUNCTION_PATH"
fi

echo ""
echo "[3/3] Abrindo Supabase Dashboard..."

PROJECT_REF="${SUPABASE_PROJECT_REF:-ocawpokndruxakzmhzsa}"
FUNCTION_DASHBOARD_URL="https://supabase.com/dashboard/project/${PROJECT_REF}/functions/whatsapp-message-scheduler"

# Abrir navegador
if [[ "$OSTYPE" == "darwin"* ]]; then
    open "$FUNCTION_DASHBOARD_URL"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    xdg-open "$FUNCTION_DASHBOARD_URL" 2>/dev/null || \
    sensible-browser "$FUNCTION_DASHBOARD_URL" 2>/dev/null || \
    echo "Por favor, abra manualmente: $FUNCTION_DASHBOARD_URL"
else
    echo "Por favor, abra manualmente: $FUNCTION_DASHBOARD_URL"
fi

echo ""
echo "========================================"
echo "INSTRUÇÕES:"
echo "========================================"
echo ""
echo "1. No Supabase Dashboard, clique no editor de código"
echo "2. Selecione TODO o código (Ctrl+A ou Cmd+A)"
echo "3. Cole o novo código (Ctrl+V ou Cmd+V)"
echo "4. Clique em 'Deploy' ou 'Save'"
echo "5. Aguarde a confirmação"
echo ""
echo "========================================"
echo "PRONTO! Código copiado e dashboard aberto."
echo "========================================"

