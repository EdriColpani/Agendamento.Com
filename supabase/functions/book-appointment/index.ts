import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.46.0";
import { format, addMinutes, parse, getDay, startOfDay, isBefore, isAfter, setHours, setMinutes } from "https://esm.sh/date-fns@3.6.0";

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

/**
 * Verifica se a empresa tem acesso ao menu WhatsApp através do plano ativo
 * @param supabase Cliente Supabase
 * @param companyId ID da empresa
 * @returns Promise<boolean> true se tem acesso, false caso contrário
 */
async function checkWhatsAppMenuAccess(
  supabase: SupabaseClient,
  companyId: string
): Promise<boolean> {
  try {
    // 1. Buscar plano ativo da empresa
    const { data: subscriptionData, error: subError } = await supabase
      .from('company_subscriptions')
      .select('plan_id')
      .eq('company_id', companyId)
      .eq('status', 'active')
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subError && subError.code !== 'PGRST116') {
      console.error('[checkWhatsAppMenuAccess] Erro ao buscar assinatura:', subError);
      return false;
    }

    if (!subscriptionData || !subscriptionData.plan_id) {
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

// Helper function to get available time slots (replicated from frontend utility for backend re-validation)
async function getAvailableTimeSlotsBackend(
  supabase: SupabaseClient,
  companyId: string,
  collaboratorId: string,
  date: Date,
  requiredDuration: number,
  slotIntervalMinutes: number | undefined = undefined, // Se não especificado, usa a duração do serviço
  excludeAppointmentId?: string
): Promise<string[]> {
  // Se slotIntervalMinutes não foi especificado, usar a duração do serviço como intervalo
  const interval = slotIntervalMinutes ?? requiredDuration;
  console.log('getAvailableTimeSlotsBackend Start:', { companyId, collaboratorId, date: date.toISOString(), requiredDuration, interval });
  const availableSlots: string[] = [];
  // Normalizar a data para garantir que está no início do dia - PRESERVAR A DATA ORIGINAL
  const normalizedDate = startOfDay(date);
  const selectedDayOfWeek = getDay(normalizedDate);
  const today = startOfDay(new Date());
  const selectedDateStart = normalizedDate;

  // 1. Fetch working schedules for the selected day (sempre buscar dados atualizados)
  const { data: workingSchedules, error: wsError } = await supabase
    .from('working_schedules')
    .select('id, day_of_week, start_time, end_time')
    .eq('collaborator_id', collaboratorId)
    .eq('company_id', companyId)
    .eq('day_of_week', selectedDayOfWeek)
    .order('start_time', { ascending: true }); // Ordenar para garantir consistência
    
  console.log('getAvailableTimeSlotsBackend: workingSchedules fetched:', workingSchedules, 'error:', wsError);
  console.log('getAvailableTimeSlotsBackend: Timestamp da busca:', new Date().toISOString());

  if (wsError) throw wsError;

  // 2. Fetch schedule exceptions for the selected date (sempre buscar dados atualizados)
  const { data: exceptions, error: exError } = await supabase
    .from('schedule_exceptions')
    .select('id, exception_date, is_day_off, start_time, end_time, reason')
    .eq('collaborator_id', collaboratorId)
    .eq('company_id', companyId)
    .eq('exception_date', format(normalizedDate, 'yyyy-MM-dd'))
    .order('start_time', { ascending: true }); // Ordenar para garantir consistência

  console.log('getAvailableTimeSlotsBackend: exceptions fetched:', exceptions, 'error:', exError);
  console.log('getAvailableTimeSlotsBackend: Timestamp da busca de exceptions:', new Date().toISOString());

  if (exError) throw exError;

  let effectiveWorkingIntervals: Array<{ start: Date; end: Date }> = [];
  let busyIntervals: Array<{ start: Date; end: Date }> = [];

  if (workingSchedules && workingSchedules.length > 0) {
    effectiveWorkingIntervals = workingSchedules.map(schedule => {
      if (!schedule || typeof schedule.start_time !== 'string' || typeof schedule.end_time !== 'string') {
        console.warn('getAvailableTimeSlotsBackend: Invalid schedule entry:', schedule);
        return null;
      }
      const startTimeStr = schedule.start_time.substring(0, 5);
      const endTimeStr = schedule.end_time.substring(0, 5);
      // Criar datas na data normalizada correta, garantindo que não mude devido a timezone
      const start = new Date(normalizedDate);
      const [startHour, startMinute] = startTimeStr.split(':').map(Number);
      start.setHours(startHour, startMinute, 0, 0);
      const end = new Date(normalizedDate);
      const [endHour, endMinute] = endTimeStr.split(':').map(Number);
      end.setHours(endHour, endMinute, 0, 0);
      return { start, end };
    }).filter(Boolean) as Array<{ start: Date; end: Date }>;
  }
  console.log('getAvailableTimeSlotsBackend: effectiveWorkingIntervals:', effectiveWorkingIntervals.map(i => ({ start: i.start.toISOString(), end: i.end.toISOString() })));

  let isFullDayOff = false;
  if (exceptions && exceptions.length > 0) {
    for (const exception of exceptions) {
      if (exception.is_day_off) {
        isFullDayOff = true;
        console.log('getAvailableTimeSlotsBackend: Full day off exception found.');
        break; // If any exception is a full day off, no need to check others
      } else if (exception.start_time && exception.end_time) {
        if (typeof exception.start_time !== 'string' || typeof exception.end_time !== 'string') {
          console.warn('getAvailableTimeSlotsBackend: Invalid exception times, skipping:', exception);
          // Invalid exception times, skip
        } else {
          const exceptionTimeStr = exception.start_time.substring(0, 5);
          const exceptionEndTimeStr = exception.end_time.substring(0, 5);
          const exceptionStart = new Date(normalizedDate);
          const [exStartHour, exStartMinute] = exceptionTimeStr.split(':').map(Number);
          exceptionStart.setHours(exStartHour, exStartMinute, 0, 0);
          const exceptionEnd = new Date(normalizedDate);
          const [exEndHour, exEndMinute] = exceptionEndTimeStr.split(':').map(Number);
          exceptionEnd.setHours(exEndHour, exEndMinute, 0, 0);
          busyIntervals.push({ start: exceptionStart, end: exceptionEnd });
          console.log('getAvailableTimeSlotsBackend: Added exception busy interval:', { start: exceptionStart.toISOString(), end: exceptionEnd.toISOString() });
        }
      }
    }
  }

  if (isFullDayOff) {
    effectiveWorkingIntervals = [];
    console.log('getAvailableTimeSlotsBackend: effectiveWorkingIntervals cleared due to full day off.');
  }

  if (effectiveWorkingIntervals.length === 0) {
    console.log('getAvailableTimeSlotsBackend: No effective working intervals, returning empty slots.');
    return [];
  }

  // 3. Fetch existing appointments for the selected date and collaborator (SEMPRE buscar dados atualizados)
  let appointmentsQuery = supabase
    .from('appointments')
    .select('id, appointment_time, total_duration_minutes, status, created_at')
    .eq('collaborator_id', collaboratorId)
    .eq('company_id', companyId)
    .eq('appointment_date', format(normalizedDate, 'yyyy-MM-dd'))
    .neq('status', 'cancelado')
    .order('appointment_time', { ascending: true }); // Ordenar para garantir consistência

  if (excludeAppointmentId) {
    appointmentsQuery = appointmentsQuery.neq('id', excludeAppointmentId);
    console.log('getAvailableTimeSlotsBackend: Excluding appointment ID:', excludeAppointmentId);
  }

  const { data: existingAppointments, error: appError } = await appointmentsQuery;
  console.log('getAvailableTimeSlotsBackend: existingAppointments fetched:', existingAppointments, 'error:', appError);
  console.log('getAvailableTimeSlotsBackend: Timestamp da busca de appointments:', new Date().toISOString());
  console.log('getAvailableTimeSlotsBackend: Total de appointments encontrados:', existingAppointments?.length || 0);

  if (appError) throw appError;

  if (existingAppointments) {
    console.log(`getAvailableTimeSlotsBackend: Processing ${existingAppointments.length} existing appointments for date ${format(normalizedDate, 'yyyy-MM-dd')}`);
    existingAppointments.forEach(app => {
      if (!app || typeof app.appointment_time !== 'string') {
        console.warn('getAvailableTimeSlotsBackend: Invalid appointment entry, skipping:', app);
        return;
      }
      const appStartTimeStr = app.appointment_time.substring(0, 5);
      const appStartTime = new Date(normalizedDate);
      const [appHour, appMinute] = appStartTimeStr.split(':').map(Number);
      appStartTime.setHours(appHour, appMinute, 0, 0);
      const appEndTime = addMinutes(appStartTime, app.total_duration_minutes);
      console.log(`getAvailableTimeSlotsBackend: Adding busy interval from appointment: ${appStartTimeStr} (${format(appStartTime, 'yyyy-MM-dd HH:mm:ss')}) to ${format(appEndTime, 'HH:mm')} (${format(appEndTime, 'yyyy-MM-dd HH:mm:ss')})`);
      busyIntervals.push({ start: appStartTime, end: appEndTime });
    });
  }
  console.log('getAvailableTimeSlotsBackend: All raw busyIntervals (from exceptions and appointments):', busyIntervals.map(b => ({ start: b.start.toISOString(), end: b.end.toISOString() })));

  busyIntervals.sort((a, b) => a.start.getTime() - b.start.getTime());
  const mergedBusyIntervals = [];
  if (busyIntervals.length > 0) {
    let currentMerged = busyIntervals[0];
    for (let i = 1; i < busyIntervals.length; i++) {
      const next = busyIntervals[i];
      if (isBefore(next.start, addMinutes(currentMerged.end, 1))) { // Check if next interval overlaps or is adjacent
        currentMerged.end = isAfter(currentMerged.end, next.end) ? currentMerged.end : next.end;
      } else {
        mergedBusyIntervals.push(currentMerged);
        currentMerged = next;
      }
    }
    mergedBusyIntervals.push(currentMerged);
  }
  console.log('getAvailableTimeSlotsBackend: Merged busyIntervals:', mergedBusyIntervals.map(b => ({ start: b.start.toISOString(), end: b.end.toISOString() })));

  for (const workingInterval of effectiveWorkingIntervals) {
    let currentTime = workingInterval.start;

    // Se for hoje, ajustar para começar do próximo slot após o horário atual
    if (selectedDateStart.getTime() === today.getTime()) {
      const now = new Date();
      // Criar data/hora do slot atual na data selecionada
      const currentSlotDateTime = new Date(selectedDateStart);
      currentSlotDateTime.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
      
      // Calcular próximo slot alinhado
      const nextSlotAfterNow = setMinutes(
        setHours(currentSlotDateTime, currentSlotDateTime.getHours()), 
        Math.ceil(currentSlotDateTime.getMinutes() / interval) * interval
      );
      
      if (isBefore(currentTime, nextSlotAfterNow)) {
        currentTime = nextSlotAfterNow;
        console.log('getAvailableTimeSlotsBackend: Ajustado currentTime para próximo slot após agora:', format(currentTime, 'HH:mm'));
      }
    }
    console.log('getAvailableTimeSlotsBackend: Starting iteration for workingInterval:', { start: workingInterval.start.toISOString(), end: workingInterval.end.toISOString(), initialCurrentTime: currentTime.toISOString() });

    while (isBefore(addMinutes(currentTime, requiredDuration), addMinutes(workingInterval.end, 1))) {
      const slotStart = currentTime;
      const slotEnd = addMinutes(slotStart, requiredDuration);

      let isSlotFree = true;
      let shouldAdvance = true;
      let nextTime = addMinutes(currentTime, interval);
      
      // Check against past time for current day (usar a data selecionada, não a data atual)
      if (selectedDateStart.getTime() === today.getTime()) {
        const now = new Date();
        // Criar data/hora do slot na data selecionada para comparação correta
        const slotDateTime = new Date(selectedDateStart);
        slotDateTime.setHours(slotStart.getHours(), slotStart.getMinutes(), slotStart.getSeconds(), slotStart.getMilliseconds());
        
        if (isBefore(slotDateTime, now)) {
          isSlotFree = false;
          console.log('getAvailableTimeSlotsBackend: Slot ignored (in past):', format(slotStart, 'HH:mm'), 'slotDateTime:', slotDateTime.toISOString(), 'now:', now.toISOString());
          // Avançar para o próximo slot após o horário atual
          const nextSlotAfterNow = setMinutes(
            setHours(now, now.getHours()), 
            Math.ceil(now.getMinutes() / interval) * interval
          );
          // Converter para a data selecionada
          const nextSlotOnSelectedDate = new Date(selectedDateStart);
          nextSlotOnSelectedDate.setHours(nextSlotAfterNow.getHours(), nextSlotAfterNow.getMinutes(), 0, 0);
          if (isBefore(currentTime, nextSlotOnSelectedDate)) {
            nextTime = nextSlotOnSelectedDate;
          }
        } else {
          // Slot não está no passado, verificar conflitos
          for (const busy of mergedBusyIntervals) {
            // Verificar se estão na mesma data antes de comparar
            const slotDate = format(slotStart, 'yyyy-MM-dd');
            const busyDate = format(busy.start, 'yyyy-MM-dd');
            
            if (slotDate !== busyDate) {
              continue; // Não comparar se não estiverem na mesma data
            }
            
            const slotStartTime = slotStart.getTime();
            const slotEndTime = slotEnd.getTime();
            const busyStartTime = busy.start.getTime();
            const busyEndTime = busy.end.getTime();
            
            if (slotStartTime < busyEndTime && slotEndTime > busyStartTime) {
              isSlotFree = false;
              console.log('getAvailableTimeSlotsBackend: Slot ignored (conflicts with busy interval):', format(slotStart, 'HH:mm'), 'Busy Interval:', { start: busy.start.toISOString(), end: busy.end.toISOString() });
              // Avançar para depois do busy interval, alinhado ao interval
              const busyEndAligned = setMinutes(setHours(busy.end, busy.end.getHours()), Math.ceil(busy.end.getMinutes() / interval) * interval);
              if (isBefore(currentTime, busyEndAligned)) {
                nextTime = busyEndAligned;
              }
              break;
            }
          }
        }
      } else {
        // Não é hoje, apenas verificar conflitos com busy intervals
        for (const busy of mergedBusyIntervals) {
          // Verificar se estão na mesma data antes de comparar
          const slotDate = format(slotStart, 'yyyy-MM-dd');
          const busyDate = format(busy.start, 'yyyy-MM-dd');
          
          if (slotDate !== busyDate) {
            console.log(`getAvailableTimeSlotsBackend: Skipping comparison - slot date (${slotDate}) != busy date (${busyDate})`);
            continue; // Não comparar se não estiverem na mesma data
          }
          
          const slotStartTime = slotStart.getTime();
          const slotEndTime = slotEnd.getTime();
          const busyStartTime = busy.start.getTime();
          const busyEndTime = busy.end.getTime();
          
          console.log(`getAvailableTimeSlotsBackend: Comparing slot ${format(slotStart, 'HH:mm')}-${format(slotEnd, 'HH:mm')} (${slotStartTime}-${slotEndTime}) with busy ${format(busy.start, 'HH:mm')}-${format(busy.end, 'HH:mm')} (${busyStartTime}-${busyEndTime})`);
          
          if (slotStartTime < busyEndTime && slotEndTime > busyStartTime) {
            isSlotFree = false;
            console.log('getAvailableTimeSlotsBackend: ❌ Slot ignored (conflicts with busy interval):', format(slotStart, 'HH:mm'), 'Busy Interval:', { start: busy.start.toISOString(), end: busy.end.toISOString() });
            // Avançar para depois do busy interval, alinhado ao interval
            const busyEndAligned = setMinutes(setHours(busy.end, busy.end.getHours()), Math.ceil(busy.end.getMinutes() / interval) * interval);
            if (isBefore(currentTime, busyEndAligned)) {
              nextTime = busyEndAligned;
            }
            break;
          } else {
            console.log(`getAvailableTimeSlotsBackend: ✅ No overlap: slot ${format(slotStart, 'HH:mm')}-${format(slotEnd, 'HH:mm')} is free`);
          }
        }
      }

      if (isSlotFree) {
        const slotString = `${format(slotStart, 'HH:mm')} às ${format(slotEnd, 'HH:mm')}`;
        availableSlots.push(slotString);
        console.log('getAvailableTimeSlotsBackend: Slot added:', slotString);
      }
      
      // Sempre avançar currentTime para o próximo slot
      currentTime = nextTime;
      console.log('getAvailableTimeSlotsBackend: Advanced currentTime to:', format(currentTime, 'HH:mm'));
    }
  }
    console.log('getAvailableTimeSlotsBackend End - Final availableSlots:', availableSlots);
    const uniqueSlots = Array.from(new Set(availableSlots)).sort();
    console.log('getAvailableTimeSlotsBackend End - Unique slots count:', uniqueSlots.length);
    return uniqueSlots;
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
      return jsonResponse({ error: 'Não autorizado.' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      return jsonResponse({ error: 'Não autorizado.' }, 401);
    }

    const {
      clientId,
      clientNickname, // <-- Agora vamos usar este campo
      collaboratorId,
      serviceIds,
      appointmentDate,
      appointmentTime,
      totalDurationMinutes,
      totalPriceCalculated,
      observations,
      companyId,
    } = await req.json();

    console.log('book-appointment: Received payload for booking:', { companyId, clientId, collaboratorId, serviceIds, appointmentDate, appointmentTime, totalDurationMinutes, totalPriceCalculated, observations });

    if (!clientId || !collaboratorId || !serviceIds || serviceIds.length === 0 || !appointmentDate || !appointmentTime || !companyId || totalDurationMinutes === undefined || totalPriceCalculated === undefined) {
        return jsonResponse({ error: 'Dados obrigatórios do agendamento ausentes.' }, 400);
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

    // 1. Verify if the authenticated user is the client they are trying to book for
    const { data: clientData, error: clientFetchError } = await supabaseAdmin
      .from('clients')
      .select('id, client_auth_id')
      .eq('id', clientId)
      .single();

    if (clientFetchError || !clientData || clientData.client_auth_id !== user.id) {
      console.warn('book-appointment: Forbidden attempt to book for another client.', { userId: user.id, clientId, clientAuthId: clientData?.client_auth_id });
      return new Response(JSON.stringify({ error: 'Forbidden: You can only book appointments for yourself.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // 2. Re-verify time slot availability on the backend to prevent race conditions
    // Normalizar a data para garantir que está no início do dia - PRESERVAR A DATA ORIGINAL
    const parsedAppointmentDate = startOfDay(parse(appointmentDate, 'yyyy-MM-dd', new Date()));
    
    // Extrair horário de início de forma robusta (pode vir como "HH:mm" ou "HH:mm às HH:mm")
    let startTimeForDb: string;
    if (appointmentTime.includes(' às ')) {
      startTimeForDb = appointmentTime.split(' às ')[0].trim();
    } else if (appointmentTime.includes(' ')) {
      startTimeForDb = appointmentTime.split(' ')[0].trim();
    } else {
      startTimeForDb = appointmentTime.trim();
    }
    
    // Validar formato HH:mm
    if (!/^\d{2}:\d{2}$/.test(startTimeForDb)) {
      console.error('book-appointment: Invalid time format received:', appointmentTime, 'extracted:', startTimeForDb);
      return jsonResponse({ error: 'Formato de horário inválido.' }, 400);
    }
    
    // Criar data/hora de início na data normalizada correta
    const startDateTime = new Date(parsedAppointmentDate);
    const [startHour, startMinute] = startTimeForDb.split(':').map(Number);
    startDateTime.setHours(startHour, startMinute, 0, 0);
    const endDateTime = addMinutes(startDateTime, totalDurationMinutes);
    const endTimeForDb = format(endDateTime, 'HH:mm');
    const requestedSlot = `${startTimeForDb} às ${endTimeForDb}`;

    console.log('book-appointment: Re-validating requestedSlot:', requestedSlot);
    console.log('book-appointment: Original appointmentTime:', appointmentTime);
    console.log('book-appointment: Extracted startTimeForDb:', startTimeForDb);
    console.log('book-appointment: Parameters for getAvailableTimeSlotsBackend:', { companyId, collaboratorId, parsedAppointmentDate: parsedAppointmentDate.toISOString(), totalDurationMinutes });

    const availableSlots = await getAvailableTimeSlotsBackend(
      supabaseAdmin, // Use admin client for backend check
      companyId,
      collaboratorId,
      parsedAppointmentDate,
      totalDurationMinutes
    );

    console.log('book-appointment: Available slots from backend (re-validation):', availableSlots);
    console.log('book-appointment: Requested slot format:', requestedSlot);
    console.log('book-appointment: Slot comparison check:', {
      requestedSlot,
      availableSlotsCount: availableSlots.length,
      isIncluded: availableSlots.includes(requestedSlot),
      firstFewSlots: availableSlots.slice(0, 5),
    });

    // Comparação mais robusta: normalizar strings antes de comparar
    const normalizedRequestedSlot = requestedSlot.trim().toLowerCase();
    const normalizedAvailableSlots = availableSlots.map(s => s.trim().toLowerCase());
    let isSlotAvailable = normalizedAvailableSlots.includes(normalizedRequestedSlot);
    
    // Se não encontrou por string exata, tenta comparar por horário de início e duração
    if (!isSlotAvailable) {
      const requestedStartTime = startTimeForDb;
      const requestedEndTime = endTimeForDb;
      
      // Verificar se algum slot disponível tem o mesmo horário de início e duração
      for (const slot of availableSlots) {
        const slotParts = slot.split(' às ');
        if (slotParts.length === 2) {
          const slotStart = slotParts[0].trim();
          const slotEnd = slotParts[1].trim();
          
          if (slotStart === requestedStartTime && slotEnd === requestedEndTime) {
            isSlotAvailable = true;
            console.log('book-appointment: Slot encontrado por comparação de horários:', { slot, requestedStartTime, requestedEndTime });
            break;
          }
        }
      }
    }

    if (!isSlotAvailable) {
      // Log detalhado para debug
      const debugInfo = {
        requestedSlot,
        normalizedRequestedSlot,
        startTimeForDb,
        endTimeForDb,
        totalDurationMinutes,
        availableSlotsCount: availableSlots.length,
        availableSlots: availableSlots.slice(0, 10), // Primeiros 10 slots
        normalizedAvailableSlots: normalizedAvailableSlots.slice(0, 10),
        requestedSlotLength: requestedSlot.length,
        firstAvailableSlotLength: availableSlots[0]?.length,
        requestedSlotChars: Array.from(requestedSlot).map(c => ({ char: c, code: c.charCodeAt(0) })),
        firstAvailableSlotChars: availableSlots[0] ? Array.from(availableSlots[0]).map((c: string) => ({ char: c, code: c.charCodeAt(0) })) : null,
      };
      
      console.error('book-appointment: Requested slot not available during re-validation.', JSON.stringify(debugInfo, null, 2));
      
      return new Response(JSON.stringify({ 
        error: 'O horário selecionado não está mais disponível. Por favor, escolha outro horário.',
        requestedSlot,
        availableSlotsCount: availableSlots.length,
        availableSlots: availableSlots.slice(0, 5), // Primeiros 5 slots para o usuário ver
      }), {
        status: 409, // Conflict
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Insert the main appointment entry
    const { data: appointment, error: insertAppointmentError } = await supabaseAdmin
      .from('appointments')
      .insert({
        company_id: companyId,
        client_id: clientId,
        client_nickname: clientNickname, // <-- AGORA INSERIMOS O NICKNAME/NOME
        collaborator_id: collaboratorId,
        appointment_date: appointmentDate,
        appointment_time: startTimeForDb,
        total_duration_minutes: totalDurationMinutes,
        total_price: totalPriceCalculated,
        observations: observations,
        created_by_user_id: user.id, // The client who created the appointment
        status: 'pendente', // Default status for new client appointments
      })
      .select()
      .single();

    if (insertAppointmentError) {
      console.error('book-appointment: Error inserting appointment:', insertAppointmentError.message);
      return jsonResponse({ error: 'Erro ao registrar agendamento.' }, 500);
    }

    // 4. Link services to the appointment in appointment_services table
    const appointmentServicesToInsert = serviceIds.map((serviceId: string) => ({
      appointment_id: appointment.id,
      service_id: serviceId,
    }));

    const { error: insertServicesError } = await supabaseAdmin
      .from('appointment_services')
      .insert(appointmentServicesToInsert);

    if (insertServicesError) {
      console.error('book-appointment: Error inserting appointment services:', insertServicesError.message);
      // Consider rolling back the appointment if service linking fails
      await supabaseAdmin.from('appointments').delete().eq('id', appointment.id);
      return jsonResponse({ error: 'Erro ao vincular serviços ao agendamento.' }, 500);
    }

    return jsonResponse({ message: 'Appointment booked successfully', appointmentId: appointment.id }, 200);

  } catch (error: unknown) {
    console.error('Edge Function Error (book-appointment): Uncaught exception -', error);
    return jsonResponse({ error: 'Erro interno ao criar agendamento.' }, 500);
  }
});
