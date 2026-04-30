import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.0';
import { format, addMonths, parseISO, startOfDay, isPast } from 'https://esm.sh/date-fns@3.6.0';

const BRAND_NAME = "PlanoAgenda";
const BRAND_FROM_EMAIL = `${BRAND_NAME} <noreply@planoagenda.com.br>`;
const BRAND_COPYRIGHT = `© ${BRAND_NAME} - Todos os direitos reservados`;

function getBrandFooterHtml(): string {
  return `<p>${BRAND_COPYRIGHT}</p>`;
}

/** Decifra credenciais MP por empresa (envelope AES-GCM v1). */
function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function getCompanyPaymentMasterKey(): Uint8Array | null {
  const raw = Deno.env.get("COMPANY_PAYMENT_CREDENTIALS_ENCRYPTION_KEY")?.trim();
  if (!raw) return null;
  try {
    const keyBytes = base64ToBytes(raw);
    if (keyBytes.length !== 32) return null;
    return keyBytes;
  } catch {
    return null;
  }
}

async function decryptCredentialsPayload(
  envelopeStr: string,
  rawKey: Uint8Array,
): Promise<Record<string, unknown> | null> {
  let envelope: { v?: number; iv?: string; d?: string };
  try {
    envelope = JSON.parse(envelopeStr) as { v?: number; iv?: string; d?: string };
  } catch {
    return null;
  }
  if (envelope.v !== 1 || !envelope.iv || !envelope.d) return null;
  const iv = base64ToBytes(envelope.iv);
  const ct = base64ToBytes(envelope.d);
  const key = await crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ct,
    );
    const text = new TextDecoder().decode(plain);
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
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

/** Valor líquido cobrado no Mercado Pago (usa na base da comissão de vendedor externo). */
function getMercadoPagoTransactionAmount(payment: Record<string, unknown>): number | null {
  const tx = payment.transaction_amount;
  const details = (payment.transaction_details as Record<string, unknown> | undefined)?.total_paid_amount;
  const n = Number(tx ?? details);
  return Number.isFinite(n) ? n : null;
}

/**
 * Comissão de vendedor externo (tabelas external_sales_*). Não altera commission_payments / colaboradores.
 * Falhas são apenas logadas para não bloquear assinatura.
 */
async function recordExternalSalesAccrual(
  supabaseAdmin: ReturnType<typeof createClient>,
  args: {
    companyId: string;
    mpPaymentId: string;
    baseAmount: number | null;
    sourceKind: "subscription_payment" | "plan_upgrade";
    paymentAttemptId: string | null;
    subscriptionChangeRequestId: string | null;
    observations?: string | null;
  },
): Promise<void> {
  if (args.baseAmount === null || !Number.isFinite(args.baseAmount) || args.baseAmount <= 0) {
    console.warn("[external_sales] comissão não lançada: valor base inválido", args);
    return;
  }
  const { data, error } = await supabaseAdmin.rpc("external_sales_record_accrual", {
    p_company_id: args.companyId,
    p_mercadopago_payment_id: args.mpPaymentId,
    p_base_amount: args.baseAmount,
    p_source_kind: args.sourceKind,
    p_payment_attempt_id: args.paymentAttemptId,
    p_subscription_change_request_id: args.subscriptionChangeRequestId,
    p_observations: args.observations ?? null,
  });
  if (error) {
    console.error("[external_sales] external_sales_record_accrual:", error);
    return;
  }
  console.log("[external_sales] resultado:", data);
}

/** Mesmos status tratados em quadra/pacote para estorno MP. */
function isMercadoPagoRefundLikeStatus(status: unknown): boolean {
  const s = String(status ?? "").toLowerCase();
  return s === "refunded" || s === "charged_back" || s === "chargeback";
}

/** Debita comissão de vendedor externo se existir acréscimo para este payment id (idempotente). */
async function recordExternalSalesReversalIfApplicable(
  supabaseAdmin: ReturnType<typeof createClient>,
  mpPaymentId: string,
  observations: string,
): Promise<void> {
  const { data, error } = await supabaseAdmin.rpc("external_sales_record_reversal_for_payment", {
    p_original_mercadopago_payment_id: String(mpPaymentId),
    p_observations: observations,
  });
  if (error) {
    console.error("[external_sales] external_sales_record_reversal_for_payment:", error);
    return;
  }
  console.log("[external_sales] estorno comissão:", data);
}

/**
 * Verifica se o plano tem o menu WhatsApp e envia email de notificação se necessário
 * @param supabaseAdmin Cliente Supabase Admin
 * @param companyId ID da empresa
 * @param planId ID do plano
 */
