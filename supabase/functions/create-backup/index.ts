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

    // Verificar autenticação do usuário
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Não autorizado.' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      return jsonResponse({ error: 'Não autorizado.' }, 401);
    }

    // Verificar se o usuário é GLOBAL_ADMIN
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: { persistSession: false },
      }
    );

    const { data: typeUser, error: typeUserError } = await supabaseAdmin
      .from('type_user')
      .select('cod')
      .eq('user_id', user.id)
      .single();

    if (typeUserError || typeUser?.cod !== 'GLOBAL_ADMIN') {
      return jsonResponse({ error: 'Acesso negado. Apenas administrador global pode criar backups.' }, 403);
    }

    // Gerar nome do arquivo com timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const fileName = `backup-completo-tipoagenda-${timestamp}.sql`;

    try {
      const backupQueries: string[] = [];
      
      // Cabeçalho do backup
      backupQueries.push(`-- ============================================\n`);
      backupQueries.push(`-- BACKUP COMPLETO DO TIPOAGENDA\n`);
      backupQueries.push(`-- Gerado em: ${new Date().toISOString()}\n`);
      backupQueries.push(`-- ============================================\n\n`);
      backupQueries.push(`SET statement_timeout = 0;\n`);
      backupQueries.push(`SET lock_timeout = 0;\n`);
      backupQueries.push(`SET client_encoding = 'UTF8';\n\n`);

      // ============================================
      // 1. EXPORTAR POLÍTICAS RLS
      // ============================================
      backupQueries.push(`-- ============================================\n`);
      backupQueries.push(`-- SEÇÃO 1: POLÍTICAS RLS (ROW LEVEL SECURITY)\n`);
      backupQueries.push(`-- ============================================\n\n`);

      // Tentar usar a função auxiliar se existir
      try {
        const { data: rlsData, error: rlsError } = await supabaseAdmin
          .rpc('export_rls_policies');

        if (!rlsError && rlsData && rlsData.length > 0) {
          for (const row of rlsData) {
            backupQueries.push(row.export_sql);
            backupQueries.push(`\n`);
          }
        } else {
          backupQueries.push(`-- Função export_rls_policies não disponível. Execute manualmente:\n`);
          backupQueries.push(`-- SELECT * FROM pg_policies WHERE schemaname = 'public';\n\n`);
        }
      } catch (err) {
        backupQueries.push(`-- Erro ao exportar políticas RLS: ${err}\n`);
        backupQueries.push(`-- Execute manualmente: SELECT * FROM pg_policies WHERE schemaname = 'public';\n\n`);
      }

      // ============================================
      // 2. EXPORTAR VIEWS
      // ============================================
      backupQueries.push(`-- ============================================\n`);
      backupQueries.push(`-- SEÇÃO 2: VIEWS\n`);
      backupQueries.push(`-- ============================================\n\n`);

      // Tentar usar a função auxiliar se existir
      try {
        const { data: viewsData, error: viewsError } = await supabaseAdmin
          .rpc('export_views');

        if (!viewsError && viewsData && viewsData.length > 0) {
          for (const row of viewsData) {
            backupQueries.push(row.export_sql);
            backupQueries.push(`\n`);
          }
        } else {
          // Fallback: exportar view auth_users conhecida
          backupQueries.push(`-- View: auth_users\n`);
          backupQueries.push(`DROP VIEW IF EXISTS public.auth_users CASCADE;\n`);
          backupQueries.push(`CREATE OR REPLACE VIEW public.auth_users AS\n`);
          backupQueries.push(`SELECT\n`);
          backupQueries.push(`  u.id,\n`);
          backupQueries.push(`  u.email,\n`);
          backupQueries.push(`  u.raw_user_meta_data,\n`);
          backupQueries.push(`  u.created_at\n`);
          backupQueries.push(`FROM auth.users u;\n\n`);
          backupQueries.push(`ALTER VIEW public.auth_users SET (security_invoker = true);\n`);
          backupQueries.push(`GRANT SELECT ON public.auth_users TO anon, authenticated;\n\n`);
        }
      } catch (err) {
        // Fallback: exportar view auth_users conhecida
        backupQueries.push(`-- View: auth_users\n`);
        backupQueries.push(`DROP VIEW IF EXISTS public.auth_users CASCADE;\n`);
        backupQueries.push(`CREATE OR REPLACE VIEW public.auth_users AS\n`);
        backupQueries.push(`SELECT\n`);
        backupQueries.push(`  u.id,\n`);
        backupQueries.push(`  u.email,\n`);
        backupQueries.push(`  u.raw_user_meta_data,\n`);
        backupQueries.push(`  u.created_at\n`);
        backupQueries.push(`FROM auth.users u;\n\n`);
        backupQueries.push(`ALTER VIEW public.auth_users SET (security_invoker = true);\n`);
        backupQueries.push(`GRANT SELECT ON public.auth_users TO anon, authenticated;\n\n`);
      }

      // ============================================
      // 3. EXPORTAR FUNCTIONS/PROCEDURES
      // ============================================
      backupQueries.push(`-- ============================================\n`);
      backupQueries.push(`-- SEÇÃO 3: FUNCTIONS E PROCEDURES\n`);
      backupQueries.push(`-- ============================================\n\n`);

      // Tentar usar a função auxiliar se existir
      try {
        const { data: funcsData, error: funcsError } = await supabaseAdmin
          .rpc('export_functions');

        if (!funcsError && funcsData && funcsData.length > 0) {
          for (const row of funcsData) {
            backupQueries.push(row.export_sql);
            backupQueries.push(`\n`);
          }
        } else {
          backupQueries.push(`-- Função export_functions não disponível.\n`);
          backupQueries.push(`-- Functions conhecidas: get_user_context, assign_user_to_company\n\n`);
        }
      } catch (err) {
        backupQueries.push(`-- Erro ao exportar functions: ${err}\n`);
        backupQueries.push(`-- Functions conhecidas: get_user_context, assign_user_to_company\n\n`);
      }

      // ============================================
      // 4. EXPORTAR TRIGGERS
      // ============================================
      backupQueries.push(`-- ============================================\n`);
      backupQueries.push(`-- SEÇÃO 4: TRIGGERS\n`);
      backupQueries.push(`-- ============================================\n\n`);

      // Tentar usar a função auxiliar se existir
      try {
        const { data: triggersData, error: triggersError } = await supabaseAdmin
          .rpc('export_triggers');

        if (!triggersError && triggersData && triggersData.length > 0) {
          for (const row of triggersData) {
            backupQueries.push(row.export_sql);
            backupQueries.push(`\n`);
          }
        } else {
          backupQueries.push(`-- Função export_triggers não disponível.\n`);
          backupQueries.push(`-- Execute manualmente: SELECT * FROM information_schema.triggers WHERE trigger_schema = 'public';\n\n`);
        }
      } catch (err) {
        backupQueries.push(`-- Erro ao exportar triggers: ${err}\n`);
        backupQueries.push(`-- Execute manualmente: SELECT * FROM information_schema.triggers WHERE trigger_schema = 'public';\n\n`);
      }

      // ============================================
      // 5. EXPORTAR SCHEMA DAS TABELAS (CREATE TABLE)
      // ============================================
      backupQueries.push(`-- ============================================\n`);
      backupQueries.push(`-- SEÇÃO 5: SCHEMA DAS TABELAS (CREATE TABLE)\n`);
      backupQueries.push(`-- ============================================\n\n`);

      // Tentar usar a função auxiliar se existir
      try {
        const { data: schemasData, error: schemasError } = await supabaseAdmin
          .rpc('export_table_schemas');

        if (!schemasError && schemasData && schemasData.length > 0) {
          for (const row of schemasData) {
            // Processar o SQL retornado, garantindo que quebras de linha sejam corretas
            let sqlText = row.export_sql || '';
            // Se o texto vier com escapes literais, converter para quebras de linha reais
            if (typeof sqlText === 'string') {
              sqlText = sqlText.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
            }
            backupQueries.push(sqlText);
          }
        } else {
          backupQueries.push(`-- Função export_table_schemas não disponível.\n`);
          backupQueries.push(`-- Execute a migration 20260209_create_backup_helper_function.sql para habilitar exportação de schemas.\n\n`);
        }
      } catch (err) {
        backupQueries.push(`-- Erro ao exportar schemas das tabelas: ${err}\n`);
        backupQueries.push(`-- Execute a migration 20260209_create_backup_helper_function.sql para habilitar exportação de schemas.\n\n`);
      }

      // ============================================
      // 6. EXPORTAR DADOS DAS TABELAS
      // ============================================
      backupQueries.push(`-- ============================================\n`);
      backupQueries.push(`-- SEÇÃO 6: DADOS DAS TABELAS\n`);
      backupQueries.push(`-- ============================================\n\n`);

      const tablesToBackup = [
        'companies', 'users', 'collaborators', 'clients', 'appointments', 'services',
        'cash_movements', 'subscription_plans', 'company_subscriptions', 'role_types',
        'user_companies', 'type_user', 'profiles', 'working_schedules', 'schedule_exceptions',
        'products', 'transaction_products', 'appointment_services', 'collaborator_services',
        'menus', 'menu_permissions', 'contracts', 'segments', 'areas_de_atuacao',
        'admin_coupons', 'coupon_usage', 'payment_attempts', 'global_banners',
        'messaging_providers', 'message_kinds', 'company_message_templates',
        'company_message_schedules', 'message_send_log', 'contact_requests'
      ];

      for (const table of tablesToBackup) {
        try {
          // Verificar se a tabela existe
          const { data: tableExists, error: checkError } = await supabaseAdmin
            .from(table)
            .select('*')
            .limit(0);

          if (checkError && checkError.code === '42P01') {
            continue; // Tabela não existe
          }

          backupQueries.push(`-- ============================================\n`);
          backupQueries.push(`-- Tabela: ${table}\n`);
          backupQueries.push(`-- ============================================\n\n`);

          // Exportar dados
          const { data, error } = await supabaseAdmin
            .from(table)
            .select('*')
            .limit(10000);

          if (error) {
            backupQueries.push(`-- ERRO ao exportar dados de ${table}: ${error.message}\n\n`);
            continue;
          }

          if (data && data.length > 0) {
            backupQueries.push(`-- Total de registros: ${data.length}\n\n`);

            const columns = Object.keys(data[0]);
            
            for (const row of data) {
              const values = columns.map(col => {
                const value = row[col];
                if (value === null || value === undefined) {
                  return 'NULL';
                } else if (typeof value === 'string') {
                  return `'${value.replace(/'/g, "''").replace(/\\/g, '\\\\')}'`;
                } else if (typeof value === 'boolean') {
                  return value ? 'TRUE' : 'FALSE';
                } else if (typeof value === 'object') {
                  return `'${JSON.stringify(value).replace(/'/g, "''").replace(/\\/g, '\\\\')}'::jsonb`;
                } else {
                  return String(value);
                }
              });

              backupQueries.push(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')});\n`);
            }
            backupQueries.push(`\n`);
          } else {
            backupQueries.push(`-- Tabela ${table} está vazia\n\n`);
          }
        } catch (err) {
          console.error(`Erro ao processar tabela ${table}:`, err);
          backupQueries.push(`-- ERRO ao processar ${table}: ${err}\n\n`);
        }
      }

      // ============================================
      // 7. INFORMAÇÕES SOBRE EDGE FUNCTIONS
      // ============================================
      backupQueries.push(`-- ============================================\n`);
      backupQueries.push(`-- SEÇÃO 7: EDGE FUNCTIONS\n`);
      backupQueries.push(`-- ============================================\n\n`);
      backupQueries.push(`-- NOTA: Edge Functions são arquivos TypeScript/JavaScript\n`);
      backupQueries.push(`-- e devem ser exportadas manualmente do diretório supabase/functions/\n\n`);
      backupQueries.push(`-- Lista de Edge Functions do projeto:\n`);
      const edgeFunctions = [
        'invite-client', 'invite-collaborator', 'signup-client',
        'send-contact-request-email', 'get-user-auth-data', 'create-backup',
        'whatsapp-message-scheduler', 'send-collaborator-welcome-email',
        'resend-client-invite', 'resend-email-confirmation',
        'book-appointment', 'finalize-appointment-by-collaborator',
        'get-default-guest-client', 'get-scheduling-data',
        'register-company-and-user', 'apply-coupon-and-subscribe',
        'mercadopago-webhook'
      ];
      for (const func of edgeFunctions) {
        backupQueries.push(`--   - ${func}\n`);
      }
      backupQueries.push(`\n`);

      // ============================================
      // 8. NOTA SOBRE EDGE FUNCTIONS
      // ============================================
      backupQueries.push(`-- ============================================\n`);
      backupQueries.push(`-- NOTA IMPORTANTE SOBRE EDGE FUNCTIONS\n`);
      backupQueries.push(`-- ============================================\n\n`);
      backupQueries.push(`-- Edge Functions são arquivos TypeScript/JavaScript e não podem ser\n`);
      backupQueries.push(`-- exportadas via SQL. Para backup completo, copie manualmente a pasta:\n`);
      backupQueries.push(`-- supabase/functions/ do projeto.\n\n`);

      // ============================================
      // FINALIZAÇÃO
      // ============================================
      backupQueries.push(`-- ============================================\n`);
      backupQueries.push(`-- FIM DO BACKUP\n`);
      backupQueries.push(`-- ============================================\n`);

      const backupContent = backupQueries.join('');

      // Retornar o backup como arquivo para download
      return new Response(backupContent, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/sql',
          'Content-Disposition': `attachment; filename="${fileName}"`,
        },
      });

    } catch (backupError: unknown) {
      console.error('Erro ao criar backup:', backupError);
      return jsonResponse({ error: 'Erro interno ao gerar backup.' }, 500);
    }

  } catch (error: unknown) {
    console.error('Edge Function Error (create-backup):', error);
    return jsonResponse({ error: 'Erro interno ao processar backup.' }, 500);
  }
});
