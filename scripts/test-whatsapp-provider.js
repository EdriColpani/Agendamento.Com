// Script Node.js para testar diretamente a API do provedor de WhatsApp
// Uso: node scripts/test-whatsapp-provider.js [telefone] [mensagem]
// Exemplo: node scripts/test-whatsapp-provider.js +5511999999999 "Teste de mensagem"

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ocawpokndruxakzmhzsa.supabase.co';

// FormData nativo está disponível no Node.js 18+
// Se você estiver usando Node.js < 18, instale: npm install form-data
if (typeof FormData === 'undefined') {
  console.error('❌ Erro: FormData não está disponível.');
  console.error('   Node.js 18+ tem FormData nativo.');
  console.error('   Se estiver usando versão anterior, instale: npm install form-data');
  process.exit(1);
}

// Você precisa definir a SERVICE_ROLE_KEY como variável de ambiente
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('❌ Erro: Variável SUPABASE_SERVICE_ROLE_KEY não definida');
  console.error('Defina com: $env:SUPABASE_SERVICE_ROLE_KEY="sua-chave-aqui" (PowerShell)');
  console.error('Ou: export SUPABASE_SERVICE_ROLE_KEY="sua-chave-aqui" (Bash)');
  process.exit(1);
}

// Pegar telefone e mensagem dos argumentos ou usar valores padrão
const testPhone = process.argv[2] || '+5511999999999';
const testMessage = process.argv[3] || 'Teste de mensagem do sistema';

