/**
 * Hook para validação completa do vínculo do usuário com empresa
 * 
 * Este hook valida se o usuário possui vínculo válido em:
 * - user_companies (empresa vinculada)
 * - collaborators (se for colaborador)
 * - clients (se for cliente)
 * 
 * Retorna metadados essenciais:
 * - company_id: ID da empresa primária
 * - role_type_id: ID do tipo de role do usuário
 * - subscription_id: ID da assinatura ativa
 * - hasValidLink: Se possui vínculo válido
 */
import { useState, useEffect } from 'react';
import { useSession } from '@/components/SessionContextProvider';
import { supabase } from '@/integrations/supabase/client';

export interface UserValidationData {
  company_id: string | null;
  role_type_id: string | null;
  subscription_id: string | null;
  hasValidLink: boolean;
  isCollaborator: boolean;
  collaboratorCompanyId: string | null;
}

export function useUserValidation() {
  const { session, loading: sessionLoading } = useSession();
  const [validationData, setValidationData] = useState<UserValidationData>({
    company_id: null,
    role_type_id: null,
    subscription_id: null,
    hasValidLink: false,
    isCollaborator: false,
    collaboratorCompanyId: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const validateUserLink = async () => {
      if (sessionLoading) {
        return;
      }

      if (!session?.user) {
        setValidationData({
          company_id: null,
          role_type_id: null,
          subscription_id: null,
          hasValidLink: false,
          isCollaborator: false,
          collaboratorCompanyId: null,
        });
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const userId = session.user.id;
        console.log('[useUserValidation] Iniciando validação para user_id:', userId);

        let companyId: string | null = null;
        let roleTypeId: string | null = null;
        let isCollaborator = false;
        let collaboratorCompanyId: string | null = null;
        let collaboratorRoleTypeId: string | null = null;
        let isClient = false;
        let clientCompanyId: string | null = null;

        // PRIORIDADE 1: Verificar se é cliente (tabela clients)
        // Clientes podem não estar em user_companies, então verificamos primeiro
        const { data: clientData, error: clientError } = await supabase
          .from('clients')
          .select('company_id')
          .eq('client_auth_id', userId)
          .limit(1)
          .maybeSingle();

        if (clientError) {
          console.warn('[useUserValidation] Erro ao buscar client (não crítico):', clientError);
        }

        if (clientData) {
          isClient = true;
          clientCompanyId = clientData.company_id || null;
          
          console.log('[useUserValidation] ✅ Cliente encontrado:', {
            company_id: clientCompanyId,
            has_company_id: !!clientCompanyId
          });

          // Se encontrou cliente com company_id, usar esses dados
          if (clientCompanyId) {
            companyId = clientCompanyId;
            console.log('[useUserValidation] ✅ Usando dados do client como principal');
          } else {
            console.log('[useUserValidation] ✅ Cliente público encontrado (sem company_id fixo - pode agendar em qualquer empresa)');
          }
        } else {
          console.log('[useUserValidation] Nenhum registro encontrado na tabela clients');
        }

        // PRIORIDADE 2: Verificar se é colaborador (tabela collaborators)
        // Colaboradores podem não estar em user_companies, então verificamos depois de clientes
        const { data: collaboratorData, error: collaboratorError } = await supabase
          .from('collaborators')
          .select('company_id, role_type_id')
          .eq('user_id', userId)
          .eq('is_arena_system_placeholder', false)
          .limit(1)
          .maybeSingle();

        if (collaboratorError) {
          console.error('[useUserValidation] ERRO ao buscar collaborator:', {
            error: collaboratorError,
            code: collaboratorError.code,
            message: collaboratorError.message,
            details: collaboratorError.details,
            hint: collaboratorError.hint
          });
          // Não falhar completamente - continuar tentando user_companies
        }

        if (collaboratorData) {
          isCollaborator = true;
          collaboratorCompanyId = collaboratorData.company_id || null;
          collaboratorRoleTypeId = collaboratorData.role_type_id || null;
          
          console.log('[useUserValidation] ✅ Colaborador encontrado:', {
            company_id: collaboratorCompanyId,
            role_type_id: collaboratorRoleTypeId,
            has_company_id: !!collaboratorCompanyId
          });

          // Se encontrou colaborador com company_id e ainda não tem companyId, usar esses dados
          if (!companyId && collaboratorCompanyId) {
            companyId = collaboratorCompanyId;
            roleTypeId = collaboratorRoleTypeId;
            console.log('[useUserValidation] ✅ Usando dados do collaborator como principal');
          } else if (collaboratorCompanyId) {
            // Se já tem companyId de client, manter, mas logar que também é colaborador
            console.log('[useUserValidation] ✅ Usuário é tanto cliente quanto colaborador');
          } else {
            console.warn('[useUserValidation] ⚠️ Colaborador encontrado mas SEM company_id!');
          }
        } else {
          console.log('[useUserValidation] Nenhum registro encontrado na tabela collaborators');
        }

        // PRIORIDADE 3: Verificar vínculo em user_companies (se não encontrou em clients/collaborators ou para complementar)
        // Buscar empresa primária primeiro
        const { data: primaryCompanyData, error: primaryCompanyError } = await supabase
          .from('user_companies')
          .select('company_id, role_type, is_primary')
          .eq('user_id', userId)
          .eq('is_primary', true)
          .maybeSingle();

        if (primaryCompanyError) {
          console.warn('[useUserValidation] Erro ao buscar empresa primária (não crítico):', primaryCompanyError);
        }

        if (primaryCompanyData) {
          // Se já tem companyId do collaborator, manter, mas atualizar role_type se não tiver
          if (!companyId) {
            companyId = primaryCompanyData.company_id;
            console.log('[useUserValidation] Empresa primária encontrada (sem collaborator):', companyId);
          }
          if (!roleTypeId && primaryCompanyData.role_type) {
            roleTypeId = primaryCompanyData.role_type;
            console.log('[useUserValidation] Usando role_type da empresa primária:', roleTypeId);
          }
        } else {
          // Se não encontrou primária, buscar qualquer empresa
          const { data: anyCompanyData, error: anyCompanyError } = await supabase
            .from('user_companies')
            .select('company_id, role_type')
            .eq('user_id', userId)
            .limit(1)
            .maybeSingle();

          if (anyCompanyError) {
            console.warn('[useUserValidation] Erro ao buscar empresa (não crítico):', anyCompanyError);
          }

          if (anyCompanyData) {
            if (!companyId) {
              companyId = anyCompanyData.company_id;
              console.log('[useUserValidation] Empresa (não primária) encontrada:', companyId);
            }
            if (!roleTypeId && anyCompanyData.role_type) {
              roleTypeId = anyCompanyData.role_type;
              console.log('[useUserValidation] Usando role_type da empresa:', roleTypeId);
            }
          }
        }

        // 4. Verificar se possui vínculo válido
        // TEM vínculo válido se:
        // - Tem company_id (de qualquer fonte: clients, collaborators OU user_companies)
        // - OU é cliente (existe na tabela clients, mesmo sem company_id - clientes públicos podem agendar em qualquer empresa)
        // - OU é colaborador com company_id na tabela collaborators
        const hasValidLink = !!(
          companyId || 
          clientCompanyId ||
          collaboratorCompanyId ||
          isClient // Clientes públicos (signup) podem não ter company_id, mas ainda têm acesso válido
        );

        console.log('[useUserValidation] Resultado da validação:', {
          hasValidLink,
          companyId,
          isClient,
          isCollaborator,
          clientCompanyId,
          collaboratorCompanyId,
          collaboratorRoleTypeId,
          roleTypeId,
          fonte: companyId === clientCompanyId ? 'client' : companyId === collaboratorCompanyId ? 'collaborator' : companyId ? 'user_companies' : isClient ? 'client_publico' : 'nenhuma'
        });

        // 5. Buscar subscription_id se tiver company_id
        let subscriptionId: string | null = null;
        if (companyId) {
          const { data: subscriptionData, error: subscriptionError } = await supabase
            .from('company_subscriptions')
            .select('id')
            .eq('company_id', companyId)
            .eq('status', 'active')
            .order('start_date', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (subscriptionData) {
            subscriptionId = subscriptionData.id;
            console.log('[useUserValidation] Assinatura ativa encontrada:', subscriptionId);
          } else {
            console.log('[useUserValidation] Nenhuma assinatura ativa encontrada para a empresa');
          }
        }

        const finalData: UserValidationData = {
          company_id: companyId,
          role_type_id: roleTypeId,
          subscription_id: subscriptionId,
          hasValidLink,
          isCollaborator,
          collaboratorCompanyId,
        };

        console.log('[useUserValidation] Validação concluída:', finalData);
        setValidationData(finalData);

        if (!hasValidLink) {
          setError('Usuário não possui vínculo válido com nenhuma empresa');
        }

      } catch (err: any) {
        console.error('[useUserValidation] Erro na validação:', err);
        setError(err.message || 'Erro ao validar vínculo do usuário');
        setValidationData({
          company_id: null,
          role_type_id: null,
          subscription_id: null,
          hasValidLink: false,
          isCollaborator: false,
          collaboratorCompanyId: null,
        });
      } finally {
        setLoading(false);
      }
    };

    validateUserLink();
  }, [session, sessionLoading]);

  return { ...validationData, loading, error };
}

