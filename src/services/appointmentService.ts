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
  const onlyDigits = (value: string) => value.replace(/\D/g, '');
  const toCompanyScopedCanonical = (digits: string) => {
    if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) {
      return `55${digits}`;
    }
    return digits;
  };

  const buildPhoneVariants = (canonical: string, rawDigits: string) => {
    const variants = new Set<string>();
    if (canonical) variants.add(canonical);
    if (rawDigits) variants.add(rawDigits);
    if (canonical.startsWith('55')) {
      variants.add(`+${canonical}`);
      variants.add(canonical.slice(2));
    }
    return Array.from(variants).filter(Boolean);
  };

  // Normalizar para reduzir colisões entre formatos (com/sem DDI).
  const phoneDigits = onlyDigits(phone);
  const canonicalPhone = toCompanyScopedCanonical(phoneDigits);
  const phoneVariants = buildPhoneVariants(canonicalPhone, phoneDigits);

  // IMPORTANTE: sempre buscar no escopo da empresa atual.
  const { data: existingClients, error: searchError } = await supabase
    .from('clients')
    .select('id, name, phone, company_id')
    .eq('company_id', companyId)
    .in('phone', phoneVariants)
    .limit(10);

  if (searchError) {
    console.error('Erro ao buscar cliente:', searchError);
    // Continuar para criar novo cliente mesmo com erro na busca
  }

  // Se encontrou cliente na mesma empresa com telefone equivalente, reutiliza.
  const exactMatch = existingClients?.find(c => {
    const clientPhone = onlyDigits(c.phone || '');
    return clientPhone === canonicalPhone || clientPhone === phoneDigits;
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
      phone: canonicalPhone,
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
