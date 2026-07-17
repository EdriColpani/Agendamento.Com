import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0";

const BRAND_NAME = "PlanoAgenda";
const BRAND_FROM_EMAIL = `${BRAND_NAME} <noreply@planoagenda.com.br>`;
const BRAND_COPYRIGHT = `© ${BRAND_NAME} - Todos os direitos reservados`;

// Janelas de envio, em dias até o vencimento (positivo = antes; 0 = no dia; negativo = após).
const REMINDER_OFFSETS = [3, 0, -1, -3];
const TIME_ZONE = "America/Sao_Paulo";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ymdInTz(date: Date, tz: string): string {
  // en-CA => formato yyyy-mm-dd
  return date.toLocaleDateString("en-CA", { timeZone: tz });
}

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDateBr(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

function formatPrice(value: number | null | undefined): string {
  if (value == null || Number(value) <= 0) return "";
  return `R$ ${Number(value).toFixed(2).replace(".", ",")}`;
}

function buildMessage(offset: number, endDateBr: string) {
  if (offset > 0) {
    return {
      subject: `Sua assinatura ${BRAND_NAME} vence em ${offset} ${offset === 1 ? "dia" : "dias"}`,
      headline: `Sua assinatura vence em ${offset} ${offset === 1 ? "dia" : "dias"}`,
      body: `Sua assinatura vence em <strong>${endDateBr}</strong>. Renove com antecedência para evitar a interrupção do sistema.`,
    };
  }
  if (offset === 0) {
    return {
      subject: `Sua assinatura ${BRAND_NAME} vence hoje`,
      headline: "Sua assinatura vence hoje",
      body: `Sua assinatura vence <strong>hoje (${endDateBr})</strong>. Efetue o pagamento para manter o acesso sem interrupção.`,
    };
  }
  const daysLate = Math.abs(offset);
  return {
    subject: `Sua assinatura ${BRAND_NAME} está vencida`,
    headline: "Sua assinatura está vencida",
    body: `Sua assinatura venceu em <strong>${endDateBr}</strong> (há ${daysLate} ${daysLate === 1 ? "dia" : "dias"}). Regularize o pagamento o quanto antes para evitar o bloqueio do sistema.`,
  };
}

function buildHtml(params: {
  companyName: string;
  planName: string | null;
  price: string;
  offset: number;
  endDateBr: string;
}): string {
  const { companyName, planName, price, offset, endDateBr } = params;
  const msg = buildMessage(offset, endDateBr);
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #F59E0B; color: #000; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
        .info-row { margin: 10px 0; padding: 10px; background-color: #fff; border-left: 3px solid #F59E0B; }
        .label { font-weight: bold; color: #555; }
        .value { color: #333; margin-top: 5px; }
        .cta { margin-top: 20px; font-size: 14px; }
        .footer { margin-top: 30px; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>${msg.headline}</h2>
        </div>
        <div class="content">
          <p>Olá, <strong>${companyName}</strong>.</p>
          <p>${msg.body}</p>

          ${planName ? `<div class="info-row"><div class="label">Plano:</div><div class="value">${planName}${price ? ` — ${price}` : ""}</div></div>` : ""}
          <div class="info-row">
            <div class="label">Vencimento:</div>
            <div class="value">${endDateBr}</div>
          </div>

          <p class="cta">Para renovar, acesse o sistema e vá em <strong>Planos</strong>.</p>

          <div class="footer">
            <p>${BRAND_COPYRIGHT}</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

interface SubscriptionRow {
  id: string;
  company_id: string;
  end_date: string;
  status: string;
  subscription_plans: { name: string | null; price: number | null } | { name: string | null; price: number | null }[] | null;
  companies: { name: string | null; company_email: string | null } | { name: string | null; company_email: string | null }[] | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Serviço temporariamente indisponível." }, 500);
  }

  // Autenticação: apenas o service role (chamado pelo cron) pode executar.
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token || token !== SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Não autorizado." }, 401);
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Number(body?.limit) > 0 ? Number(body.limit) : 500;

    if (!RESEND_API_KEY) {
      console.warn("[subscription-expiration-reminder] RESEND_API_KEY não configurada.");
      return jsonResponse({ success: false, message: "Email service not configured" }, 200);
    }

    const today = ymdInTz(new Date(), TIME_ZONE);

    // Mapa data-alvo -> offset (dias até o vencimento).
    const targetByDate = new Map<string, number>();
    for (const offset of REMINDER_OFFSETS) {
      targetByDate.set(addDaysYmd(today, offset), offset);
    }
    const targetDates = Array.from(targetByDate.keys());

    const { data: subsData, error: subsError } = await supabaseAdmin
      .from("company_subscriptions")
      .select(
        "id, company_id, end_date, status, subscription_plans(name, price), companies(name, company_email)",
      )
      .eq("status", "active")
      .in("end_date", targetDates)
      .limit(limit);

    if (subsError) {
      console.error("[subscription-expiration-reminder] erro ao buscar assinaturas:", subsError);
      return jsonResponse({ success: false, error: subsError.message }, 200);
    }

    const subs = (subsData || []) as SubscriptionRow[];
    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const sub of subs) {
      const offset = targetByDate.get(sub.end_date);
      if (offset === undefined) {
        skipped++;
        continue;
      }

      const company = Array.isArray(sub.companies) ? sub.companies[0] : sub.companies;
      const plan = Array.isArray(sub.subscription_plans) ? sub.subscription_plans[0] : sub.subscription_plans;

      const toEmail = String(company?.company_email || "").trim();
      if (!toEmail) {
        skipped++;
        continue;
      }

      // Deduplicação: já enviado neste ciclo/janela?
      const { data: existing } = await supabaseAdmin
        .from("subscription_reminder_log")
        .select("id")
        .eq("subscription_id", sub.id)
        .eq("end_date", sub.end_date)
        .eq("days_offset", offset)
        .maybeSingle();

      if (existing) {
        skipped++;
        continue;
      }

      const endDateBr = formatDateBr(sub.end_date);
      const html = buildHtml({
        companyName: company?.name || BRAND_NAME,
        planName: plan?.name ?? null,
        price: formatPrice(plan?.price),
        offset,
        endDateBr,
      });
      const subject = buildMessage(offset, endDateBr).subject;

      try {
        const resendResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: BRAND_FROM_EMAIL,
            to: toEmail,
            subject,
            html,
          }),
        });

        if (!resendResponse.ok) {
          const errBody = await resendResponse.json().catch(() => ({}));
          console.error("[subscription-expiration-reminder] Resend error:", sub.id, errBody);
          failed++;
          continue;
        }
      } catch (sendErr) {
        console.error("[subscription-expiration-reminder] falha no envio:", sub.id, sendErr);
        failed++;
        continue;
      }

      const { error: logErr } = await supabaseAdmin.from("subscription_reminder_log").insert({
        company_id: sub.company_id,
        subscription_id: sub.id,
        end_date: sub.end_date,
        days_offset: offset,
        email: toEmail,
      });

      if (logErr) {
        // Não reprocessa em caso de corrida (unique constraint); apenas registra.
        console.error("[subscription-expiration-reminder] falha ao gravar log:", sub.id, logErr);
      }

      sent++;
    }

    return jsonResponse({ success: true, today, processed: subs.length, sent, skipped, failed }, 200);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[subscription-expiration-reminder] Uncaught:", msg);
    return jsonResponse({ success: false, error: msg }, 500);
  }
});