async function testProvider() {
  console.log('🔍 Buscando provedor ativo no banco de dados...\n');

  try {
    // 1. Buscar provedor ativo
    const providerResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/messaging_providers?channel=eq.WHATSAPP&is_active=eq.true&limit=1`,
      {
        headers: {
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!providerResponse.ok) {
      const errorText = await providerResponse.text();
      throw new Error(`Erro ao buscar provedor: ${providerResponse.status} - ${errorText}`);
    }

    const providers = await providerResponse.json();

    if (!providers || providers.length === 0) {
      console.error('❌ Nenhum provedor WHATSAPP ativo encontrado.');
      console.error('Configure um provedor em messaging_providers primeiro.');
      process.exit(1);
    }

    const provider = providers[0];
    console.log('✅ Provedor encontrado:');
    console.log(`   Nome: ${provider.name}`);
    console.log(`   URL: ${provider.base_url}`);
    console.log(`   Método: ${provider.http_method}`);
    console.log(`   Content-Type: ${provider.content_type || 'json'}`);
    console.log(`   Auth Key: ${provider.auth_key || '(não configurado)'}`);
    console.log('');

    // 2. Preparar requisição (mesma lógica da Edge Function)
    // Formatar telefone para API LiotPRO: remover "+" e espaços, apenas dígitos
    const formattedPhoneForAPI = testPhone.replace(/[+\s]/g, '');
    
    const contentType = provider.content_type || 'json';
    const headers = {};

    // Adicionar header de autenticação
    if (provider.auth_key && provider.auth_token) {
      // Garantir que o token tenha prefixo "Bearer " se necessário
      let tokenValue = provider.auth_token;
      if (provider.auth_key.toLowerCase() === 'authorization' && !tokenValue.startsWith('Bearer ')) {
        tokenValue = 'Bearer ' + tokenValue;
      }
      headers[provider.auth_key] = tokenValue;
    }

    let body;

    if (contentType === 'form-data') {
      // Usar FormData nativo (Node.js 18+)
      const formData = new FormData();

      // Processar o template como objeto e incluir user_id e queue_id automaticamente
      const payloadTemplate = { ...(provider.payload_template || {}) };
      
      // Incluir user_id e queue_id do provedor (valores do provedor têm prioridade sobre o template)
      if (provider.user_id) {
        payloadTemplate.userId = provider.user_id;
      } else if (!payloadTemplate.userId) {
        payloadTemplate.userId = '';
      }
      
      if (provider.queue_id) {
        payloadTemplate.queueId = provider.queue_id;
      } else if (!payloadTemplate.queueId) {
        payloadTemplate.queueId = '';
      }
      
      for (const [key, value] of Object.entries(payloadTemplate)) {
        let fieldValue;

        if (typeof value === 'string') {
          // Substituir placeholders (usar telefone formatado sem +)
          fieldValue = value
            .replace(/{phone}/g, formattedPhoneForAPI)
            .replace(/{text}/g, testMessage)
            .replace(/\[PHONE\]/g, formattedPhoneForAPI)
            .replace(/\[TEXT\]/g, testMessage);
        } else if (typeof value === 'boolean') {
          fieldValue = String(value);
        } else if (value === null || value === undefined) {
          continue;
        } else {
          fieldValue = String(value);
        }

        // Campos vazios são ignorados (conforme API LiotPRO)
        if (fieldValue !== '""' && fieldValue !== '') {
          formData.append(key, fieldValue);
        }
      }

      body = formData;
      // FormData define Content-Type automaticamente com boundary
    } else {
      // Usar application/json (padrão)
      headers['Content-Type'] = 'application/json';

      // Criar cópia do payload_template e incluir user_id e queue_id automaticamente
      const payloadTemplate = { ...(provider.payload_template || {}) };
      
      // Incluir user_id e queue_id do provedor (valores do provedor têm prioridade sobre o template)
      if (provider.user_id) {
        payloadTemplate.userId = provider.user_id;
      } else if (!payloadTemplate.userId) {
        payloadTemplate.userId = '';
      }
      
      if (provider.queue_id) {
        payloadTemplate.queueId = provider.queue_id;
      } else if (!payloadTemplate.queueId) {
        payloadTemplate.queueId = '';
      }
      
      // Substituir placeholders básicos no JSON do payload (usar telefone formatado sem +)
      const payloadString = JSON.stringify(payloadTemplate)
        .replace(/{phone}/g, formattedPhoneForAPI)
        .replace(/{text}/g, testMessage)
        .replace(/\[PHONE\]/g, formattedPhoneForAPI)
        .replace(/\[TEXT\]/g, testMessage);

      const payloadJson = JSON.parse(payloadString);
      body = provider.http_method === 'GET' ? undefined : JSON.stringify(payloadJson);
    }

    console.log('📤 Enviando requisição para a API do provedor...');
    console.log(`   URL: ${provider.base_url}`);
    console.log(`   Método: ${provider.http_method}`);
    console.log(`   Headers:`, JSON.stringify(headers, null, 2));
    
    if (contentType === 'form-data') {
      console.log(`   Body: FormData (multipart/form-data)`);
      // Tentar mostrar campos do FormData se possível
      const formDataEntries = [];
      if (body && typeof body.entries === 'function') {
        for (const [key, value] of body.entries()) {
          formDataEntries.push(`${key}: ${value}`);
        }
        console.log(`   Campos:`, formDataEntries.join(', '));
      }
    } else {
      console.log(`   Body:`, body || '(sem body para GET)');
    }
    console.log('');

    // 3. Enviar requisição
    let response;
    try {
      // Criar AbortController para timeout (compatível com Node.js 15+)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 segundos
      
      response = await fetch(provider.base_url, {
        method: provider.http_method,
        headers,
        body: body,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
    } catch (fetchError) {
      console.error('\n❌ Erro ao fazer requisição HTTP:');
      console.error(`   Tipo: ${fetchError.name}`);
      console.error(`   Mensagem: ${fetchError.message}`);
      
      if (fetchError.name === 'AbortError') {
        console.error('   → Timeout: a requisição demorou mais de 30 segundos');
      } else if (fetchError.message && fetchError.message.includes('ENOTFOUND')) {
        console.error('   → Problema de DNS: não foi possível resolver o hostname');
      } else if (fetchError.message && fetchError.message.includes('ECONNREFUSED')) {
        console.error('   → Conexão recusada: servidor não está respondendo');
      } else if (fetchError.message && fetchError.message.includes('ETIMEDOUT')) {
        console.error('   → Timeout: servidor não respondeu a tempo');
      } else if (fetchError.message && (fetchError.message.includes('CERT') || fetchError.message.includes('SSL'))) {
        console.error('   → Problema com certificado SSL/TLS');
      } else if (fetchError.cause) {
        console.error(`   → Causa: ${fetchError.cause.message || fetchError.cause}`);
      }
      
      console.error('\n💡 Verifique:');
      console.error('   - Conexão com internet');
      console.error('   - Firewall/Antivírus bloqueando');
      console.error('   - URL do provedor está correta?');
      console.error(`   - Tente acessar manualmente: ${provider.base_url}`);
      console.error('   - Execute: node scripts/test-connectivity.js');
      
      throw fetchError;
    }

    // 4. Processar resposta
    let responseBody;
    try {
      responseBody = await response.json();
    } catch {
      responseBody = await response.text().catch(() => null);
    }

    console.log('📥 Resposta da API:');
    console.log(`   Status HTTP: ${response.status}`);
    console.log(`   OK: ${response.ok}`);
    console.log(`   Body:`, JSON.stringify(responseBody, null, 2));
    console.log('');

    if (response.ok) {
      console.log('✅ Mensagem enviada com sucesso!');
    } else {
      console.log('❌ Erro ao enviar mensagem');
      console.log(`   Status: ${response.status} ${response.statusText}`);
    }

  } catch (error) {
    console.error('❌ Erro:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

console.log('🧪 TESTE DIRETO DA API DO PROVEDOR WHATSAPP\n');
console.log(`Telefone de teste: ${testPhone}`);
console.log(`Mensagem de teste: ${testMessage}`);
console.log('');
console.log('💡 Dica: Você pode passar telefone e mensagem como argumentos:');
console.log('   node scripts/test-whatsapp-provider.js +5511999999999 "Sua mensagem aqui"');
console.log('');

testProvider();

