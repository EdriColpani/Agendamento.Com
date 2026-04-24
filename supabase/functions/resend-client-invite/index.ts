import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.0'; // Updated to 2.46.0

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

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        auth: {
          persistSession: false,
        },
      }
    );

    // Verify the user's session (the one calling this function)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('Edge Function Error (resend-client-invite): Unauthorized - No Authorization header');
      return jsonResponse({ error: 'Não autorizado.' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      console.error('Edge Function Error (resend-client-invite): Auth error -', userError?.message || 'User not found');
      return jsonResponse({ error: 'Não autorizado.' }, 401);
    }

    const { clientEmail, companyId } = await req.json();

    console.log('Edge Function Debug (resend-client-invite): Received clientEmail:', clientEmail);
    console.log('Edge Function Debug (resend-client-invite): Received companyId:', companyId);
    console.log('Edge Function Debug (resend-client-invite): Authenticated user ID:', user.id);


    if (!clientEmail || !companyId) {
      console.error('Edge Function Error (resend-client-invite): Missing required data for resend');
      return jsonResponse({ error: 'clientEmail e companyId são obrigatórios.' }, 400);
    }

    // Create a Supabase client with the service role key for admin operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
        },
      }
    );

    console.log('Edge Function Debug (resend-client-invite): Checking admin client structure...');
    console.log('Edge Function Debug (resend-client-invite): typeof supabaseAdmin.auth:', typeof supabaseAdmin.auth);
    console.log('Edge Function Debug (resend-client-invite): supabaseAdmin.auth object:', JSON.stringify(supabaseAdmin.auth, null, 2));
    console.log('Edge Function Debug (resend-client-invite): typeof supabaseAdmin.auth.admin:', typeof supabaseAdmin.auth.admin);
    if (supabaseAdmin.auth.admin) {
      console.log('Edge Function Debug (resend-client-invite): supabaseAdmin.auth.admin object:', JSON.stringify(supabaseAdmin.auth.admin, null, 2));
      console.log('Edge Function Debug (resend-client-invite): Methods on supabaseAdmin.auth.admin:', Object.keys(supabaseAdmin.auth.admin));
    } else {
      console.log('Edge Function Debug (resend-client-invite): supabaseAdmin.auth.admin is undefined or null. Admin client might not be initialized correctly.');
    }

    // Check if the calling user (user.id) is an admin/proprietor of the companyId
    const { data: userCompanyRoles, error: roleError } = await supabaseAdmin
      .from('user_companies')
      .select('role_type')
      .eq('user_id', user.id)
      .eq('company_id', companyId)
      .single();

    if (roleError || !userCompanyRoles) {
      console.error('Edge Function Error (resend-client-invite): Role check error -', roleError?.message || 'User not authorized for this company');
      console.error('Edge Function Debug (resend-client-invite): User ID:', user.id, 'Company ID:', companyId);
      console.error('Edge Function Debug (resend-client-invite): Role fetch error:', roleError);
      return jsonResponse({ error: 'Acesso negado para esta empresa.' }, 403);
    }

    // Fetch role_type description to verify if it's 'Proprietário' or 'Admin'
    const { data: roleTypeData, error: roleTypeFetchError } = await supabaseAdmin
      .from('role_types')
      .select('description')
      .eq('id', userCompanyRoles.role_type)
      .single();

    console.log('Edge Function Debug (resend-client-invite): User role type ID:', userCompanyRoles.role_type);
    console.log('Edge Function Debug (resend-client-invite): User role type description:', roleTypeData?.description);


    if (roleTypeFetchError || !roleTypeData || !['Proprietário', 'Admin'].includes(roleTypeData.description)) {
      console.error('Edge Function Error (resend-client-invite): Role type description error -', roleTypeFetchError?.message || 'User does not have sufficient privileges');
      console.error('Edge Function Debug (resend-client-invite): Role type fetch error:', roleTypeFetchError);
      return jsonResponse({ error: 'Acesso negado para esta empresa.' }, 403);
    }

    let resendOperationError = null;
    let resendOperationMessage = '';

    // First, check if a user with this email already exists in auth.users
    let existingUser = null;
    if (supabaseAdmin.auth.admin && typeof supabaseAdmin.auth.admin.getUserByEmail === 'function') {
      console.log('Edge Function Debug (resend-client-invite): Using getUserByEmail.');
      const { data, error: fetchExistingUserError } = await supabaseAdmin.auth.admin.getUserByEmail(clientEmail);
      if (fetchExistingUserError && fetchExistingUserError.message !== 'User not found') {
        console.error('Edge Function Error (resend-client-invite): Error checking for existing user -', fetchExistingUserError.message);
        return new Response(JSON.stringify({ error: 'Error checking for existing user: ' + fetchExistingUserError.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      existingUser = data?.user;
    } else {
      console.warn('Edge Function Warning (resend-client-invite): getUserByEmail not found on supabaseAdmin.auth.admin. Falling back to listUsers.');
      // Fallback to listUsers if getUserByEmail is not available
      const { data, error: listUsersError } = await supabaseAdmin.auth.admin.listUsers({
        filter: clientEmail, // CORRECTED: Use 'filter' for email search
      });
      if (listUsersError) {
        console.error('Edge Function Error (resend-client-invite): Error listing users as fallback -', listUsersError.message);
        return new Response(JSON.stringify({ error: 'Error checking for existing user (fallback): ' + listUsersError.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      existingUser = data?.users?.[0];
    }

    if (existingUser) {
      // User already exists, send a magic link or password reset link
      console.log('Edge Function Debug (resend-client-invite): User already exists, sending magic link.');
      const { error: magicLinkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink', // Sends a link to sign in or set password
        email: clientEmail,
        options: {
          redirectTo: `${Deno.env.get('SITE_URL') || 'https://www.planoagenda.com.br'}/signup`, // Redirect to signup to set password
        },
      });

      if (magicLinkError) {
        resendOperationError = magicLinkError;
        resendOperationMessage = 'Erro ao enviar link mágico: ' + magicLinkError.message;
      } else {
        resendOperationMessage = 'Link de acesso enviado com sucesso para o e-mail do cliente existente.';
      }
    } else {
      // User does not exist, proceed with inviteUserByEmail
      console.log('Edge Function Debug (resend-client-invite): User does not exist, inviting new user.');
      const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(clientEmail, {
        redirectTo: `${Deno.env.get('SITE_URL') || 'https://www.planoagenda.com.br'}/signup`,
      });

      if (inviteError) {
        resendOperationError = inviteError;
        resendOperationMessage = 'Erro ao convidar novo usuário: ' + inviteError.message;
      } else {
        resendOperationMessage = 'Convite enviado com sucesso para o novo cliente.';
      }
    }

    if (resendOperationError) {
      console.error('Edge Function Error (resend-client-invite): Resend operation failed -', resendOperationError.message);
      return new Response(JSON.stringify({ error: resendOperationMessage }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Edge Function Debug (resend-client-invite): Resend operation completed successfully.');
    return jsonResponse({ message: resendOperationMessage }, 200);

  } catch (error: unknown) {
    console.error('Edge Function Error (resend-client-invite): Uncaught exception -', error);
    return jsonResponse({ error: 'Erro interno ao reenviar convite.' }, 500);
  }
});