import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.0';

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

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    const { user_ids } = await req.json();

    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      return jsonResponse({ error: 'Parâmetro user_ids é obrigatório.' }, 400);
    }

    // Buscar dados de auth.users usando service role (que tem acesso direto)
    const authData: any[] = [];
    
    for (const userId of user_ids) {
      try {
        const { data: user, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
        
        if (!userError && user?.user) {
          authData.push({
            id: user.user.id,
            email: user.user.email || null,
            created_at: user.user.created_at || null,
            raw_user_meta_data: user.user.user_metadata || null,
          });
        }
      } catch (err) {
        console.warn(`[get-user-auth-data] Erro ao buscar usuário ${userId}:`, err);
        // Continua para o próximo usuário
      }
    }

    return jsonResponse({ data: authData }, 200);

  } catch (error: unknown) {
    console.error('[get-user-auth-data] Erro:', error);
    return jsonResponse({ error: 'Erro interno ao buscar dados de autenticação.' }, 500);
  }
});

