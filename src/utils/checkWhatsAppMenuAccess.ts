import { SupabaseClient } from '@supabase/supabase-js';
import { fetchEffectiveSubscription } from '@/utils/effectiveSubscription';

/**
 * Verifica se a empresa tem acesso ao menu WhatsApp através do plano ativo
 * @param supabase Cliente Supabase
 * @param companyId ID da empresa
 * @returns Promise<boolean> true se tem acesso, false caso contrário
 */
export async function checkWhatsAppMenuAccess(
  supabase: SupabaseClient,
  companyId: string
): Promise<boolean> {
  try {
    // 1. Buscar plano ativo da empresa
    const subscriptionData = await fetchEffectiveSubscription(supabase, companyId);

    if (!subscriptionData?.plan_id) {
      console.warn('[checkWhatsAppMenuAccess] Empresa sem plano ativo:', companyId);
      return false;
    }

    const planId = subscriptionData.plan_id;

    // 2. Buscar menu WhatsApp pelo menu_key
    const { data: whatsappMenu, error: menuError } = await supabase
      .from('menus')
      .select('id')
      .eq('menu_key', 'mensagens-whatsapp')
      .eq('is_active', true)
      .single();

    if (menuError || !whatsappMenu) {
      console.warn('[checkWhatsAppMenuAccess] Menu WhatsApp não encontrado ou inativo');
      return false;
    }

    // 3. Verificar se o menu está vinculado ao plano da empresa
    const { data: menuPlan, error: menuPlanError } = await supabase
      .from('menu_plans')
      .select('id')
      .eq('plan_id', planId)
      .eq('menu_id', whatsappMenu.id)
      .single();

    if (menuPlanError || !menuPlan) {
      console.warn('[checkWhatsAppMenuAccess] Menu WhatsApp não está vinculado ao plano:', {
        planId,
        menuId: whatsappMenu.id,
        error: menuPlanError?.message,
      });
      return false;
    }

    console.log('[checkWhatsAppMenuAccess] ✅ Empresa tem acesso ao menu WhatsApp:', companyId);
    return true;
  } catch (error: any) {
    console.error('[checkWhatsAppMenuAccess] Erro inesperado:', error);
    return false;
  }
}

















