#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { exec, execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('========================================');
console.log('DEPLOY: whatsapp-message-scheduler');
console.log('========================================');
console.log('');

const functionPath = path.join(__dirname, '..', 'supabase', 'functions', 'whatsapp-message-scheduler', 'index.ts');

// Verificar se o arquivo existe
if (!fs.existsSync(functionPath)) {
    console.error('ERRO: Arquivo não encontrado!');
    console.error(`Procurando: ${functionPath}`);
    process.exit(1);
}

console.log('[1/3] Lendo código...');
const code = fs.readFileSync(functionPath, 'utf8');

console.log('[2/3] Copiando código para clipboard...');

// Detectar sistema operacional
const platform = process.platform;

if (platform === 'win32') {
    // Windows - usar PowerShell para copiar arquivo grande
    try {
        // Criar script PowerShell temporário para copiar
        const psScript = `Get-Content "${functionPath.replace(/\\/g, '/')}" -Raw | Set-Clipboard`;
        execSync(`powershell -Command "${psScript}"`, { encoding: 'utf8' });
        console.log('OK! Código copiado para clipboard.');
    } catch (error) {
        console.error('ERRO ao copiar para clipboard:', error.message);
        console.log('\nPor favor, copie manualmente o conteúdo de:', functionPath);
        console.log('Ou use o script .bat: scripts\\deploy-whatsapp-scheduler.bat');
    }
} else if (platform === 'darwin') {
    // macOS
    try {
        execSync(`echo ${JSON.stringify(code)} | pbcopy`);
        console.log('OK! Código copiado para clipboard.');
    } catch (error) {
        console.error('ERRO ao copiar para clipboard:', error.message);
        console.log('\nPor favor, copie manualmente o conteúdo de:', functionPath);
    }
} else {
    // Linux
    try {
        execSync(`echo ${JSON.stringify(code)} | xclip -selection clipboard`);
        console.log('OK! Código copiado para clipboard.');
    } catch (error) {
        try {
            execSync(`echo ${JSON.stringify(code)} | xsel --clipboard --input`);
            console.log('OK! Código copiado para clipboard.');
        } catch (error2) {
            console.error('ERRO ao copiar para clipboard.');
            console.log('\nPor favor, copie manualmente o conteúdo de:', functionPath);
        }
    }
}

console.log('');
console.log('[3/3] Abrindo Supabase Dashboard...');

const projectRef = process.env.SUPABASE_PROJECT_REF || 'ocawpokndruxakzmhzsa';
const url = `https://supabase.com/dashboard/project/${projectRef}/functions/whatsapp-message-scheduler`;

if (platform === 'win32') {
    exec(`start ${url}`);
} else if (platform === 'darwin') {
    exec(`open ${url}`);
} else {
    exec(`xdg-open ${url}`);
}

console.log('');
console.log('========================================');
console.log('INSTRUÇÕES:');
console.log('========================================');
console.log('');
console.log('1. No Supabase Dashboard, clique no editor de código');
console.log('2. Selecione TODO o código (Ctrl+A ou Cmd+A)');
console.log('3. Cole o novo código (Ctrl+V ou Cmd+V)');
console.log('4. Clique em "Deploy" ou "Save"');
console.log('5. Aguarde a confirmação');
console.log('');
console.log('========================================');
console.log('PRONTO! Código copiado e dashboard aberto.');
console.log('========================================');
