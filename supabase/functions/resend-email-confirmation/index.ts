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
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 204,
      headers: corsHeaders
    });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    const { email } = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email é obrigatório.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const siteUrl = Deno.env.get('SITE_URL') || BRAND_SITE_URL;

    // 1. Gerar link de confirmação
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'signup',
      email: email,
      options: {
        redirectTo: `${siteUrl}/login`,
      },
    });

    if (linkError) {
      // Tentar recovery se signup falhar
      const { data: recoveryData } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: email,
        options: {
          redirectTo: `${siteUrl}/login`,
        },
      });
      
      if (recoveryData?.properties?.action_link) {
        linkData.properties = { action_link: recoveryData.properties.action_link };
      }
    }

    const confirmationLink = linkData?.properties?.action_link;

    if (!confirmationLink) {
      return new Response(JSON.stringify({ 
        error: 'Não foi possível gerar o link de confirmação. Tente novamente mais tarde.' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. ENVIAR EMAIL DIRETAMENTE VIA RESEND API (FUNCIONA DE VERDADE)
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ 
        error: 'RESEND_API_KEY não configurada. Configure no Supabase: Edge Functions > resend-email-confirmation > Settings > Secrets. Adicione: RESEND_API_KEY = sua-api-key-do-resend.com',
        note: 'Crie conta gratuita em https://resend.com e obtenha a API Key'
      }), {
        status: 500,
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
          .footer { margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Confirme seu cadastro no ${BRAND_NAME}</h2>
          <p>Olá,</p>
          <p>Obrigado por se cadastrar no ${BRAND_NAME}! Para ativar sua conta, clique no botão abaixo e faça login:</p>
          <p><a href="${confirmationLink}" class="button">Confirmar E-mail</a></p>
          <p>Ou copie e cole este link no seu navegador:</p>
          <p style="word-break: break-all; color: #0066cc;">${confirmationLink}</p>
          <p>Este link expira em 24 horas.</p>
          <div class="footer">
            <p>Se você não se cadastrou, ignore este email.</p>
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
        from: BRAND_FROM_EMAIL, // Domínio verificado - envia para qualquer email
        to: email,
        subject: `Confirme seu cadastro no ${BRAND_NAME}`,
        html: emailHtml,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error('Resend API error:', resendData);
      
      // Erro 403 = modo de teste, só permite enviar para email próprio
      if (resendData.statusCode === 403 && resendData.message?.includes('testing emails')) {
        return new Response(JSON.stringify({ 
          error: 'Resend está em modo de teste. Você só pode enviar emails para o email da sua conta do Resend.',
          solution: 'Para enviar para qualquer email: 1) Acesse resend.com > Domains > Add Domain, 2) Verifique seu domínio, 3) Use seu domínio no campo "from" (ex: noreply@seudominio.com)',
          currentEmail: email,
          note: 'Enquanto isso, use o email da sua conta do Resend para testar'
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      return new Response(JSON.stringify({ 
        error: 'Erro ao enviar email: ' + (resendData.message || 'Erro desconhecido'),
        details: resendData
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Email sent successfully via Resend API:', resendData);

    return new Response(JSON.stringify({ 
      message: 'E-mail de confirmação enviado com sucesso! Verifique sua caixa de entrada e spam.',
      success: true,
      emailId: resendData.id
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ 
      error: 'Erro ao processar solicitação: ' + error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
