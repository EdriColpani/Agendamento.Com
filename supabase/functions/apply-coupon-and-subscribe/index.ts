import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.0';
import { format, addMonths, parseISO, isPast, startOfDay } from 'https://esm.sh/date-fns@3.6.0';

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

// Helper function to handle subscription creation/extension para fluxos sem pagamento (preço final <= 0)
// Este helper mantém o comportamento de ativar diretamente a assinatura.
async function handleSubscription(
    supabaseAdmin: any,
    companyId: string,
    planId: string,
    durationMonths: number,
    price: number,
    isFreeTrial: boolean = false
) {
    const today = new Date();
    const startDate = format(today, 'yyyy-MM-dd');
    
    // 1. Check for existing active subscription for this company
    const { data: existingSub, error: checkSubError } = await supabaseAdmin
        .from('company_subscriptions')
        .select('id, end_date')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .order('end_date', { ascending: false })
        .limit(1)
        .single();

    if (checkSubError && checkSubError.code !== 'PGRST116') throw checkSubError;

    let finalEndDate: string;
    let subscriptionId: string;

    if (existingSub) {
        // Extend the end date from the current end date
        const currentEndDate = startOfDay(parseISO(existingSub.end_date || startDate));
        const baseDate = isPast(currentEndDate) ? today : currentEndDate;
        const newEndDate = addMonths(baseDate, durationMonths);
        finalEndDate = format(newEndDate, 'yyyy-MM-dd');
        subscriptionId = existingSub.id;

        const { error: updateError } = await supabaseAdmin
            .from('company_subscriptions')
            .update({ 
                plan_id: planId,
                end_date: finalEndDate,
                billing_cycle_start: format(baseDate, 'yyyy-MM-dd'),
                billing_cycle_end: finalEndDate,
                next_plan_id: null,
                pending_change_type: null,
                status: 'active',
            })
            .eq('id', subscriptionId);

        if (updateError) throw updateError;
        console.log(`Subscription ${subscriptionId} extended successfully to ${finalEndDate}.`);

    } else {
        // No active subscription, create a new one
        const calculatedEndDate = addMonths(today, durationMonths);
        finalEndDate = format(calculatedEndDate, 'yyyy-MM-dd');

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
        console.log(`New subscription ${subscriptionId} created successfully, ending on ${finalEndDate}.`);
    }
    
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
        // Não lança erro para não quebrar o fluxo de assinatura
    }
    
    // Verificar se plano tem WhatsApp e enviar email de notificação
    await checkAndNotifyWhatsAppPlan(supabaseAdmin, companyId, planId);
    
    return { subscriptionId, finalEndDate };
}


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const MERCADOPAGO_ACCESS_TOKEN = Deno.env.get('PAYMENT_API_KEY_SECRET');
  const SITE_URL = Deno.env.get('SITE_URL') ?? BRAND_SITE_URL;

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    const supabaseClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', { auth: { persistSession: false } });
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized: No Authorization header' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !user) {
      console.error('Edge Function - Authentication error:', userError);
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token or user not found' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let requestData;
    try {
      requestData = await req.json();
      console.log('Edge Function - Received request data:', JSON.stringify(requestData, null, 2));
    } catch (jsonError: any) {
      console.error('Edge Function - JSON parse error:', jsonError);
      return new Response(JSON.stringify({ error: 'Invalid JSON in request body: ' + (jsonError?.message || 'Unknown error') }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const { planId, companyId, planName, planPrice, durationMonths, coupon } = requestData;

    console.log('Edge Function - Extracted fields:', { 
      planId: planId ? `${planId.substring(0, 8)}...` : 'null/undefined',
      companyId: companyId ? `${companyId.substring(0, 8)}...` : 'null/undefined',
      planName,
      planPrice,
      durationMonths,
      hasCoupon: !!coupon
    });

    // Validate required fields (check for null, undefined, empty string, or empty object)
    if (!planId || typeof planId !== 'string' || planId.trim() === '') {
      console.error('Edge Function - Invalid planId:', planId);
      return new Response(JSON.stringify({ error: 'Missing or invalid planId' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!companyId || typeof companyId !== 'string' || companyId.trim() === '') {
      console.error('Edge Function - Invalid companyId:', companyId);
      return new Response(JSON.stringify({ error: 'Missing or invalid companyId' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!planName || typeof planName !== 'string' || planName.trim() === '') {
      console.error('Edge Function - Invalid planName:', planName);
      return new Response(JSON.stringify({ error: 'Missing or invalid planName' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (planPrice === undefined || planPrice === null) {
      console.error('Edge Function - Missing planPrice');
      return new Response(JSON.stringify({ error: 'Missing planPrice' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (durationMonths === undefined || durationMonths === null) {
      console.error('Edge Function - Missing durationMonths');
      return new Response(JSON.stringify({ error: 'Missing durationMonths' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Ensure planPrice and durationMonths are numbers
    const numericPlanPrice = Number(planPrice);
    const numericDurationMonths = Number(durationMonths);
    
    if (isNaN(numericPlanPrice) || isNaN(numericDurationMonths) || numericPlanPrice < 0 || numericDurationMonths <= 0) {
      console.error('Edge Function - Invalid plan price or duration:', { numericPlanPrice, numericDurationMonths });
      return new Response(JSON.stringify({ error: 'Invalid plan price or duration' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let finalPrice = numericPlanPrice;
    let finalDurationMonths = numericDurationMonths;
    let couponId = null;

    // --- 1. Apply Coupon Logic (if provided) ---
    if (coupon && coupon !== null && typeof coupon === 'object') {
        // Validate coupon structure
        if (!coupon.id || !coupon.discount_type || coupon.discount_value === undefined || coupon.discount_value === null) {
            console.error('Edge Function - Invalid coupon structure:', coupon);
            return new Response(JSON.stringify({ error: 'Invalid coupon structure. Missing required fields: id, discount_type, or discount_value' }), { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
        }

        couponId = coupon.id;
        console.log(`Edge Function - Applying coupon: ${couponId}, type: ${coupon.discount_type}, value: ${coupon.discount_value}`);
        
        // VALIDAÇÃO: Verificar se o cupom é válido para o plano selecionado
        const { data: couponDetails, error: couponDetailsError } = await supabaseAdmin
            .from('admin_coupons')
            .select('plan_id, status, valid_until, max_uses, current_uses, billing_period')
            .eq('id', couponId)
            .single();

        if (couponDetailsError) {
            console.error('Edge Function - Error fetching coupon details:', couponDetailsError);
            return new Response(JSON.stringify({ error: 'Erro ao validar cupom' }), { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
        }

        // Verificar se o cupom está ativo
        if (couponDetails.status !== 'active') {
            return new Response(JSON.stringify({ error: 'Cupom inativo' }), { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
        }

        // Verificar se o cupom é válido para o plano selecionado
        if (couponDetails.plan_id && couponDetails.plan_id !== planId) {
            console.error(`Edge Function - Coupon ${couponId} is valid only for plan ${couponDetails.plan_id}, but plan ${planId} was selected`);
            return new Response(JSON.stringify({ error: 'Este cupom é válido apenas para um plano específico. Por favor, selecione o plano correto.' }), { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
        }

        // Verificar se o cupom é válido para o período de cobrança (mensal/anual)
        if (couponDetails.billing_period && couponDetails.billing_period !== 'any') {
            const isYearly = numericDurationMonths >= 12;
            const isMonthly = numericDurationMonths === 1;

            if (couponDetails.billing_period === 'yearly' && !isYearly) {
                return new Response(JSON.stringify({ error: 'Este cupom é válido apenas para planos anuais.' }), { 
                    status: 400, 
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
                });
            }

            if (couponDetails.billing_period === 'monthly' && !isMonthly) {
                return new Response(JSON.stringify({ error: 'Este cupom é válido apenas para planos mensais.' }), { 
                    status: 400, 
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
                });
            }
        }
        
        // Re-validate coupon usage (security check against race conditions)
        const { data: usageData, error: usageError } = await supabaseAdmin
            .from('coupon_usages')
            .select('id')
            .eq('company_id', companyId)
            .eq('admin_coupon_id', couponId)
            .limit(1);

        if (usageError) {
            console.error('Edge Function - Error checking coupon usage:', usageError);
            throw usageError;
        }
        if (usageData && usageData.length > 0) {
            throw new Error('Coupon already used by this company.');
        }

        // Validate discount_value is a number
        const discountValue = Number(coupon.discount_value);
        if (isNaN(discountValue) || discountValue < 0) {
            console.error('Edge Function - Invalid discount value:', coupon.discount_value);
            return new Response(JSON.stringify({ error: 'Invalid coupon discount value' }), { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
        }

        // Apply financial discount
        if (coupon.discount_type === 'percentual') {
            if (discountValue > 100) {
                return new Response(JSON.stringify({ error: 'Invalid percentage discount: cannot exceed 100%' }), { 
                    status: 400, 
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
                });
            }
            finalPrice = numericPlanPrice * (1 - discountValue / 100);
        } else if (coupon.discount_type === 'fixed') {
            finalPrice = Math.max(0, numericPlanPrice - discountValue);
        } else {
            return new Response(JSON.stringify({ error: 'Invalid discount type. Must be "percentual" or "fixed"' }), { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
        }
        
        // Apply time discount (30 days / 1 month free trial)
        finalDurationMonths += 1; // Add 1 month free trial

        console.log(`Edge Function - Coupon applied. Original Price: ${numericPlanPrice}, Final Price: ${finalPrice}, Final Duration: ${finalDurationMonths} months.`);
    } else if (coupon !== null && coupon !== undefined) {
        // Coupon was provided but is not a valid object
        console.error('Edge Function - Invalid coupon format (not null and not object):', coupon);
        return new Response(JSON.stringify({ error: 'Invalid coupon format' }), { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
    }

    // --- 2. Handle Subscription Activation ---
    
    if (finalPrice <= 0) {
        // Caso 100% desconto ou plano grátis: ativa diretamente a assinatura (sem pagamento)
        const { subscriptionId } = await handleSubscription(
            supabaseAdmin,
            companyId,
            planId,
            finalDurationMonths,
            finalPrice,
            true
        );
        
        // Registrar uso do cupom (se houver)
        if (couponId) {
            const { error: usageInsertError } = await supabaseAdmin
                .from('coupon_usages')
                .insert({ 
                    company_id: companyId, 
                    admin_coupon_id: couponId,
                    used_at: new Date().toISOString(),
                });
            if (usageInsertError) {
                console.error('Failed to register coupon usage:', usageInsertError);
                throw usageInsertError;
            }
            
            await supabaseAdmin.rpc('increment_coupon_usage', { coupon_id: couponId });
        }

        // Verificar se plano tem WhatsApp e enviar email de notificação (já foi chamado em handleSubscription, mas garantindo aqui também)
        await checkAndNotifyWhatsAppPlan(supabaseAdmin, companyId, planId);

        return new Response(
            JSON.stringify({ message: 'Subscription activated immediately (Free Trial/Discount)', subscriptionId }),
            {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );
    } else {
        // Caso com pagamento: registrar assinatura PENDENTE antes de chamar o gateway
        if (!MERCADOPAGO_ACCESS_TOKEN) {
            console.error('MERCADOPAGO_ACCESS_TOKEN not set.');
            return new Response(JSON.stringify({ error: 'Payment service not configured.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // --- 2. Garantir que exista uma assinatura pendente para esta empresa + plano ---
        let pendingSubscriptionId: string | null = null;
        const { data: existingPending, error: pendingError } = await supabaseAdmin
            .from('company_subscriptions')
            .select('id')
            .eq('company_id', companyId)
            .eq('plan_id', planId)
            .eq('status', 'pending')
            .order('start_date', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (pendingError) {
            console.error('Error checking pending subscription:', pendingError);
            throw pendingError;
        }

        if (existingPending) {
            pendingSubscriptionId = existingPending.id;
            console.log(`Found existing pending subscription ${pendingSubscriptionId} for company ${companyId}.`);
        } else {
            const today = new Date();
            const startDate = format(today, 'yyyy-MM-dd');

            const { data: newPending, error: insertPendingError } = await supabaseAdmin
                .from('company_subscriptions')
                .insert({
                    company_id: companyId,
                    plan_id: planId,
                    start_date: startDate,
                    end_date: null,
                    billing_cycle_start: startDate,
                    billing_cycle_end: null,
                    status: 'pending',
                })
                .select('id')
                .single();

            if (insertPendingError) {
                console.error('Error creating pending subscription:', insertPendingError);
                throw insertPendingError;
            }

            pendingSubscriptionId = newPending.id;
            console.log(`Created pending subscription ${pendingSubscriptionId} for company ${companyId}.`);
        }

        // --- 3. Registrar tentativa de pagamento como 'initiated' ---
        // Ensure amount is a valid number
        const paymentAmount = Number(finalPrice);
        if (isNaN(paymentAmount) || paymentAmount <= 0) {
            console.error('Edge Function - Invalid payment amount:', finalPrice);
            throw new Error('Invalid payment amount: ' + finalPrice);
        }

        console.log(`Edge Function - Creating payment attempt with amount: ${paymentAmount}`);

        const { data: paymentAttempt, error: paInsertError } = await supabaseAdmin
            .from('payment_attempts')
            .insert({
                company_id: companyId,
                plan_id: planId,
                user_id: user.id,
                status: 'initiated',
                amount: paymentAmount,
                currency: 'BRL',
            })
            .select('id')
            .single();

        if (paInsertError) {
            console.error('Error inserting payment attempt:', paInsertError);
            throw new Error('Failed to register payment attempt: ' + paInsertError.message);
        }
        const paymentAttemptId = paymentAttempt.id;
        console.log(`Payment attempt ${paymentAttemptId} initiated.`);

        // Ensure finalPrice is a valid number greater than 0
        const validFinalPrice = Number(finalPrice);
        if (isNaN(validFinalPrice) || validFinalPrice <= 0) {
            console.error('Edge Function - Invalid final price:', finalPrice, 'validFinalPrice:', validFinalPrice);
            throw new Error('Invalid final price for payment: ' + finalPrice);
        }

        // Mercado Pago minimum value is 0.50 BRL
        if (validFinalPrice < 0.50) {
            console.error('Edge Function - Price below Mercado Pago minimum:', validFinalPrice);
            return new Response(JSON.stringify({ error: 'O valor mínimo para pagamento é R$ 0,50. Seu plano tem desconto aplicado que resulta em valor abaixo do mínimo.' }), { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
        }

        // Round to 2 decimal places for Mercado Pago
        const roundedPrice = Math.round(validFinalPrice * 100) / 100;
        console.log(`Edge Function - Creating Mercado Pago preference with price: ${roundedPrice} (original: ${validFinalPrice})`);

        const preferenceBody = {
            items: [
                {
                    title: `Assinatura: ${planName} (${finalDurationMonths} meses)${coupon ? ' - Desconto Aplicado' : ''}`,
                    unit_price: roundedPrice,
                    quantity: 1,
                    currency_id: 'BRL',
                },
            ],
            // Pass coupon ID, final duration, AND payment_attempt_id in external reference for webhook processing
            external_reference: `${companyId}_${planId}_${finalDurationMonths}_${couponId || 'none'}_${paymentAttemptId}`,
            back_urls: {
                success: `${SITE_URL}/planos?status=success`,
                failure: `${SITE_URL}/planos?status=failure`,
                pending: `${SITE_URL}/planos?status=pending`,
            },
            auto_return: 'approved',
            notification_url: `${SUPABASE_URL}/functions/v1/mercadopago-webhook`,
        };

        const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
            },
            body: JSON.stringify(preferenceBody),
        });

        if (!mpResponse.ok) {
            let errorMessage = `Mercado Pago API error: ${mpResponse.status} ${mpResponse.statusText}`;
            try {
                const errorData = await mpResponse.json();
                console.error('Mercado Pago API Error:', mpResponse.status, errorData);
                if (errorData.message) {
                    errorMessage = `Mercado Pago API error: ${errorData.message}`;
                } else if (errorData.error) {
                    errorMessage = `Mercado Pago API error: ${errorData.error}`;
                } else if (Array.isArray(errorData.cause) && errorData.cause.length > 0) {
                    errorMessage = `Mercado Pago API error: ${errorData.cause[0].description || errorData.cause[0].message || errorMessage}`;
                }
            } catch (parseError) {
                console.error('Failed to parse Mercado Pago error response:', parseError);
            }
            // --- NEW: Update payment attempt status to 'failed' if Mercado Pago call fails ---
            await supabaseAdmin.from('payment_attempts').update({ status: 'failed' }).eq('id', paymentAttemptId);
            throw new Error(errorMessage);
        }

        const mpData = await mpResponse.json();
        
        // --- NEW: Update payment attempt with Mercado Pago preference ID ---
        await supabaseAdmin.from('payment_attempts').update({ payment_gateway_reference: mpData.id }).eq('id', paymentAttemptId);

        return new Response(JSON.stringify({ 
            preferenceId: mpData.id,
            initPoint: mpData.init_point,
            paymentAttemptId: paymentAttemptId, // Return payment attempt ID to frontend for potential tracking
        }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

  } catch (error: any) {
    console.error('Edge Function Error (apply-coupon-and-subscribe): Uncaught exception:', error);
    const errorMessage = error?.message || error?.toString() || 'Unknown error occurred';
    console.error('Edge Function Error - Full error details:', {
      message: errorMessage,
      stack: error?.stack,
      name: error?.name,
    });
    return new Response(JSON.stringify({ error: 'Failed to process subscription: ' + errorMessage }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});