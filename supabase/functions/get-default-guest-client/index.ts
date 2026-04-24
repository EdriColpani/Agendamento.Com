import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

function jsonResponse(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders,
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders, status: 200 });
  }

  try {
    const { name } = await req.json(); // Apenas o nome do convidado é necessário agora

    if (!name) {
      return jsonResponse({ error: 'Parâmetro obrigatório ausente: name' }, 400);
    }

    const CLIENT_ID_PADRAO = '229a877f-238d-4dee-8eca-f0efe4a24e59'; // ID do cliente padrão fornecido pelo usuário

    return jsonResponse({ clientId: CLIENT_ID_PADRAO, clientNickname: name }, 200);

  } catch (error: unknown) {
    console.error('Edge Function Error (find-or-create-client-for-guest): Uncaught exception -', error);
    return jsonResponse({ error: 'Erro interno ao resolver cliente convidado.' }, 500);
  }
});

