// Script Node.js para testar a função whatsapp-message-scheduler
// Uso: node scripts/test-whatsapp-scheduler.js

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ocawpokndruxakzmhzsa.supabase.co';
const FUNCTION_NAME = 'whatsapp-message-scheduler';

// Você precisa definir a SERVICE_ROLE_KEY como variável de ambiente
// ou substituir aqui diretamente
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('❌ Erro: Variável SUPABASE_SERVICE_ROLE_KEY não definida');
  console.error('Defina com: export SUPABASE_SERVICE_ROLE_KEY="sua-chave-aqui"');
  process.exit(1);
}

async function testFunction() {
  console.log(`🚀 Executando função ${FUNCTION_NAME}...\n`);

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${FUNCTION_NAME}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    const data = await response.json();

    console.log(`Status HTTP: ${response.status}\n`);
    console.log('Resposta:');
    console.log(JSON.stringify(data, null, 2));

    if (response.ok) {
      console.log('\n✅ Função executada com sucesso!');
    } else {
      console.log('\n❌ Erro na execução');
    }
  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }
}

testFunction();