async function checkAndNotifyWhatsAppPlan(supabaseAdmin: any, companyId: string, planId: string) {
  try {
    // 1. Buscar menu WhatsApp pelo menu_key
    const { data: whatsappMenu, error: menuError } = await supabaseAdmin
      .from('menus')
      .select('id')
      .eq('menu_key', 'mensagens-whatsapp')
      .eq('is_active', true)
      .single();

    if (menuError || !whatsappMenu) {
      console.log('[checkAndNotifyWhatsAppPlan] Menu WhatsApp não encontrado ou inativo. Email não será enviado.');
      return; // Plano não tem WhatsApp, não precisa enviar email
    }

    // 2. Verificar se o menu está vinculado ao plano
    const { data: menuPlan, error: menuPlanError } = await supabaseAdmin
      .from('menu_plans')
      .select('id')
      .eq('plan_id', planId)
      .eq('menu_id', whatsappMenu.id)
      .single();

    if (menuPlanError || !menuPlan) {
      console.log('[checkAndNotifyWhatsAppPlan] Menu WhatsApp não está vinculado ao plano. Email não será enviado.');
      return; // Plano não tem WhatsApp, não precisa enviar email
    }

    // 3. Plano TEM WhatsApp! Buscar dados da empresa
    console.log('[checkAndNotifyWhatsAppPlan] ✅ Plano tem WhatsApp! Buscando dados da empresa...');
    const { data: companyData, error: companyError } = await supabaseAdmin
      .from('companies')
      .select('name, razao_social, cnpj, phone_number, address, number, neighborhood, complement, zip_code, city, state')
      .eq('id', companyId)
      .single();

    if (companyError || !companyData) {
      console.error('[checkAndNotifyWhatsAppPlan] Erro ao buscar dados da empresa:', companyError);
      return; // Não falhar o fluxo se não conseguir buscar dados
    }

    // 4. Formatar dados
    const formatPhone = (phone: string) => {
      if (!phone) return 'N/A';
      const cleaned = phone.replace(/\D/g, '');
      if (cleaned.length === 11) {
        return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 7)}-${cleaned.substring(7)}`;
      } else if (cleaned.length === 10) {
        return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 6)}-${cleaned.substring(6)}`;
      }
      return phone || 'N/A';
    };

    const formatCnpj = (cnpj: string) => {
      if (!cnpj) return 'N/A';
      const cleaned = cnpj.replace(/\D/g, '');
      if (cleaned.length === 14) {
        return `${cleaned.substring(0, 2)}.${cleaned.substring(2, 5)}.${cleaned.substring(5, 8)}/${cleaned.substring(8, 12)}-${cleaned.substring(12)}`;
      }
      return cnpj || 'N/A';
    };

    const formatZipCode = (zip: string) => {
      if (!zip) return '';
      const cleaned = zip.replace(/\D/g, '');
      if (cleaned.length === 8) {
        return `${cleaned.substring(0, 5)}-${cleaned.substring(5)}`;
      }
      return zip || '';
    };

    const formattedCompanyPhone = formatPhone(companyData.phone_number || '');
    const formattedCnpj = formatCnpj(companyData.cnpj || '');
    const formattedZipCode = formatZipCode(companyData.zip_code || '');
    
    // Build address string
    const addressParts = [
      companyData.address || '',
      companyData.number ? `Nº ${companyData.number}` : '',
      companyData.neighborhood || '',
      companyData.complement || '',
      companyData.city || '',
      companyData.state || '',
      formattedZipCode
    ].filter(part => part.trim() !== '');
    const fullAddress = addressParts.length > 0 ? addressParts.join(', ') : 'N/A';

    // 5. Gerar link WhatsApp
    const whatsappNumber = companyData.phone_number?.replace(/\D/g, '') || '';
    const whatsappLink = whatsappNumber ? `https://wa.me/55${whatsappNumber}` : 'N/A';

    // 6. Montar e enviar email
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      console.warn('[checkAndNotifyWhatsAppPlan] RESEND_API_KEY não configurada. Email não será enviado.');
      return;
    }

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #25D366; color: #fff; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
          .info-row { margin: 10px 0; padding: 10px; background-color: #fff; border-left: 3px solid #25D366; }
          .label { font-weight: bold; color: #555; }
          .value { color: #333; margin-top: 5px; }
          .whatsapp-link { display: inline-block; padding: 12px 24px; background-color: #25D366; color: #fff; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 10px 0; }
          .footer { margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>🚀 NOVO CLIENTE WHATSAPP</h2>
          </div>
          <div class="content">
            <p>Uma empresa acabou de assinar um plano que inclui o módulo de Mensagens WhatsApp.</p>
            <p><strong>Ação necessária:</strong> Configure a API de WhatsApp para esta empresa.</p>
            
            <div class="info-row">
              <div class="label">Razão Social:</div>
              <div class="value">${companyData.razao_social || 'N/A'}</div>
            </div>
            
            <div class="info-row">
              <div class="label">Nome Fantasia:</div>
              <div class="value">${companyData.name || 'N/A'}</div>
            </div>
            
            <div class="info-row">
              <div class="label">CNPJ:</div>
              <div class="value">${formattedCnpj || 'N/A'}</div>
            </div>
            
            <div class="info-row">
              <div class="label">Endereço Completo:</div>
              <div class="value">${fullAddress || 'N/A'}</div>
            </div>
            
            <div class="info-row">
              <div class="label">Telefones de Contato:</div>
              <div class="value">${formattedCompanyPhone || 'N/A'}</div>
            </div>
            
            <div class="info-row">
              <div class="label">Link Direto WhatsApp:</div>
              <div class="value">
                ${whatsappLink !== 'N/A' ? `<a href="${whatsappLink}" class="whatsapp-link" target="_blank">Abrir WhatsApp</a>` : 'N/A'}
              </div>
            </div>
            
            <div class="footer">
              ${getBrandFooterHtml()}
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const adminEmail = 'edricolpani@hotmail.com';
    console.log('[checkAndNotifyWhatsAppPlan] Enviando email de notificação WhatsApp para:', adminEmail);

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: BRAND_FROM_EMAIL,
        to: adminEmail,
        subject: `🚀 NOVO CLIENTE WHATSAPP - ${companyData.razao_social || companyData.name || 'Empresa'}`,
        html: emailHtml,
      }),
    });

    const emailData = await emailResponse.json();

    if (emailResponse.ok) {
      console.log('[checkAndNotifyWhatsAppPlan] ✅ Email de notificação WhatsApp enviado com sucesso!');
    } else {
      console.error('[checkAndNotifyWhatsAppPlan] ❌ Erro ao enviar email:', emailData);
      if (emailData.statusCode === 403 && emailData.message?.includes('testing emails')) {
        console.warn('[checkAndNotifyWhatsAppPlan] Resend está em modo de teste.');
      }
    }
  } catch (error: any) {
    console.error('[checkAndNotifyWhatsAppPlan] Erro inesperado (não crítico):', error.message);
    // Não falhar o fluxo de assinatura se o email falhar
  }
}

