import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.0';

const BRAND_NAME = "PlanoAgenda";
const BRAND_SITE_URL = "https://www.planoagenda.com.br";
const BRAND_FROM_EMAIL = `${BRAND_NAME} <noreply@planoagenda.com.br>`;
const BRAND_COPYRIGHT = `© ${BRAND_NAME} - Todos os direitos reservados`;

function getBrandFooterHtml(): string {
  return `<p>${BRAND_COPYRIGHT}</p>`;
}

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { firstName, lastName, email, password } = await req.json();

    console.log('Edge Function Debug (signup-client): Received email:', email);
    console.log('Edge Function Debug (signup-client): Received firstName:', firstName);
    console.log('Edge Function Debug (signup-client): Received lastName:', lastName);

    if (!email || !firstName || !lastName || !password) {
      console.error('Edge Function Error (signup-client): Missing required data');
      return jsonResponse({ error: 'Dados obrigatórios ausentes: email, firstName, lastName e password.' }, 400);
    }

    // Create a Supabase client with the service role key for admin operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
        },
      }
    );

    let createdAuthUser = null;
    let createUserError = null;
    let emailSent = false;
    let emailError: string | null = null;

    // Normalizar email
    const normalizedEmail = email.trim().toLowerCase();
    console.log('Edge Function Debug (signup-client): Tentando criar novo usuário com email:', normalizedEmail);
    
    const clientName = `${firstName} ${lastName}`.trim();

    // Criar usuário com a senha escolhida pelo usuário (seguindo padrão de invite-client)
    const { data: newUser, error: createUserErrorData } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password: password,
      email_confirm: true, // Confirmar email automaticamente (igual ao invite-client)
      user_metadata: {
        full_name: clientName,
        first_name: firstName,
        last_name: lastName,
        is_temporary_password: false, // Não é senha temporária, é a senha escolhida pelo usuário
      },
    });

    if (createUserErrorData) {
      // Verificar se o erro é porque o usuário já existe
      const errorMessage = (createUserErrorData.message || '').toLowerCase();
      const errorStatus = createUserErrorData.status || 0;
      
      const isUserExistsError = errorMessage.includes('already registered') || 
                                errorMessage.includes('user already exists') ||
                                errorMessage.includes('already exists') ||
                                errorMessage.includes('duplicate') ||
                                errorStatus === 422 ||
                                errorStatus === 400;
      
      if (isUserExistsError) {
        console.log('Edge Function Debug (signup-client): Usuário já existe (erro do Supabase).');
        return jsonResponse({ 
          error: 'Já existe um usuário cadastrado com este e-mail. Por favor, use outro e-mail.' 
        }, 400);
      }
      
      // Outro tipo de erro na criação
      console.error('Edge Function Error (signup-client): Error creating user:', createUserErrorData);
      createUserError = createUserErrorData;
      return jsonResponse({ error: 'Erro ao criar usuário.' }, 400);
    }

    // Usuário criado com sucesso
    createdAuthUser = newUser.user;
    console.log('Edge Function Debug (signup-client): Usuário criado com sucesso:', createdAuthUser.id);
    
    // Criar registro em type_user com cod 'CLIENTE' (igual ao invite-client)
    const { error: typeUserError } = await supabaseAdmin
      .from('type_user')
      .upsert({
        user_id: createdAuthUser.id,
        cod: 'CLIENTE',
        descr: 'Cliente',
      }, {
        onConflict: 'user_id',
      });
    
    if (typeUserError) {
      console.error('Edge Function Error (signup-client): Error creating type_user:', typeUserError);
      // Não falha o processo, apenas loga o erro
    }

    // Enviar email com credenciais - DIRETO VIA RESEND API (igual ao invite-client)
    const siteUrl = Deno.env.get('SITE_URL') || BRAND_SITE_URL;
    const loginUrl = `${siteUrl}/login`;
    
    console.log('Edge Function Debug (signup-client): Enviando email de boas-vindas para:', normalizedEmail);
    
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    
    if (!RESEND_API_KEY) {
      console.warn('Edge Function Warning (signup-client): RESEND_API_KEY não configurada. Email não será enviado.');
      console.warn('Edge Function Warning (signup-client): Configure no Supabase: Edge Functions > signup-client > Settings > Secrets.');
      emailError = 'RESEND_API_KEY não configurada';
    } else {
      try {
        const emailHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .button { display: inline-block; padding: 12px 24px; background-color: #F59E0B; color: #000; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
              .credentials { background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0; }
              .footer { margin-top: 30px; font-size: 12px; color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
              <h2>Bem-vindo ao ${BRAND_NAME}!</h2>
              <p>Olá ${firstName} ${lastName},</p>
              <p>Seu cadastro foi realizado com sucesso no sistema ${BRAND_NAME}. Utilize as credenciais abaixo para acessar o sistema:</p>
              
              <div class="credentials">
                <p><strong>E-mail:</strong> ${normalizedEmail}</p>
                <p><strong>Senha:</strong> A senha que você escolheu durante o cadastro</p>
              </div>
              
              <p><strong>Importante:</strong></p>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li>Use o e-mail <strong>exatamente</strong> como mostrado acima (em minúsculas)</li>
                <li>Use a senha que você definiu durante o cadastro</li>
                <li>Você já pode fazer login e começar a usar o sistema</li>
              </ul>
              
              <p><a href="${loginUrl}" class="button">Acessar Sistema</a></p>
              
              <p>Ou copie e cole este link no seu navegador:</p>
              <p style="word-break: break-all; color: #0066cc;">${loginUrl}</p>
              
              <div class="footer">
                <p>Se você não realizou este cadastro, entre em contato com o suporte.</p>
                ${getBrandFooterHtml()}
              </div>
            </div>
          </body>
          </html>
        `;

        const resendResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: BRAND_FROM_EMAIL,
            to: normalizedEmail,
            subject: `Bem-vindo ao ${BRAND_NAME} - Cadastro Realizado`,
            html: emailHtml,
          }),
        });

        const resendData = await resendResponse.json();

        if (resendResponse.ok) {
          emailSent = true;
          console.log('Edge Function Debug (signup-client): Email de boas-vindas enviado com sucesso via Resend API para:', normalizedEmail);
        } else {
          emailError = `Resend API error: ${JSON.stringify(resendData)}`;
          console.error('Edge Function Error (signup-client): Resend API error:', resendData);
          
          if (resendData.statusCode === 403 && resendData.message?.includes('testing emails')) {
            console.warn('Edge Function Warning (signup-client): Resend está em modo de teste. Você só pode enviar emails para o email da sua conta do Resend.');
          }
        }
      } catch (resendErr: any) {
        emailError = `Resend API exception: ${resendErr.message}`;
        console.error('Edge Function Error (signup-client): Resend API exception:', resendErr.message);
      }
    }

    // Se o email falhou, logar mas não bloquear o processo
    if (!emailSent) {
      console.warn('Edge Function Warning (signup-client): Cliente criado, mas email NÃO foi enviado. Erro:', emailError);
    } else {
      console.log('Edge Function Debug (signup-client): Email enviado com sucesso.');
    }

    // Insert client data into the public.clients table (APÓS criação do usuário e envio de email)
    // No signup público, usamos dados mínimos/placeholders para campos obrigatórios
    const { data: clientData, error: insertClientError } = await supabaseAdmin
      .from('clients')
      .insert({
        user_id: createdAuthUser.id, // O próprio cliente é o user_id no auto-cadastro
        company_id: null, // Cliente público não está vinculado a uma empresa específica
        client_auth_id: createdAuthUser.id, // Link to the newly created user's auth ID
        name: clientName,
        phone: '00000000000', // Placeholder - cliente pode atualizar depois
        email: normalizedEmail,
        birth_date: '1900-01-01', // Placeholder - cliente pode atualizar depois
        zip_code: '00000000', // Placeholder
        state: 'XX', // Placeholder
        city: 'N/A', // Placeholder
        address: 'N/A', // Placeholder
        number: '0', // Placeholder
        neighborhood: 'N/A', // Placeholder
        complement: null,
        observations: null,
        status: 'novo',
        points: 0,
      })
      .select()
      .single();

    if (insertClientError) {
      console.error('Edge Function Error (signup-client): Insert client error -', insertClientError.message);
      // Se a inserção do cliente falhar, o usuário já foi criado e o email já foi enviado
      // Isso é um problema, mas não vamos reverter tudo. Apenas logamos o erro.
      return jsonResponse({ 
        error: 'Erro ao salvar dados do cliente.',
        warning: 'Usuário criado e email enviado, mas falha ao inserir dados do cliente na tabela clients'
      }, 500);
    }

    console.log('Edge Function Debug (signup-client): Client data inserted successfully:', clientData?.id);

    // Incluir informação sobre o email na resposta
    const responseMessage = emailSent 
      ? 'Cadastro realizado com sucesso. Email de confirmação foi enviado.'
      : `Cadastro realizado com sucesso. ATENÇÃO: O email não foi enviado. ${emailError || 'Verifique os logs.'}`;
    
    return jsonResponse({ 
      message: responseMessage, 
      client: clientData,
      emailSent: emailSent,
      emailError: emailError || null,
    }, 200);

  } catch (error: unknown) {
    console.error('Edge Function Error (signup-client): Uncaught exception -', error);
    return jsonResponse({ error: 'Erro interno ao cadastrar cliente.' }, 500);
  }
});

