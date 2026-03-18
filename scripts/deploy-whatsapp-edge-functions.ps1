$ErrorActionPreference = "Stop"

Set-Location "c:\V3\tipoagenda.com"

Write-Host "Deploy: whatsapp-message-scheduler"
supabase functions deploy whatsapp-message-scheduler

Write-Host "Deploy: finalize-appointment-by-collaborator"
supabase functions deploy finalize-appointment-by-collaborator

Write-Host "OK: deploy concluído."

