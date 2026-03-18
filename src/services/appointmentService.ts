import { supabase } from '@/integrations/supabase/client';

interface GuestAppointmentData {
  company_id: string;
  client_id: string; // Virá do findOrCreateClient
  client_nickname: string; // Nome do convidado ficará aqui
  collaborator_id: string | null;
  appointment_date: string; // Formato YYYY-MM-DD
  appointment_time: string; // Formato HH:MM
  status: string;
  total_price: number;
  total_duration_minutes: number;
}

// Para agendamentos da página de convidado, criar ou buscar cliente pelo telefone
export async function findOrCreateClient(
  companyId: string,
  name: string,
  phone: string,
): Promise<{ clientId: string; clientNickname: string }> {
  // Remover formatação do telefone (apenas dígitos)
  const phoneDigits = phone.replace(/\D/g, '');
  
  // Se o telefone tem 10 ou 11 dígitos, adicionar DDI 55 se não tiver
  let formattedPhone = phoneDigits;
  if (phoneDigits.length === 10 || phoneDigits.length === 11) {
    if (!phoneDigits.startsWith('55')) {
      formattedPhone = '55' + phoneDigits;
    }
  } else if (phoneDigits.length >= 12 && phoneDigits.startsWith('55')) {
    formattedPhone = phoneDigits;
  } else {
    // Se não tiver formato válido, usar como está
    formattedPhone = phoneDigits;
  }

  // Buscar cliente existente pelo telefone (tentar vários formatos)
  const { data: existingClients, error: searchError } = await supabase
    .from('clients')
    .select('id, name, phone')
    .or(`phone.eq.${formattedPhone},phone.eq.${phoneDigits},phone.eq.+${formattedPhone},phone.like.%${phoneDigits.slice(-9)}%`)
    .limit(5);

  if (searchError) {
    console.error('Erro ao buscar cliente:', searchError);
    // Continuar para criar novo cliente mesmo com erro na busca
  }

  // Se encontrou cliente com telefone exato, usar ele
  const exactMatch = existingClients?.find(c => {
    const clientPhone = c.phone?.replace(/\D/g, '') || '';
    return clientPhone === formattedPhone || clientPhone === phoneDigits;
  });

  if (exactMatch) {
    return {
      clientId: exactMatch.id,
      clientNickname: name,
    };
  }

  // Cliente não existe, criar novo
  const { data: newClient, error: insertError } = await supabase
    .from('clients')
    .insert({
      name: name,
      phone: formattedPhone,
      email: `convidado_${Date.now()}@temp.com`,
      birth_date: '1900-01-01',
      zip_code: '00000000',
      state: 'XX',
      city: 'N/A',
      address: 'N/A',
      number: '0',
      neighborhood: 'N/A',
      company_id: companyId, // Associar à empresa
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('Erro ao criar cliente convidado:', insertError);
    throw insertError;
  }

  return {
    clientId: newClient.id,
    clientNickname: name,
  };
}

export async function createGuestAppointment(
  appointmentData: GuestAppointmentData,
  serviceId: string,
): Promise<string> {
  // 1. Cria o registro principal em `appointments` (sem coluna service_id)
  const { data: appointment, error: appointmentError } = await supabase
    .from('appointments')
    .insert([appointmentData])
    .select('id')
    .single();

  if (appointmentError) {
    console.error('Error creating guest appointment (appointments insert):', appointmentError);
    throw new Error('Erro ao criar agendamento de convidado.');
  }

  // 2. Vincula o serviço à tabela de junção `appointment_services`
  const { error: servicesLinkError } = await supabase
    .from('appointment_services')
    .insert({
      appointment_id: appointment.id,
      service_id: serviceId,
    });

  if (servicesLinkError) {
    console.error('Error linking service to guest appointment (appointment_services insert):', servicesLinkError);
    // Opcionalmente poderíamos remover o appointment criado para evitar órfãos,
    // mas por simplicidade apenas informamos o erro.
    throw new Error('Erro ao vincular serviço ao agendamento de convidado.');
  }

  return appointment.id;
}
