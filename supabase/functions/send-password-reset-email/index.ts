import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0";

const BRAND_NAME = "PlanoAgenda";
const BRAND_FROM_EMAIL = "PlanoAgenda <noreply@planoagenda.com.br>";
const BRAND_RESET_PASSWORD_URL = "https://www.planoagenda.com.br/reset-password";
const BRAND_LOGO_URL = "https://www.planoagenda.com.br/brand/planoagenda-logo-pa.svg";
const BRAND_COPYRIGHT = `© ${BRAND_NAME} - Todos os direitos reservados`;

function getBrandFooterHtml(): string {
  return `<p>${BRAND_COPYRIGHT}</p>`;
}

function getBrandLogoHtml(maxWidth = 180): string {
  return `
    <p style="margin: 0 0 16px;">
      <img
        src="${BRAND_LOGO_URL}"
        alt="${BRAND_NAME}"
        style="display:block;max-width:${maxWidth}px;height:auto;"
      />
    </p>
  `;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Método não permitido. Use POST." }),
        {
          status: 405,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Corpo da requisição inválido (JSON esperado)." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const rawEmail = (body?.email || "") as string;
    const email = rawEmail.trim().toLowerCase();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "E-mail é obrigatório." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    // URL fixa do redirect para reset de senha (não depende de SITE_URL)
    const REDIRECT_TO = BRAND_RESET_PASSWORD_URL;

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      console.error(
        "[send-password-reset-email] SUPABASE_URL ou SERVICE_ROLE_KEY não configurados.",
      );
      return new Response(
        JSON.stringify({
          error:
            "Configuração do Supabase ausente. Verifique SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: REDIRECT_TO,
      },
    });

    if (linkError) {
      console.error(
        "[send-password-reset-email] Erro ao gerar link de recuperação:",
        linkError,
      );

      return new Response(
        JSON.stringify({
          success: true,
          message:
            "Se o e-mail informado estiver cadastrado, você receberá um link para redefinir a senha.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let resetLink: string =
      (linkData as any)?.properties?.action_link ||
      (linkData as any)?.action_link;

    if (!resetLink) {
      console.error(
        "[send-password-reset-email] Não foi possível obter action_link do generateLink.",
        linkData,
      );

      return new Response(
        JSON.stringify({
          success: true,
          message:
            "Se o e-mail informado estiver cadastrado, você receberá um link para redefinir a senha.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Garantir que o link redirecione para /reset-password (sobrescreve redirect_to do Supabase)
    try {
      const url = new URL(resetLink);
      url.searchParams.set("redirect_to", REDIRECT_TO);
      resetLink = url.toString();
    } catch {
      // mantém resetLink original se falhar o parse
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    if (!RESEND_API_KEY) {
      console.error(
        "[send-password-reset-email] RESEND_API_KEY não configurada.",
      );
      return new Response(
        JSON.stringify({
          success: true,
          message:
            "Se o e-mail informado estiver cadastrado, você receberá um link para redefinir a senha.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const emailHtml = `
      <!DOCTYPE html>
      <html lang="pt-BR">
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
          ${getBrandLogoHtml()}
          <h2>Redefinir senha - ${BRAND_NAME}</h2>
          <p>Olá,</p>
          <p>Recebemos um pedido para redefinir a senha da sua conta no <strong>${BRAND_NAME}</strong>.</p>
          <p>Clique no botão abaixo para criar uma nova senha:</p>
          <p><a href="${resetLink}" class="button">Redefinir senha</a></p>
          <p>Ou copie e cole este link no seu navegador:</p>
          <p style="word-break: break-all; color: #0066cc;">${resetLink}</p>
          <p>Se você não solicitou esta alteração, pode ignorar este e-mail com segurança.</p>
          <div class="footer">
            ${getBrandFooterHtml()}
          </div>
        </div>
      </body>
      </html>
    `;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: BRAND_FROM_EMAIL,
        to: email,
        subject: `Redefinição de senha - ${BRAND_NAME}`,
        html: emailHtml,
      }),
    });

    const resendData = await resendResponse.json().catch(() => ({}));

    if (!resendResponse.ok) {
      console.error(
        "[send-password-reset-email] Erro Resend:",
        resendResponse.status,
        resendData,
      );
      return new Response(
        JSON.stringify({
          success: true,
          message:
            "Se o e-mail informado estiver cadastrado, você receberá um link para redefinir a senha.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(
      "[send-password-reset-email] E-mail de redefinição enviado com sucesso via Resend:",
      resendData,
    );

    return new Response(
      JSON.stringify({
        success: true,
        message:
          "Se o e-mail informado estiver cadastrado, você receberá um link para redefinir a senha.",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    console.error("[send-password-reset-email] Erro inesperado:", error);
    return new Response(
      JSON.stringify({
        success: true,
        message:
          "Se o e-mail informado estiver cadastrado, você receberá um link para redefinir a senha.",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

