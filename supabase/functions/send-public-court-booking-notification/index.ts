import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0";

const BRAND_NAME = "PlanoAgenda";
const BRAND_FROM_EMAIL = `${BRAND_NAME} <noreply@planoagenda.com.br>`;
const BRAND_COPYRIGHT = `© ${BRAND_NAME} - Todos os direitos reservados`;

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

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "N/A";
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 13) {
    return `+${cleaned.substring(0, 2)} (${cleaned.substring(2, 4)}) ${cleaned.substring(4, 9)}-${cleaned.substring(9)}`;
  }
  if (cleaned.length === 11) {
    return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 7)}-${cleaned.substring(7)}`;
  }
  if (cleaned.length === 10) {
    return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 6)}-${cleaned.substring(6)}`;
  }
  return phone;
}

function formatDateBr(isoDate: string | null | undefined): string {
  if (!isoDate) return "N/A";
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
}

function formatTime(time: string | null | undefined): string {
  if (!time) return "N/A";
  return time.substring(0, 5);
}

function formatPrice(value: number | null | undefined): string {
  if (value == null || Number(value) <= 0) return "—";
  return `R$ ${Number(value).toFixed(2).replace(".", ",")}`;
}

function paymentLabel(method: string | null | undefined): string {
  const map: Record<string, string> = {
    mercado_pago: "Mercado Pago (online)",
    dinheiro: "Dinheiro / balcão",
    pix: "Pix",
    cartao_credito: "Cartão de crédito",
    cartao_debito: "Cartão de débito",
  };
  return map[String(method || "").toLowerCase()] || "N/A";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[send-public-court-booking-notification] Supabase env não configurado.");
      return jsonResponse({ success: false, message: "Server not configured" }, 200);
    }

    const body = await req.json().catch(() => ({}));
    const appointmentId = body?.appointment_id;
    if (!appointmentId) {
      return jsonResponse({ success: false, message: "appointment_id is required" }, 400);
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: appt, error: apptErr } = await supabaseAdmin
      .from("appointments")
      .select(
        `id, company_id, client_id, client_nickname, court_id, appointment_date, appointment_time,
         total_duration_minutes, total_price, payment_method, court_sport_name, status,
         booking_kind, created_by_user_id, public_booking_notified_at,
         clients(name, phone), courts(name), companies(name, public_booking_notification_email)`,
      )
      .eq("id", appointmentId)
      .single();

    if (apptErr || !appt) {
      console.error("[send-public-court-booking-notification] reserva não encontrada:", appointmentId, apptErr);
      return jsonResponse({ success: false, message: "Appointment not found" }, 200);
    }

    // Revalida as condições (defesa em profundidade além do trigger).
    // O aviso é enviado na CRIAÇÃO da reserva pública (status pendente), exceto se já cancelada.
    if (
      appt.booking_kind !== "court" ||
      appt.created_by_user_id !== null ||
      String(appt.status || "").toLowerCase() === "cancelado"
    ) {
      return jsonResponse({ success: true, skipped: "not_a_public_court_booking" }, 200);
    }

    // Idempotência: já notificada.
    if (appt.public_booking_notified_at) {
      return jsonResponse({ success: true, skipped: "already_notified" }, 200);
    }

    const company = Array.isArray(appt.companies) ? appt.companies[0] : appt.companies;
    const client = Array.isArray(appt.clients) ? appt.clients[0] : appt.clients;
    const court = Array.isArray(appt.courts) ? appt.courts[0] : appt.courts;

    const toEmail = String(company?.public_booking_notification_email || "").trim();
    if (!toEmail) {
      return jsonResponse({ success: true, skipped: "no_notification_email" }, 200);
    }

    if (!RESEND_API_KEY) {
      console.warn("[send-public-court-booking-notification] RESEND_API_KEY não configurada.");
      return jsonResponse({ success: false, message: "Email service not configured" }, 200);
    }

    const clientName = (appt.client_nickname || client?.name || "Cliente").trim();
    const clientPhone = formatPhone(client?.phone);
    const courtName = court?.name || "Quadra";
    const dateBr = formatDateBr(appt.appointment_date);
    const timeStr = formatTime(appt.appointment_time);
    const duration = appt.total_duration_minutes ?? 60;
    const sport = (appt.court_sport_name || "").trim();
    const price = formatPrice(appt.total_price);
    const payment = paymentLabel(appt.payment_method);
    const companyName = company?.name || BRAND_NAME;

    const emailHtml = `
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
          .footer { margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>Nova reserva recebida</h2>
          </div>
          <div class="content">
            <p>Uma nova reserva foi feita pelo link público de <strong>${companyName}</strong>.</p>

            <div class="info-row">
              <div class="label">Cliente:</div>
              <div class="value">${clientName}</div>
            </div>
            <div class="info-row">
              <div class="label">Telefone do cliente:</div>
              <div class="value">${clientPhone}</div>
            </div>
            <div class="info-row">
              <div class="label">Quadra:</div>
              <div class="value">${courtName}</div>
            </div>
            ${sport ? `<div class="info-row"><div class="label">Esporte / modalidade:</div><div class="value">${sport}</div></div>` : ""}
            <div class="info-row">
              <div class="label">Data:</div>
              <div class="value">${dateBr}</div>
            </div>
            <div class="info-row">
              <div class="label">Horário:</div>
              <div class="value">${timeStr} (${duration} min)</div>
            </div>
            <div class="info-row">
              <div class="label">Valor:</div>
              <div class="value">${price}</div>
            </div>
            <div class="info-row">
              <div class="label">Forma de pagamento:</div>
              <div class="value">${payment}</div>
            </div>

            <div class="footer">
              <p>${BRAND_COPYRIGHT}</p>
            </div>
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
        to: toEmail,
        subject: `Nova reserva - ${courtName} ${dateBr} ${timeStr}`,
        html: emailHtml,
      }),
    });

    const resendData = await resendResponse.json().catch(() => ({}));

    if (!resendResponse.ok) {
      console.error("[send-public-court-booking-notification] Resend error:", resendData);
      return jsonResponse({ success: false, message: "Failed to send email", error: resendData }, 200);
    }

    // Marca como notificada para não reenviar.
    const { error: updErr } = await supabaseAdmin
      .from("appointments")
      .update({ public_booking_notified_at: new Date().toISOString() })
      .eq("id", appointmentId);

    if (updErr) {
      console.error("[send-public-court-booking-notification] falha ao marcar notified_at:", updErr);
    }

    return jsonResponse({ success: true, message: "Email sent" }, 200);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[send-public-court-booking-notification] Uncaught:", msg);
    return jsonResponse({ success: false, error: msg }, 500);
  }
});
