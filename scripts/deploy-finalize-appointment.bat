@echo off
echo ========================================
echo DEPLOY: finalize-appointment-by-collaborator
echo ========================================
echo.

REM Verificar se o arquivo existe
if not exist "supabase\functions\finalize-appointment-by-collaborator\index.ts" (
    echo ERRO: Arquivo nao encontrado!
    echo Procurando: supabase\functions\finalize-appointment-by-collaborator\index.ts
    pause
    exit /b 1
)

echo [1/3] Copiando codigo para clipboard...
type "supabase\functions\finalize-appointment-by-collaborator\index.ts" | clip
echo OK! Codigo copiado para clipboard.
echo.

echo [2/3] Abrindo Supabase Dashboard...
if "%SUPABASE_PROJECT_REF%"=="" set SUPABASE_PROJECT_REF=ocawpokndruxakzmhzsa
start https://supabase.com/dashboard/project/%SUPABASE_PROJECT_REF%/functions/finalize-appointment-by-collaborator
echo.

echo [3/3] INSTRUCOES:
echo.
echo 1. No Supabase Dashboard, clique no editor de codigo
echo 2. Selecione TODO o codigo (Ctrl+A)
echo 3. Cole o novo codigo (Ctrl+V) - ja esta no clipboard!
echo 4. Clique em "Deploy" ou "Save"
echo 5. Aguarde a confirmacao
echo.
echo ========================================
echo PRONTO! Codigo copiado e dashboard aberto.
echo ========================================
pause

