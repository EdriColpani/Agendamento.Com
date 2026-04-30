import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0";

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Não autorizado." }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    const user = userData.user;
    if (userError || !user) {
      return jsonResponse({ error: "Não autorizado." }, 401);
    }

    const { appointmentId } = await req.json();
    if (!appointmentId) {
      return jsonResponse({ error: "appointmentId é obrigatório." }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const { data: appt, error: apptError } = await supabaseAdmin
      .from("appointments")
      .select("id, company_id, booking_kind, status, total_price, payment_method, appointment_date")
      .eq("id", appointmentId)
      .maybeSingle();

    if (apptError || !appt) {
      return jsonResponse({ error: "Reserva não encontrada." }, 404);
    }
    if (appt.booking_kind !== "court") {
      return jsonResponse({ error: "Apenas reservas de quadra podem ser finalizadas aqui." }, 400);
    }

    const { data: userCompany, error: userCompanyError } = await supabaseAdmin
      .from("user_companies")
      .select("id")
      .eq("company_id", appt.company_id)
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (userCompanyError || !userCompany) {
      return jsonResponse({ error: "Sem permissão para finalizar reserva desta empresa." }, 403);
    }

    if (appt.status !== "confirmado") {
      return jsonResponse({ error: "Só é possível finalizar reservas com status confirmado." }, 400);
    }

    const dateStr = String(appt.appointment_date);
    const { data: closure, error: closureError } = await supabaseAdmin
      .from("cash_register_closures")
      .select("id")
      .eq("company_id", appt.company_id)
      .lte("start_date", dateStr)
      .gte("end_date", dateStr)
      .limit(1)
      .maybeSingle();

    if (closureError && closureError.code !== "PGRST116") {
      return jsonResponse({ error: "Falha ao verificar fechamento de caixa." }, 500);
    }
    if (closure) {
      return jsonResponse({ error: "Não é possível finalizar reserva em período de caixa fechado." }, 400);
    }

    const { data: updatedRows, error: updateError } = await supabaseAdmin
      .from("appointments")
      .update({ status: "concluido" })
      .eq("id", appt.id)
      .eq("status", "confirmado")
      .select("id");

    if (updateError) {
      return jsonResponse({ error: "Erro ao atualizar status da reserva." }, 500);
    }
    if (!updatedRows || updatedRows.length === 0) {
      return jsonResponse({ error: "Reserva não está mais com status confirmado." }, 400);
    }

    const { data: existingReceipt, error: receiptCheckError } = await supabaseAdmin
      .from("cash_movements")
      .select("id")
      .eq("appointment_id", appt.id)
      .eq("transaction_type", "recebimento")
      .limit(1)
      .maybeSingle();

    if (receiptCheckError && receiptCheckError.code !== "PGRST116") {
      return jsonResponse({ error: "Erro ao validar recebimento existente." }, 500);
    }

    let receiptCreated = false;
    if (!existingReceipt) {
      const paymentMethod = String(appt.payment_method || "dinheiro");
      const { error: insertError } = await supabaseAdmin.from("cash_movements").insert({
        company_id: appt.company_id,
        appointment_id: appt.id,
        user_id: user.id,
        total_amount: appt.total_price ?? 0,
        payment_method: paymentMethod,
        transaction_type: "recebimento",
        transaction_date: new Date(String(appt.appointment_date)).toISOString(),
        observations: `Recebimento da reserva de quadra ${appt.id} finalizada no menu Reservas.`,
      });
      if (insertError) {
        return jsonResponse({ error: "Reserva concluída, mas houve erro ao gerar recebimento no caixa." }, 500);
      }
      receiptCreated = true;
    }

    return jsonResponse(
      {
        success: true,
        message: "Reserva finalizada com sucesso.",
        receiptCreated,
      },
      200,
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[finalize-court-reservation] error:", msg);
    return jsonResponse({ error: "Erro interno ao finalizar reserva." }, 500);
  }
});
