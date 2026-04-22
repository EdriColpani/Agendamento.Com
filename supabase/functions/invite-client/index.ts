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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error('Edge Function Error (invite-client): Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return new Response(JSON.stringify({ error: 'Server misconfigured: missing Supabase credentials' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      supabaseUrl,
      supabaseServiceRoleKey,
      {
        auth: {
          persistSession: false,
        },
      }
    );

    // Verify the user's session (the one calling this function)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('Edge Function Error (invite-client): Unauthorized - No Authorization header');
      return new Response(JSON.stringify({ error: 'Unauthorized: No Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      console.error('Edge Function Error (invite-client): Auth error -', userError?.message || 'User not found');
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token or user not found' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { clientEmail, clientName, companyId, clientPhone, clientBirthDate, clientZipCode, clientState, clientCity, clientAddress, clientNumber, clientNeighborhood, clientComplement, clientObservations, clientStatus, clientPoints } = await req.json();

    console.log('Edge Function Debug (invite-client): Received clientEmail:', clientEmail);
    console.log('Edge Function Debug (invite-client): Received companyId:', companyId);
    console.log('Edge Function Debug (invite-client): Authenticated user ID:', user.id);


    if (!clientEmail || !clientName || !companyId || !clientPhone || !clientBirthDate || !clientZipCode || !clientState || !clientCity || !clientAddress || !clientNumber || !clientNeighborhood) {
      console.error('Edge Function Error (invite-client): Missing required client data');
      return new Response(JSON.stringify({ error: 'Missing required client data' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if the calling user (user.id) is an admin/proprietor of the companyId
    const { data: userCompanyRoles, error: roleError } = await supabaseAdmin
      .from('user_companies')
      .select('role_type')
      .eq('user_id', user.id)
      .eq('company_id', companyId)
      .single();

    if (roleError || !userCompanyRoles) {
      console.error('Edge Function Error (invite-client): Role check error -', roleError?.message || 'User not authorized for this company');
      console.error('Edge Function Debug (invite-client): User ID:', user.id, 'Company ID:', companyId);
      console.error('Edge Function Debug (invite-client): Role fetch error:', roleError);
      return new Response(JSON.stringify({ error: 'Forbidden: User not authorized for this company' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch role_type description to verify if it's 'Proprietário' or 'Admin'
    const { data: roleTypeData, error: roleTypeFetchError } = await supabaseAdmin
      .from('role_types')
      .select('description')
      .eq('id', userCompanyRoles.role_type)
      .single();

    console.log('Edge Function Debug (invite-client): User role type ID:', userCompanyRoles.role_type);
    console.log('Edge Function Debug (invite-client): User role type description:', roleTypeData?.description);


    if (roleTypeFetchError || !roleTypeData || !['Proprietário', 'Admin'].includes(roleTypeData.description)) {
      console.error('Edge Function Error (invite-client): Role type description error -', roleTypeFetchError?.message || 'User does not have sufficient privileges');
      console.error('Edge Function Debug (invite-client): Role type fetch error:', roleTypeFetchError);
      return new Response(JSON.stringify({ error: 'Forbidden: User does not have sufficient privileges for this company' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Função para gerar senha temporária segura (mesmo padrão de invite-collaborator)
    const generateTemporaryPassword = (): string => {
      const length = 12;
      const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*';
      let password = '';
      // Garantir pelo menos uma letra maiúscula, uma minúscula, um número e um caractere especial
      password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
      password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)];
      password += '0123456789'[Math.floor(Math.random() * 10)];
      password += '!@#$%&*'[Math.floor(Math.random() * 7)];
      // Preencher o resto
      for (let i = password.length; i < length; i++) {
        password += charset[Math.floor(Math.random() * charset.length)];
      }
      // Embaralhar
      return password.split('').sort(() => Math.random() - 0.5).join('');
    };

    let createdAuthUser = null;
    let createUserError = null;
    let emailSent = false;
    let emailError: string | null = null;

    // Normalizar email
    const normalizedEmail = clientEmail.trim().toLowerCase();
    console.log('Edge Function Debug (invite-client): Tentando criar novo usuário com email:', normalizedEmail);
    
    // Gerar senha temporária
    const temporaryPassword = generateTemporaryPassword();
    console.log('Edge Function Debug (invite-client): Senha temporária gerada (primeiros 3 caracteres):', temporaryPassword.substring(0, 3) + '***');
    
    // Separar nome completo em primeiro e último nome
    const nameParts = clientName.trim().split(' ');
    const firstName = nameParts[0] || clientName;
    const lastName = nameParts.slice(1).join(' ') || '';

    // Criar usuário com senha temporária (seguindo padrão de invite-collaborator)
    const { data: newUser, error: createUserErrorData } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        full_name: clientName,
        first_name: firstName,
        last_name: lastName,
        phone: clientPhone,
        birth_date: clientBirthDate,
        is_temporary_password: true,
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
        console.log('Edge Function Debug (invite-client): Usuário já existe (erro do Supabase).');
        return new Response(JSON.stringify({ 
          error: 'Já existe um usuário cadastrado com este e-mail. Por favor, use outro e-mail.' 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
      }
      
      // Outro tipo de erro na criação
      console.error('Edge Function Error (invite-client): Error creating user:', createUserErrorData);
      createUserError = createUserErrorData;
      return new Response(JSON.stringify({ 
        error: 'Erro ao criar usuário para cliente: ' + createUserErrorData.message 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Usuário criado com sucesso
    createdAuthUser = newUser.user;
    console.log('Edge Function Debug (invite-client): Usuário criado com sucesso:', createdAuthUser.id);
    
    // Criar registro em type_user com cod 'CLIENTE'
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
      console.error('Edge Function Error (invite-client): Error creating type_user:', typeUserError);
      // Não falha o processo, apenas loga o erro
    }

    // Enviar email com credenciais - DIRETO VIA RESEND API (igual ao cadastro de colaborador)
    const siteUrl = Deno.env.get('SITE_URL') || BRAND_SITE_URL;
    const loginUrl = `${siteUrl}/login`;
    
    console.log('Edge Function Debug (invite-client): Enviando email de boas-vindas para:', normalizedEmail);
    
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    
    if (!RESEND_API_KEY) {
      console.warn('Edge Function Warning (invite-client): RESEND_API_KEY não configurada. Email não será enviado.');
      console.warn('Edge Function Warning (invite-client): Configure no Supabase: Edge Functions > invite-client > Settings > Secrets.');
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
              <p>Você foi cadastrado como cliente no sistema ${BRAND_NAME}. Utilize as credenciais abaixo para acessar o sistema:</p>
              
              <div class="credentials">
                <p><strong>E-mail:</strong> ${normalizedEmail}</p>
                <p><strong>Senha temporária:</strong> <code style="background-color: #fff; padding: 2px 4px; border: 1px solid #ddd; border-radius: 3px; font-family: monospace;">${temporaryPassword}</code></p>
              </div>
              
              <p><strong>Importante:</strong></p>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li>Use o e-mail <strong>exatamente</strong> como mostrado acima (em minúsculas)</li>
                <li>Copie a senha temporária com cuidado, incluindo todos os caracteres especiais</li>
                <li>Ao fazer o primeiro login, você será solicitado a alterar sua senha por uma senha de sua escolha</li>
              </ul>
              
              <p><a href="${loginUrl}" class="button">Acessar Sistema</a></p>
              
              <p>Ou copie e cole este link no seu navegador:</p>
              <p style="word-break: break-all; color: #0066cc;">${loginUrl}</p>
              
              <div class="footer">
                <p>Se você não foi cadastrado, entre em contato com o administrador do sistema.</p>
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
            subject: `Bem-vindo ao ${BRAND_NAME} - Credenciais de Acesso`,
            html: emailHtml,
          }),
        });

        const resendData = await resendResponse.json();

        if (resendResponse.ok) {
          emailSent = true;
          console.log('Edge Function Debug (invite-client): Email de boas-vindas enviado com sucesso via Resend API para:', normalizedEmail);
        } else {
          emailError = `Resend API error: ${JSON.stringify(resendData)}`;
          console.error('Edge Function Error (invite-client): Resend API error:', resendData);
          
          if (resendData.statusCode === 403 && resendData.message?.includes('testing emails')) {
            console.warn('Edge Function Warning (invite-client): Resend está em modo de teste. Você só pode enviar emails para o email da sua conta do Resend.');
          }
        }
      } catch (resendErr: any) {
        emailError = `Resend API exception: ${resendErr.message}`;
        console.error('Edge Function Error (invite-client): Resend API exception:', resendErr.message);
      }
    }

    // Se o email falhou, logar mas não bloquear o processo
    if (!emailSent) {
      console.warn('Edge Function Warning (invite-client): Cliente criado, mas email NÃO foi enviado. Erro:', emailError);
      console.warn('Edge Function Warning (invite-client): Credenciais do cliente:', {
        email: normalizedEmail,
        temporaryPassword: temporaryPassword,
      });
    } else {
      // Log das credenciais para debug (apenas se email foi enviado)
      console.log('Edge Function Debug (invite-client): Email enviado com sucesso. Credenciais:', {
        email: normalizedEmail,
        temporaryPasswordLength: temporaryPassword.length,
        passwordStartsWith: temporaryPassword.substring(0, 2) + '***',
      });
    }

    // Insert client data into the public.clients table (APÓS criação do usuário e envio de email)
    const { data: clientData, error: insertClientError } = await supabaseAdmin
      .from('clients')
      .insert({
        user_id: user.id, // The user who created this client
        company_id: companyId,
        client_auth_id: createdAuthUser.id, // Link to the newly created user's auth ID
        name: clientName,
        phone: clientPhone,
        email: normalizedEmail,
        birth_date: clientBirthDate,
        zip_code: clientZipCode,
        state: clientState,
        city: clientCity,
        address: clientAddress,
        number: clientNumber,
        neighborhood: clientNeighborhood,
        complement: clientComplement,
        observations: clientObservations,
        status: clientStatus,
        points: clientPoints,
      })
      .select()
      .single();

    if (insertClientError) {
      console.error('Edge Function Error (invite-client): Insert client error -', insertClientError.message);
      // Se a inserção do cliente falhar, o usuário já foi criado e o email já foi enviado
      // Isso é um problema, mas não vamos reverter tudo. Apenas logamos o erro.
      return new Response(JSON.stringify({ 
        error: insertClientError.message,
        warning: 'Usuário criado e email enviado, mas falha ao inserir dados do cliente na tabela clients'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Edge Function Debug (invite-client): Client data inserted successfully:', clientData?.id);

    // Incluir informação sobre o email na resposta
    const responseMessage = emailSent 
      ? 'Cliente cadastrado com sucesso. Email com credenciais foi enviado.'
      : `Cliente cadastrado com sucesso. ATENÇÃO: O email não foi enviado. ${emailError || 'Verifique os logs.'}`;
    
    return new Response(JSON.stringify({ 
      message: responseMessage, 
      client: clientData,
      emailSent: emailSent,
      emailError: emailError || null,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Edge Function Error (invite-client): Uncaught exception -', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});