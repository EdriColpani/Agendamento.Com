import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// E-mail de destino padrão (pode ser substituído pelo e-mail do GLOBAL_ADMIN)
const DEFAULT_ADMIN_EMAIL = 'admin@tipagenda.com'; 

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    const { name, email, phone_number, description } = await req.json();

    if (!name || !email || !phone_number) {
      return jsonResponse({ error: 'Dados obrigatórios de contato ausentes.' }, 400);
    }

    // 1. Encontrar o e-mail do Administrador Global (ou usar o padrão)
    let adminEmail = DEFAULT_ADMIN_EMAIL;
    try {
        // 1. Buscar o usuário GLOBAL_ADMIN na tabela type_user
        const { data: adminTypeUser, error: adminTypeError } = await supabaseAdmin
            .from('type_user')
            .select('user_id')
            .eq('cod', 'GLOBAL_ADMIN')
            .limit(1)
            .single();

        if (adminTypeError && adminTypeError.code !== 'PGRST116') throw adminTypeError;

        // 2. Buscar o e-mail correspondente via auth.admin.getUserById (service role tem acesso direto)
        if (adminTypeUser?.user_id) {
            const { data: adminAuthUser, error: adminAuthError } = await supabaseAdmin.auth.admin.getUserById(adminTypeUser.user_id);

            if (adminAuthError) {
                console.warn('Failed to fetch GLOBAL_ADMIN email via getUserById, using default.', adminAuthError);
            } else if (adminAuthUser?.user?.email) {
                adminEmail = adminAuthUser.user.email;
            }
        }
    } catch (e) {
        console.error('Failed to fetch GLOBAL_ADMIN email, using default.', e);
    }
    
    // 2. Construir o corpo do e-mail
    const emailSubject = `[NOVO LEAD] Solicitação de Contato de ${name}`;
    const emailBody = `
        Uma nova solicitação de contato foi recebida através da Landing Page.

        Detalhes do Solicitante:
        - Nome: ${name}
        - E-mail: ${email}
        - Telefone: ${phone_number}
        - Descrição: ${description || 'Nenhuma descrição fornecida.'}

        Acesse o painel de administração para gerenciar esta solicitação.
    `;

    // 3. Enviar o e-mail usando o cliente Admin do Supabase
    const { error: sendError } = await supabaseAdmin.auth.admin.inviteUserByEmail(adminEmail, {
        // Usamos a função de convite para enviar um e-mail transacional
        // Nota: O Supabase não tem uma API de e-mail transacional direta no cliente Admin,
        // mas podemos usar o `sendEmail` se estivermos usando o cliente Admin.
        // No Deno, a maneira mais robusta é usar o `sendEmail` do cliente Admin.
        emailRedirectTo: `${Deno.env.get('SITE_URL')}/admin-dashboard/contact-requests`,
        subject: emailSubject,
        html: `<pre>${emailBody}</pre>`,
    });

    // Nota: A função `inviteUserByEmail` não é ideal para e-mails transacionais.
    // Se o Supabase suportar `sendEmail` no cliente Admin, usaremos:
    const { error: sendEmailError } = await supabaseAdmin.auth.admin.sendEmail({
        email: adminEmail,
        subject: emailSubject,
        html: `<p>Uma nova solicitação de contato foi recebida através da Landing Page.</p>
               <p><strong>Detalhes do Solicitante:</strong></p>
               <ul>
                   <li><strong>Nome:</strong> ${name}</li>
                   <li><strong>E-mail:</strong> ${email}</li>
                   <li><strong>Telefone:</strong> ${phone_number}</li>
                   <li><strong>Descrição:</strong> ${description || 'Nenhuma descrição fornecida.'}</li>
               </ul>
               <p>Acesse o painel de administração para gerenciar esta solicitação.</p>
               <p><a href="${Deno.env.get('SITE_URL')}/admin-dashboard/contact-requests">Ver Solicitações de Contato</a></p>`,
    });

    if (sendEmailError) {
        console.error('Supabase Email Send Error:', sendEmailError.message);
        // Não lançamos erro 500, pois a inserção no DB já ocorreu no frontend.
    }

    return jsonResponse({ message: 'Solicitação de contato processada.' }, 200);

  } catch (error: unknown) {
    console.error('Edge Function Error (send-contact-request-email): Uncaught exception -', error);
    return jsonResponse({ error: 'Erro interno ao processar solicitação de contato.' }, 500);
  }
});