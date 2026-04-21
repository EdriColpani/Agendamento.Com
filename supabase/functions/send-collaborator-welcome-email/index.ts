import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const BRAND_NAME = "PlanoAgenda";
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
    const body = await req.json();
    const { email, firstName, lastName, temporaryPassword, loginUrl, userType } = body;

    console.log('Edge Function Debug (send-collaborator-welcome-email): Payload recebido:', body);

    if (!email || !firstName || !temporaryPassword || !loginUrl) {
      console.error('Edge Function Error (send-collaborator-welcome-email): Dados obrigatórios faltando:', {
        hasEmail: !!email,
        hasFirstName: !!firstName,
        hasTemporaryPassword: !!temporaryPassword,
        hasLoginUrl: !!loginUrl,
      });
      return new Response(JSON.stringify({ error: 'Missing required data for email' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Tipo de usuário: 'cliente' ou 'colaborador' (padrão)
    const isClient = userType === 'cliente' || userType === 'CLIENTE';
    const userTypeText = isClient ? 'cliente' : 'colaborador';

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

    console.log('Edge Function Debug (send-collaborator-welcome-email): userType resolvido:', {
      rawUserType: userType,
      isClient,
      userTypeText,
    });

    if (!RESEND_API_KEY) {
      console.warn('Edge Function Warning (send-collaborator-welcome-email): RESEND_API_KEY não configurada. Email não será enviado.');
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Email service not configured' 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
          <p>Você foi cadastrado como ${userTypeText} no sistema ${BRAND_NAME}. Utilize as credenciais abaixo para acessar o sistema:</p>
          
          <div class="credentials">
            <p><strong>E-mail:</strong> ${email}</p>
            <p><strong>Senha temporária:</strong> ${temporaryPassword}</p>
          </div>
          
          <p><strong>Importante:</strong> Ao fazer o primeiro login, você será solicitado a alterar sua senha por uma senha de sua escolha.</p>
          
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

    console.log('Edge Function Debug (send-collaborator-welcome-email): Enviando email via Resend para:', email);

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: BRAND_FROM_EMAIL,
        to: email,
        subject: `Bem-vindo ao ${BRAND_NAME} - Credenciais de Acesso`,
        html: emailHtml,
      }),
    });

    const resendData = await resendResponse.json();

    console.log('Edge Function Debug (send-collaborator-welcome-email): Resend response status/ok:', {
      status: resendResponse.status,
      ok: resendResponse.ok,
    });

    if (resendResponse.ok) {
      console.log('Edge Function Debug (send-collaborator-welcome-email): Email de boas-vindas enviado com sucesso via Resend API para:', email);
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Email sent successfully' 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      console.error('Edge Function Error (send-collaborator-welcome-email): Resend API error:', resendData);
      
      if (resendData.statusCode === 403 && resendData.message?.includes('testing emails')) {
        console.warn('Edge Function Warning (send-collaborator-welcome-email): Resend está em modo de teste. Você só pode enviar emails para o email da sua conta do Resend.');
      }
      
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Failed to send email',
        error: resendData 
      }), {
        status: 200, // Retorna 200 para não quebrar o fluxo, mas indica falha
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (error: any) {
    console.error('Edge Function Error (send-collaborator-welcome-email): Uncaught exception:', error.message);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