const COURTBOOK_PREFIX = "courtbook:";
const COURTPACKAGE_PREFIX = "courtpackage:";
const SUBSCRIPTION_CHANGE_PREFIX = "subchange:";

async function tryFetchCourtPaymentWithSellerTokens(
  supabaseAdmin: ReturnType<typeof createClient>,
  paymentId: string,
): Promise<Record<string, unknown> | null> {
  const master = getCompanyPaymentMasterKey();
  if (!master) return null;

  const since = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
  const { data: apptRows, error: apptError } = await supabaseAdmin
    .from("appointments")
    .select("company_id")
    .eq("booking_kind", "court")
    .eq("payment_method", "mercado_pago")
    .eq("status", "pendente")
    .is("mp_payment_id", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(60);

  if (apptError) console.error("[mercadopago-webhook] scan appointments:", apptError);

  const { data: pkgRows, error: pkgError } = await supabaseAdmin
    .from("court_monthly_packages")
    .select("company_id")
    .eq("payment_method", "mercado_pago")
    .in("status", ["pending_payment", "active"])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(60);

  if (pkgError) console.error("[mercadopago-webhook] scan monthly packages:", pkgError);

  const companies = new Set<string>();
  for (const row of apptRows || []) {
    const companyId = String((row as { company_id?: string }).company_id || "");
    if (companyId) companies.add(companyId);
  }
  for (const row of pkgRows || []) {
    const companyId = String((row as { company_id?: string }).company_id || "");
    if (companyId) companies.add(companyId);
  }

  for (const companyId of companies) {
    const { data: cred } = await supabaseAdmin
      .from("company_payment_credentials")
      .select("encrypted_payload")
      .eq("company_id", companyId)
      .eq("provider", "mercadopago")
      .eq("is_active", true)
      .maybeSingle();
    if (!cred?.encrypted_payload) continue;

    const plain = await decryptCredentialsPayload(cred.encrypted_payload, master);
    const token = plain?.access_token;
    if (typeof token !== "string" || !token.trim()) continue;

    const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token.trim()}` },
    });
    if (!res.ok) continue;
    try {
      const p = await res.json() as Record<string, unknown>;
      return p;
    } catch {
      continue;
    }
  }
  return null;
}

async function processCourtBookingPayment(
  supabaseAdmin: ReturnType<typeof createClient>,
  payment: Record<string, unknown>,
  paymentId: string,
): Promise<Response> {
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
  const externalReference = String(payment.external_reference || "");
  if (!externalReference.startsWith(COURTBOOK_PREFIX)) {
    return new Response(JSON.stringify({ error: "Referência de quadra inválida." }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  const appointmentId = externalReference.slice(COURTBOOK_PREFIX.length).trim();
  if (!appointmentId) {
    return new Response(JSON.stringify({ error: "appointment id ausente." }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  const { data: appt, error: apptErr } = await supabaseAdmin
    .from("appointments")
    .select("id, total_price, status, payment_method, booking_kind, mp_payment_id")
    .eq("id", appointmentId)
    .maybeSingle();

  if (apptErr || !appt) {
    console.error("[mercadopago-webhook] court appointment not found:", appointmentId, apptErr);
    return new Response(JSON.stringify({ received: true, message: "Appointment not found for courtbook." }), {
      status: 200,
      headers: jsonHeaders,
    });
  }

  if (appt.booking_kind !== "court" || appt.payment_method !== "mercado_pago") {
    return new Response(JSON.stringify({ received: true, message: "Not a court MP booking." }), {
      status: 200,
      headers: jsonHeaders,
    });
  }

  const mpStatus = String(payment.status || "");
  const isRefundedStatus = mpStatus === "refunded" || mpStatus === "charged_back" || mpStatus === "chargeback";
  if (appt.status === "confirmado" && !isRefundedStatus) {
    return new Response(JSON.stringify({ received: true, court: true, alreadyConfirmed: true }), {
      status: 200,
      headers: jsonHeaders,
    });
  }

  const txAmount = Number(
    (payment as { transaction_amount?: unknown }).transaction_amount ??
      (payment as { transaction_details?: { total_paid_amount?: unknown } }).transaction_details
        ?.total_paid_amount,
  );
  const expected = Number(appt.total_price);
  const amountOk = !Number.isNaN(txAmount) && !Number.isNaN(expected) && Math.abs(txAmount - expected) < 0.02;

  const patch: Record<string, unknown> = {
    mp_payment_status: mpStatus,
  };

  if (isRefundedStatus) {
    patch.mp_payment_status = "refund_approved";
    if (appt.status !== "concluido") {
      patch.status = "cancelado";
      patch.cancelled_at = new Date().toISOString();
      patch.cancellation_reason = "Estorno confirmado pelo Mercado Pago (webhook).";
    }
  } else if (mpStatus === "approved" && amountOk) {
    patch.status = "confirmado";
    patch.mp_payment_id = String(paymentId);
  } else if (mpStatus === "approved" && !amountOk) {
    console.warn("[mercadopago-webhook] court payment amount mismatch", {
      appointmentId,
      txAmount,
      expected,
    });
    patch.mp_payment_status = "approved_amount_mismatch";
  }

  const { error: updErr } = await supabaseAdmin.from("appointments").update(patch).eq("id", appointmentId);
  if (updErr) {
    console.error("[mercadopago-webhook] court appointment update:", updErr);
    return new Response(JSON.stringify({ error: updErr.message }), {
      status: 500,
      headers: jsonHeaders,
    });
  }

  return new Response(
    JSON.stringify({
      success: true,
      court: true,
      appointmentId,
      paymentStatus: mpStatus,
    }),
    { status: 200, headers: jsonHeaders },
  );
}

async function processCourtMonthlyPackagePayment(
  supabaseAdmin: ReturnType<typeof createClient>,
  payment: Record<string, unknown>,
  paymentId: string,
): Promise<Response> {
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
  const externalReference = String(payment.external_reference || "");
  if (!externalReference.startsWith(COURTPACKAGE_PREFIX)) {
    return new Response(JSON.stringify({ error: "Referência de pacote mensal inválida." }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  const packageId = externalReference.slice(COURTPACKAGE_PREFIX.length).trim();
  if (!packageId) {
    return new Response(JSON.stringify({ error: "package id ausente." }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  const { data: pkg, error: pkgErr } = await supabaseAdmin
    .from("court_monthly_packages")
    .select("id, total_amount, status, payment_method, payment_status")
    .eq("id", packageId)
    .maybeSingle();

  if (pkgErr || !pkg) {
    console.error("[mercadopago-webhook] monthly package not found:", packageId, pkgErr);
    return new Response(JSON.stringify({ received: true, message: "Monthly package not found." }), {
      status: 200,
      headers: jsonHeaders,
    });
  }

  if (pkg.payment_method !== "mercado_pago") {
    return new Response(JSON.stringify({ received: true, message: "Package is not Mercado Pago." }), {
      status: 200,
      headers: jsonHeaders,
    });
  }

  const mpStatus = String(payment.status || "");
  const isRefundedStatus = mpStatus === "refunded" || mpStatus === "charged_back" || mpStatus === "chargeback";

  const txAmount = Number(
    (payment as { transaction_amount?: unknown }).transaction_amount ??
      (payment as { transaction_details?: { total_paid_amount?: unknown } }).transaction_details?.total_paid_amount,
  );
  const expected = Number(pkg.total_amount);
  const amountOk = !Number.isNaN(txAmount) && !Number.isNaN(expected) && Math.abs(txAmount - expected) < 0.02;

  const patch: Record<string, unknown> = {
    mp_payment_status: mpStatus,
  };

  if (isRefundedStatus) {
    patch.mp_payment_status = "refund_approved";
    patch.payment_status = "refunded";
    patch.status = "cancelled";
    patch.cancelled_at = new Date().toISOString();
  } else if (mpStatus === "approved" && amountOk) {
    patch.mp_payment_id = String(paymentId);
    patch.payment_status = "paid";
    patch.status = "active";
  } else if (mpStatus === "approved" && !amountOk) {
    console.warn("[mercadopago-webhook] monthly package amount mismatch", {
      packageId,
      txAmount,
      expected,
    });
    patch.mp_payment_status = "approved_amount_mismatch";
  }

  const { error: updPkgErr } = await supabaseAdmin
    .from("court_monthly_packages")
    .update(patch)
    .eq("id", packageId);
  if (updPkgErr) {
    console.error("[mercadopago-webhook] monthly package update:", updPkgErr);
    return new Response(JSON.stringify({ error: updPkgErr.message }), {
      status: 500,
      headers: jsonHeaders,
    });
  }

  const { data: links, error: linksErr } = await supabaseAdmin
    .from("court_monthly_package_appointments")
    .select("appointment_id")
    .eq("package_id", packageId);
  if (linksErr) {
    console.error("[mercadopago-webhook] monthly package links:", linksErr);
    return new Response(JSON.stringify({ error: linksErr.message }), {
      status: 500,
      headers: jsonHeaders,
    });
  }

  const appointmentIds = (links || [])
    .map((row) => String((row as { appointment_id?: string }).appointment_id || ""))
    .filter((id) => id.length > 0);

  if (appointmentIds.length > 0) {
    if (isRefundedStatus) {
      const { error: updApptErr } = await supabaseAdmin
        .from("appointments")
        .update({
          status: "cancelado",
          mp_payment_status: "refund_approved",
          cancellation_reason: "Estorno do pacote mensal confirmado pelo Mercado Pago (webhook).",
          cancelled_at: new Date().toISOString(),
        })
        .in("id", appointmentIds)
        .neq("status", "concluido");
      if (updApptErr) {
        console.error("[mercadopago-webhook] monthly package appointments refund update:", updApptErr);
        return new Response(JSON.stringify({ error: updApptErr.message }), {
          status: 500,
          headers: jsonHeaders,
        });
      }
    } else if (mpStatus === "approved" && amountOk) {
      const { error: updApptErr } = await supabaseAdmin
        .from("appointments")
        .update({
          status: "confirmado",
          mp_payment_status: "approved",
          mp_payment_id: String(paymentId),
        })
        .in("id", appointmentIds)
        .eq("status", "pendente");
      if (updApptErr) {
        console.error("[mercadopago-webhook] monthly package appointments approve update:", updApptErr);
        return new Response(JSON.stringify({ error: updApptErr.message }), {
          status: 500,
          headers: jsonHeaders,
        });
      }
    } else {
      const { error: updApptErr } = await supabaseAdmin
        .from("appointments")
        .update({
          mp_payment_status: mpStatus,
        })
        .in("id", appointmentIds)
        .eq("status", "pendente");
      if (updApptErr) {
        console.error("[mercadopago-webhook] monthly package appointments status update:", updApptErr);
        return new Response(JSON.stringify({ error: updApptErr.message }), {
          status: 500,
          headers: jsonHeaders,
        });
      }
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      monthlyPackage: true,
      packageId,
      paymentStatus: mpStatus,
    }),
    { status: 200, headers: jsonHeaders },
  );
}

async function processSubscriptionPlanChangePayment(
  supabaseAdmin: ReturnType<typeof createClient>,
  payment: Record<string, unknown>,
  paymentId: string,
): Promise<Response> {
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
  const externalReference = String(payment.external_reference || "");
  const payload = externalReference.slice(SUBSCRIPTION_CHANGE_PREFIX.length).trim();
  const [changeRequestId, paymentAttemptId] = payload.split(":");

  if (!changeRequestId || !paymentAttemptId) {
    return new Response(JSON.stringify({ error: "Referência de troca de plano inválida." }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  const mpStatus = String(payment.status || "");
  let paymentAttemptStatus = "failed";
  if (mpStatus === "approved") paymentAttemptStatus = "approved";
  if (mpStatus === "pending") paymentAttemptStatus = "pending";
  if (mpStatus === "rejected") paymentAttemptStatus = "rejected";

  await supabaseAdmin
    .from("payment_attempts")
    .update({ status: paymentAttemptStatus, payment_gateway_reference: paymentId })
    .eq("id", paymentAttemptId);

  const { data: changeRequest, error: changeRequestError } = await supabaseAdmin
    .from("subscription_change_requests")
    .select("id, company_id, subscription_id, to_plan_id, status, proration_amount")
    .eq("id", changeRequestId)
    .eq("payment_attempt_id", paymentAttemptId)
    .maybeSingle();

  if (changeRequestError || !changeRequest) {
    console.error("[mercadopago-webhook] subscription change request not found:", changeRequestError);
    return new Response(JSON.stringify({ received: true, message: "Change request not found." }), {
      status: 200,
      headers: jsonHeaders,
    });
  }

  if (changeRequest.status === "applied") {
    if (isMercadoPagoRefundLikeStatus(mpStatus)) {
      await recordExternalSalesReversalIfApplicable(
        supabaseAdmin,
        String(paymentId),
        "Estorno ou chargeback — pagamento de upgrade de plano (Mercado Pago).",
      );
    }
    return new Response(JSON.stringify({ received: true, alreadyApplied: true }), {
      status: 200,
      headers: jsonHeaders,
    });
  }

  if (mpStatus !== "approved") {
    const status = mpStatus === "pending" ? "pending_payment" : "failed";
    await supabaseAdmin
      .from("subscription_change_requests")
      .update({
        status,
        payment_gateway_reference: paymentId,
        failure_reason: mpStatus === "pending" ? null : `Pagamento ${mpStatus}`,
      })
      .eq("id", changeRequest.id);

    // Sem acréscimo de upgrade se nunca foi approved/applied — reversal é no-op se não houve lançamento.
    if (isMercadoPagoRefundLikeStatus(mpStatus)) {
      await recordExternalSalesReversalIfApplicable(
        supabaseAdmin,
        String(paymentId),
        "Estorno ou chargeback — tentativa de pagamento de upgrade (sem plano aplicado).",
      );
    }

    return new Response(JSON.stringify({ received: true, message: `Payment status ${mpStatus}.` }), {
      status: 200,
      headers: jsonHeaders,
    });
  }

  const { error: subscriptionUpdateError } = await supabaseAdmin
    .from("company_subscriptions")
    .update({
      plan_id: changeRequest.to_plan_id,
      next_plan_id: null,
      pending_change_type: null,
    })
    .eq("id", changeRequest.subscription_id);

  if (subscriptionUpdateError) {
    console.error("[mercadopago-webhook] failed to update subscription plan:", subscriptionUpdateError);
    return new Response(JSON.stringify({ error: subscriptionUpdateError.message }), {
      status: 500,
      headers: jsonHeaders,
    });
  }

  await supabaseAdmin.rpc("sync_company_flags_from_plan", {
    p_company_id: changeRequest.company_id,
    p_plan_id: changeRequest.to_plan_id,
  });

  await supabaseAdmin
    .from("subscription_change_requests")
    .update({
      status: "applied",
      applied_at: new Date().toISOString(),
      payment_gateway_reference: paymentId,
      failure_reason: null,
    })
    .eq("id", changeRequest.id);

  const proration = Number((changeRequest as { proration_amount?: unknown }).proration_amount);
  const txAmt = getMercadoPagoTransactionAmount(payment);
  const baseAmount =
    !Number.isNaN(proration) && proration > 0 ? proration : (txAmt ?? null);
  await recordExternalSalesAccrual(supabaseAdmin, {
    companyId: String(changeRequest.company_id),
    mpPaymentId: String(paymentId),
    baseAmount,
    sourceKind: "plan_upgrade",
    paymentAttemptId: paymentAttemptId,
    subscriptionChangeRequestId: String(changeRequest.id),
    observations: "Upgrade de plano (proration ou valor MP).",
  });

  return new Response(JSON.stringify({ received: true, upgraded: true, changeRequestId: changeRequest.id }), {
    status: 200,
    headers: jsonHeaders,
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const MERCADOPAGO_ACCESS_TOKEN = Deno.env.get('PAYMENT_API_KEY_SECRET');

  if (!MERCADOPAGO_ACCESS_TOKEN) {
    console.error('MERCADOPAGO_ACCESS_TOKEN not set.');
    return jsonResponse({ error: 'Serviço de pagamento temporariamente indisponível.' }, 500);
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  let paymentAttemptId: string | null = null; // Declare here to be accessible in catch block

  try {
    const body = await req.json();
    const { type, data } = body;

    console.log('Webhook Received:', { type, data });

    if (type !== 'payment' || !data || !data.id) {
      return jsonResponse({ received: true, message: 'Notificação ignorada (tipo não suportado ou sem ID).' }, 200);
    }

    const paymentId = data.id;

    let payment: Record<string, unknown> | null = null;

    const mpPaymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
      },
    });

    if (mpPaymentResponse.ok) {
      payment = await mpPaymentResponse.json() as Record<string, unknown>;
    } else {
      const errBody = await mpPaymentResponse.text().catch(() => '');
      console.warn('[mercadopago-webhook] platform GET payment failed, trying court seller tokens', mpPaymentResponse.status, errBody.slice(0, 300));
      payment = await tryFetchCourtPaymentWithSellerTokens(supabaseAdmin, String(paymentId));
    }

    if (!payment) {
      // Mesmo comportamento esperado de antes: falha ao obter o pagamento → erro HTTP para o MP reenviar.
      // (Só chegamos aqui se o GET com PAYMENT_API_KEY_SECRET falhou E o scan com token da arena não resolveu.)
      throw new Error(
        `Não foi possível obter o pagamento ${paymentId} na API do Mercado Pago (assinatura ou arena).`,
      );
    }

    console.log('Payment Status:', payment.status);
    console.log('External Reference:', payment.external_reference);

    const externalReference = String(payment.external_reference || '');

    if (externalReference.startsWith(COURTBOOK_PREFIX)) {
      return await processCourtBookingPayment(supabaseAdmin, payment, String(paymentId));
    }
    if (externalReference.startsWith(COURTPACKAGE_PREFIX)) {
      return await processCourtMonthlyPackagePayment(supabaseAdmin, payment, String(paymentId));
    }
    if (externalReference.startsWith(SUBSCRIPTION_CHANGE_PREFIX)) {
      return await processSubscriptionPlanChangePayment(supabaseAdmin, payment, String(paymentId));
    }

    // Assinaturas PlanoAgenda (external_reference com underscores)
    if (!externalReference) {
        console.error('Missing external_reference in payment data.');
        return jsonResponse({ error: 'Referência externa ausente no pagamento.' }, 400);
    }
    
    const parts = externalReference.split('_');
    // Updated check for parts length to include paymentAttemptId
    if (parts.length < 5) { 
        console.error('Invalid external_reference format:', externalReference);
        return jsonResponse({ error: 'Formato de referência externa inválido.' }, 400);
    }
    
    const [companyId, planId, finalDurationMonthsStr, couponId, extractedPaymentAttemptId] = parts;
    const finalDurationMonths = parseInt(finalDurationMonthsStr);
    const hasCoupon = couponId !== 'none';
    paymentAttemptId = extractedPaymentAttemptId; // Assign to outer scope variable

    // --- NEW: Update payment attempt status based on Mercado Pago status ---
    let newPaymentAttemptStatus: string;
    switch (payment.status) {
        case 'approved':
            newPaymentAttemptStatus = 'approved';
            break;
        case 'pending':
            newPaymentAttemptStatus = 'pending';
            break;
        case 'rejected':
            newPaymentAttemptStatus = 'rejected';
            break;
        default:
            newPaymentAttemptStatus = 'failed'; // Catch all other statuses as failed
    }

    const { error: paUpdateError } = await supabaseAdmin
        .from('payment_attempts')
        .update({ status: newPaymentAttemptStatus, payment_gateway_reference: String(paymentId) }) // ID do pagamento no MP
        .eq('id', paymentAttemptId);

    if (paUpdateError) {
        console.error(`Error updating payment attempt ${paymentAttemptId} status to ${newPaymentAttemptStatus}:`, paUpdateError);
        // Continue, as subscription is the main goal, but log the error
    } else {
        console.log(`Payment attempt ${paymentAttemptId} status updated to ${newPaymentAttemptStatus}.`);
    }

    if (payment.status !== 'approved') {
      if (isMercadoPagoRefundLikeStatus(payment.status)) {
        await recordExternalSalesReversalIfApplicable(
          supabaseAdmin,
          String(paymentId),
          "Estorno ou chargeback — pagamento de assinatura PlanoAgenda (Mercado Pago).",
        );
      }
      return jsonResponse({ received: true, message: `Pagamento com status ${payment.status}.` }, 200);
    }

    // 3. Handle Subscription Activation/Extension (only if approved)
    const today = new Date();
    const startDate = format(today, 'yyyy-MM-dd');

    let finalEndDate: string;
    let subscriptionId: string;

    // 3.1 Tentar usar assinatura PENDENTE criada no início do fluxo
    const { data: pendingSub, error: pendingError } = await supabaseAdmin
        .from('company_subscriptions')
        .select('id')
        .eq('company_id', companyId)
        .eq('plan_id', planId)
        .eq('status', 'pending')
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (pendingError) {
        console.error('Error fetching pending subscription in webhook:', pendingError);
        throw pendingError;
    }

    // 3.2 Buscar assinatura ativa atual (para estender data de término, se existir)
    const { data: existingActive, error: activeError } = await supabaseAdmin
        .from('company_subscriptions')
        .select('id, end_date')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .order('end_date', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (activeError && activeError.code !== 'PGRST116') {
        console.error('Error fetching active subscription in webhook:', activeError);
        throw activeError;
    }

    if (pendingSub) {
        // Ativar assinatura pendente, calculando end_date a partir da assinatura ativa (se existir)
        let baseDate = today;
        if (existingActive?.end_date) {
            const currentEndDate = startOfDay(parseISO(existingActive.end_date || startDate));
            baseDate = isPast(currentEndDate) ? today : currentEndDate;
        }

        const newEndDate = addMonths(baseDate, finalDurationMonths);
        finalEndDate = format(newEndDate, 'yyyy-MM-dd');
        subscriptionId = pendingSub.id;

        const { error: updatePendingError } = await supabaseAdmin
            .from('company_subscriptions')
            .update({
                plan_id: planId,
                end_date: finalEndDate,
                billing_cycle_start: format(baseDate, 'yyyy-MM-dd'),
                billing_cycle_end: finalEndDate,
                status: 'active',
            })
            .eq('id', subscriptionId);

        if (updatePendingError) throw updatePendingError;
        console.log(`Pending subscription ${subscriptionId} activated successfully, ending on ${finalEndDate}.`);
        
        // Sincronizar flags da empresa baseado nas funcionalidades do plano
        try {
            const { error: syncError } = await supabaseAdmin.rpc('sync_company_flags_from_plan', {
                p_company_id: companyId,
                p_plan_id: planId
            });
            if (syncError) {
                console.error(`Erro ao sincronizar flags (não crítico):`, syncError);
            } else {
                console.log(`Flags sincronizados para empresa ${companyId} com plano ${planId}`);
            }
        } catch (syncErr: any) {
            console.error(`Erro ao sincronizar flags (não crítico):`, syncErr);
        }
        
        // Verificar se plano tem WhatsApp e enviar email de notificação
        await checkAndNotifyWhatsAppPlan(supabaseAdmin, companyId, planId);
    } else {
        // Cenário de retrocompatibilidade: não existe pendente, mantém lógica antiga
        let baseDate = today;

        if (existingActive?.end_date) {
            const currentEndDate = startOfDay(parseISO(existingActive.end_date || startDate));
            baseDate = isPast(currentEndDate) ? today : currentEndDate;
        }

        const newEndDate = addMonths(baseDate, finalDurationMonths);
        finalEndDate = format(newEndDate, 'yyyy-MM-dd');

        if (existingActive) {
            subscriptionId = existingActive.id;

            const { error: updateActiveError } = await supabaseAdmin
                .from('company_subscriptions')
                .update({
                    plan_id: planId,
                    end_date: finalEndDate,
                    billing_cycle_start: format(baseDate, 'yyyy-MM-dd'),
                    billing_cycle_end: finalEndDate,
                    status: 'active',
                })
                .eq('id', subscriptionId);

            if (updateActiveError) throw updateActiveError;
            console.log(`Active subscription ${subscriptionId} extended successfully to ${finalEndDate}.`);
            
            // Sincronizar flags da empresa baseado nas funcionalidades do plano
            try {
                const { error: syncError } = await supabaseAdmin.rpc('sync_company_flags_from_plan', {
                    p_company_id: companyId,
                    p_plan_id: planId
                });
                if (syncError) {
                    console.error(`Erro ao sincronizar flags (não crítico):`, syncError);
                } else {
                    console.log(`Flags sincronizados para empresa ${companyId} com plano ${planId}`);
                }
            } catch (syncErr: any) {
                console.error(`Erro ao sincronizar flags (não crítico):`, syncErr);
            }
            
            // Verificar se plano tem WhatsApp e enviar email de notificação
            await checkAndNotifyWhatsAppPlan(supabaseAdmin, companyId, planId);
        } else {
            // Nenhuma assinatura ativa: criar nova como ativa
            const { data: newSub, error: insertError } = await supabaseAdmin
                .from('company_subscriptions')
                .insert({
                    company_id: companyId,
                    plan_id: planId,
                    start_date: startDate,
                    end_date: finalEndDate,
                    billing_cycle_start: startDate,
                    billing_cycle_end: finalEndDate,
                    status: 'active',
                })
                .select('id')
                .single();

            if (insertError) throw insertError;
            subscriptionId = newSub.id;
            console.log(`New active subscription ${subscriptionId} created successfully, ending on ${finalEndDate}.`);
            
            // Sincronizar flags da empresa baseado nas funcionalidades do plano
            try {
                const { error: syncError } = await supabaseAdmin.rpc('sync_company_flags_from_plan', {
                    p_company_id: companyId,
                    p_plan_id: planId
                });
                if (syncError) {
                    console.error(`Erro ao sincronizar flags (não crítico):`, syncError);
                } else {
                    console.log(`Flags sincronizados para empresa ${companyId} com plano ${planId}`);
                }
            } catch (syncErr: any) {
                console.error(`Erro ao sincronizar flags (não crítico):`, syncErr);
            }
            
            // Verificar se plano tem WhatsApp e enviar email de notificação
            await checkAndNotifyWhatsAppPlan(supabaseAdmin, companyId, planId);
        }
    }

    const subBaseAmount = getMercadoPagoTransactionAmount(payment);
    await recordExternalSalesAccrual(supabaseAdmin, {
      companyId,
      mpPaymentId: String(paymentId),
      baseAmount: subBaseAmount,
      sourceKind: "subscription_payment",
      paymentAttemptId,
      subscriptionChangeRequestId: null,
      observations: "Mensalidade / assinatura PlanoAgenda.",
    });
    
    // 4. Register Coupon Usage (if applicable)
    if (hasCoupon) {
        const { error: usageInsertError } = await supabaseAdmin
            .from('coupon_usages')
            .insert({ company_id: companyId, admin_coupon_id: couponId });
        
        if (usageInsertError) {
            console.error('Failed to register coupon usage:', usageInsertError);
            // Log the error but continue, as the subscription is the priority
        } else {
            console.log(`Coupon ${couponId} usage registered successfully.`);
            
            // 5. Increment coupon usage count (using RPC for security/simplicity)
            await supabaseAdmin.rpc('increment_coupon_usage', { coupon_id: couponId });
        }
    }

    // 6. Acknowledge success to Mercado Pago
    return jsonResponse({ success: true, subscriptionId, status: payment.status }, 200);

  } catch (error: unknown) {
    console.error('Edge Function Error (mercadopago-webhook):', error);
    // --- NEW: If an error occurs after paymentAttemptId is known, mark it as failed ---
    if (paymentAttemptId) {
        await supabaseAdmin.from('payment_attempts').update({ status: 'failed' }).eq('id', paymentAttemptId);
    }
    return jsonResponse({ error: 'Erro interno ao processar webhook de pagamento.' }, 500);
  }
});