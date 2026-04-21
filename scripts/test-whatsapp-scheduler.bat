@echo off
REM Script Batch para testar a função whatsapp-message-scheduler
REM Uso: scripts\test-whatsapp-scheduler.bat

if "%SUPABASE_URL%"=="" set SUPABASE_URL=https://ocawpokndruxakzmhzsa.supabase.co
set FUNCTION_NAME=whatsapp-message-scheduler

REM Você precisa definir a SERVICE_ROLE_KEY como variável de ambiente
REM ou substituir aqui diretamente
if "%SUPABASE_SERVICE_ROLE_KEY%"=="" (
    echo ❌ Erro: Variável SUPABASE_SERVICE_ROLE_KEY não definida
    echo Defina com: set SUPABASE_SERVICE_ROLE_KEY=sua-chave-aqui
    exit /b 1
)

echo 🚀 Executando função %FUNCTION_NAME%...
echo.

curl -X POST ^
  "%SUPABASE_URL%/functions/v1/%FUNCTION_NAME%" ^
  -H "Authorization: Bearer %SUPABASE_SERVICE_ROLE_KEY%" ^
  -H "Content-Type: application/json" ^
  -d "{}"

echo.
echo.
echo ✅ Script executado!

