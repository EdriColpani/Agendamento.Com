import { SupabaseClient } from '@supabase/supabase-js';
import { format, addMinutes, setHours, setMinutes, isBefore, isAfter, parseISO, parse, getDay, startOfDay, endOfDay } from 'date-fns';
import { supabaseUrl, supabaseAnonKey } from '@/integrations/supabase/client';

interface WorkingSchedule {
  id?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

interface ScheduleException {
  id?: string;
  exception_date: string;
  is_day_off: boolean;
  start_time: string | null;
  end_time: string | null;
}

interface Appointment {
  id?: string;
  appointment_time: string;
  total_duration_minutes: number;
}

/** Converte "HH:mm" ou "HH:mm:ss" em minutos desde meia-noite */
function timeToMinutes(t: string): number {
  const part = (t || '').substring(0, 5);
  const [h, m] = part.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Verifica se um agendamento sobrepõe o intervalo de uma exceção no mesmo dia.
 * - is_day_off: qualquer horário do dia conflita.
 * - Caso contrário: compara [appointment_time, appointment_time + duration] com [start_time, end_time].
 */
export function appointmentOverlapsException(
  appointmentTime: string,
  totalDurationMinutes: number,
  isDayOff: boolean,
  exceptionStartTime: string | null,
  exceptionEndTime: string | null
): boolean {
  if (isDayOff) return true;
  if (!exceptionStartTime || !exceptionEndTime) return true;
  const appStart = timeToMinutes(appointmentTime);
  const appEnd = appStart + totalDurationMinutes;
  const exStart = timeToMinutes(exceptionStartTime);
  const exEnd = timeToMinutes(exceptionEndTime);
  return appStart < exEnd && appEnd > exStart;
}

// Função helper para normalizar data sem problemas de timezone
function normalizeDate(date: Date): Date {
  // Criar nova data usando componentes locais para evitar problemas de timezone
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  return new Date(year, month, day, 0, 0, 0, 0);
}

export async function getAvailableTimeSlots(
  supabase: SupabaseClient,
  companyId: string,
  collaboratorId: string,
  date: Date,
  requiredDuration: number,
  slotIntervalMinutes: number | undefined = undefined, // Se não especificado, usa a duração do serviço
  excludeAppointmentId?: string // Novo parâmetro opcional
): Promise<string[]> {
  // Se slotIntervalMinutes não foi especificado, usar a duração do serviço como intervalo
  const interval = slotIntervalMinutes ?? requiredDuration;
  const availableSlots: string[] = [];
  // Normalizar a data para garantir que está no início do dia - PRESERVAR A DATA ORIGINAL
  // Usar função customizada para evitar problemas de timezone
  const normalizedDate = normalizeDate(date);
  const selectedDayOfWeek = getDay(normalizedDate); // 0 for Sunday, 1 for Monday, etc.
  const today = normalizeDate(new Date());
  const selectedDateStart = normalizedDate;

  console.log('--- getAvailableTimeSlots Start ---');
  console.log('Input Params:', { 
    companyId, 
    collaboratorId, 
    date: format(date, 'yyyy-MM-dd'), 
    dateISO: date.toISOString(),
    dateTime: date.getTime(),
    dateComponents: { year: date.getFullYear(), month: date.getMonth(), day: date.getDate() },
    normalizedDate: format(normalizedDate, 'yyyy-MM-dd'),
    normalizedDateISO: normalizedDate.toISOString(),
    normalizedDateComponents: { year: normalizedDate.getFullYear(), month: normalizedDate.getMonth(), day: normalizedDate.getDate() },
    requiredDuration, 
    slotIntervalMinutes: interval, 
    excludeAppointmentId 
  });

  // Fetch all scheduling data from Edge Function to bypass RLS
  const dateString = format(normalizedDate, 'yyyy-MM-dd');
  console.log('Sending to Edge Function - dateString:', dateString, 'normalizedDate:', format(normalizedDate, 'yyyy-MM-dd HH:mm:ss'), 'ISO:', normalizedDate.toISOString());
  const response = await fetch(`${supabaseUrl}/functions/v1/get-scheduling-data`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseAnonKey}`, // Use anon key for Edge Function call
    },
    body: JSON.stringify({
      companyId,
      collaboratorId,
      date: dateString, // Pass date as YYYY-MM-DD string to avoid timezone issues
      excludeAppointmentId,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error('Error calling get-scheduling-data Edge Function:', errorData);
    throw new Error('Failed to fetch scheduling data: ' + errorData.error);
  }

  const { workingSchedules, exceptions, existingAppointments } = await response.json();

  console.log('Fetched workingSchedules (from Edge Function):', workingSchedules);
  console.log('Fetched exceptions (from Edge Function):', exceptions);
  console.log('Fetched existingAppointments (from Edge Function):', existingAppointments);

  let effectiveWorkingIntervals: Array<{ start: Date; end: Date }> = [];
  let busyIntervals: Array<{ start: Date; end: Date }> = [];

  // Process working schedules first
  if (workingSchedules && workingSchedules.length > 0) {
    effectiveWorkingIntervals = workingSchedules.map(schedule => {
      // Defensive check for schedule object itself and its properties
      if (!schedule || typeof schedule.start_time !== 'string' || typeof schedule.end_time !== 'string') {
        console.warn(`Invalid working schedule entry found (ID: ${schedule?.id || 'unknown'}, Day: ${schedule?.day_of_week || 'unknown'}). Expected start_time and end_time to be strings. Skipping.`);
        return null; // Return null for invalid schedules
      }
      const startTimeStr = schedule.start_time.substring(0, 5);
      const endTimeStr = schedule.end_time.substring(0, 5);
      // Criar datas na data normalizada correta, garantindo que não mude devido a timezone
      // Usar componentes da data normalizada diretamente
      const year = normalizedDate.getFullYear();
      const month = normalizedDate.getMonth();
      const day = normalizedDate.getDate();
      const [startHour, startMinute] = startTimeStr.split(':').map(Number);
      const start = new Date(year, month, day, startHour, startMinute, 0, 0);
      const [endHour, endMinute] = endTimeStr.split(':').map(Number);
      const end = new Date(year, month, day, endHour, endMinute, 0, 0);
      console.log(`Created working interval: ${format(start, 'yyyy-MM-dd HH:mm')} to ${format(end, 'yyyy-MM-dd HH:mm')} (normalizedDate was: ${format(normalizedDate, 'yyyy-MM-dd')}, components: year=${year}, month=${month}, day=${day})`);
      return { start, end };
    }).filter(Boolean) as Array<{ start: Date; end: Date }>; // Filter out any nulls
  }
  console.log('Initial effectiveWorkingIntervals (from working_schedules):', effectiveWorkingIntervals.map(i => `${format(i.start, 'HH:mm')}-${format(i.end, 'HH:mm')}`));


  // Apply exceptions
  let isFullDayOff = false;
  if (exceptions && exceptions.length > 0) {
    for (const exception of exceptions) {
      if (exception.is_day_off) {
        isFullDayOff = true;
        console.log(`Exception: Full day off detected for ${format(date, 'yyyy-MM-dd')}.`);
        break; // If any exception is a full day off, no need to check others
      } else if (exception.start_time && exception.end_time) {
        if (typeof exception.start_time !== 'string' || typeof exception.end_time !== 'string') {
          console.warn(`Schedule exception ID ${exception.id || 'unknown'} for date ${exception.exception_date} has invalid start_time or end_time. Skipping this exception interval.`);
        } else {
          const exceptionTimeStr = exception.start_time.substring(0, 5);
          const exceptionEndTimeStr = exception.end_time.substring(0, 5);
          const year = normalizedDate.getFullYear();
          const month = normalizedDate.getMonth();
          const day = normalizedDate.getDate();
          const [exStartHour, exStartMinute] = exceptionTimeStr.split(':').map(Number);
          const exceptionStart = new Date(year, month, day, exStartHour, exStartMinute, 0, 0);
          const [exEndHour, exEndMinute] = exceptionEndTimeStr.split(':').map(Number);
          const exceptionEnd = new Date(year, month, day, exEndHour, exEndMinute, 0, 0);
          busyIntervals.push({ start: exceptionStart, end: exceptionEnd });
          console.log('Exception: Specific busy interval added:', `${format(exceptionStart, 'HH:mm')}-${format(exceptionEnd, 'HH:mm')}`);
        }
      }
    }
  }

  if (isFullDayOff) {
    effectiveWorkingIntervals = []; // Collaborator is off for the entire day
    console.log('EffectiveWorkingIntervals cleared due to full day off exception.');
  }
  console.log('EffectiveWorkingIntervals after full day off check:', effectiveWorkingIntervals.map(i => `${format(i.start, 'HH:mm')}-${format(i.end, 'HH:mm')}`)); // ADDED LOG
  console.log('BusyIntervals after exceptions processing:', busyIntervals.map(i => `${format(i.start, 'HH:mm')}-${format(i.end, 'HH:mm')}`)); // ADDED LOG


  // If no effective working hours after applying exceptions, no slots are available
  if (effectiveWorkingIntervals.length === 0) {
    console.log('No effective working hours found after applying exceptions. Returning empty slots.');
    console.log('--- getAvailableTimeSlots End ---');
    return [];
  }

  // Add existing appointments to busy intervals
  if (existingAppointments) {
    console.log(`Processing ${existingAppointments.length} existing appointments for date ${format(normalizedDate, 'yyyy-MM-dd')}`);
    existingAppointments.forEach(app => {
      if (!app || typeof app.appointment_time !== 'string') {
        console.warn(`Invalid appointment entry found (ID: ${app?.id || 'unknown'}). Expected appointment_time to be a string. Skipping.`);
        return;
      }
      const appStartTimeStr = app.appointment_time.substring(0, 5);
      const year = normalizedDate.getFullYear();
      const month = normalizedDate.getMonth();
      const day = normalizedDate.getDate();
      const [appHour, appMinute] = appStartTimeStr.split(':').map(Number);
      const appStartTime = new Date(year, month, day, appHour, appMinute, 0, 0);
      const appEndTime = addMinutes(appStartTime, app.total_duration_minutes);
      console.log(`  Adding busy interval from appointment: ${appStartTimeStr} (${format(appStartTime, 'yyyy-MM-dd HH:mm:ss')}) to ${format(appEndTime, 'HH:mm')} (${format(appEndTime, 'yyyy-MM-dd HH:mm:ss')})`);
      busyIntervals.push({ start: appStartTime, end: appEndTime });
    });
  }
  console.log('Final busyIntervals (appointments + exceptions):', busyIntervals.map(i => `${format(i.start, 'yyyy-MM-dd HH:mm')}-${format(i.end, 'yyyy-MM-dd HH:mm')}`));

  // Sort busy intervals by start time and merge overlapping busy intervals for efficiency
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
  console.log('Merged busyIntervals:', mergedBusyIntervals.map(i => `${format(i.start, 'HH:mm')}-${format(i.end, 'HH:mm')}`));


  // Generate potential slots within each effective working interval
  for (const workingInterval of effectiveWorkingIntervals) {
    let currentTime = workingInterval.start;

    // Adjust start time if it's today and before current time
    const selectedDateStr = format(selectedDateStart, 'yyyy-MM-dd');
    const todayStr = format(today, 'yyyy-MM-dd');
    const selectedYear = selectedDateStart.getFullYear();
    const selectedMonth = selectedDateStart.getMonth();
    const selectedDay = selectedDateStart.getDate();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth();
    const todayDay = today.getDate();
    const isToday = selectedYear === todayYear && selectedMonth === todayMonth && selectedDay === todayDay;
    console.log(`Comparing dates: selectedDateStr=${selectedDateStr} (${selectedYear}-${selectedMonth}-${selectedDay}), todayStr=${todayStr} (${todayYear}-${todayMonth}-${todayDay}), isToday=${isToday}`);
    
    if (isToday) {
      const now = new Date();
      const nextSlotAfterNow = setMinutes(setHours(now, now.getHours()), Math.ceil(now.getMinutes() / interval) * interval);
      // Criar data/hora do próximo slot na data selecionada para comparação correta
      const nextSlotOnSelectedDate = new Date(selectedDateStart.getTime());
      nextSlotOnSelectedDate.setHours(nextSlotAfterNow.getHours(), nextSlotAfterNow.getMinutes(), 0, 0);
      if (isBefore(currentTime, nextSlotOnSelectedDate)) {
        currentTime = nextSlotOnSelectedDate;
        console.log(`Adjusted currentTime for today: ${format(currentTime, 'HH:mm')} (Date: ${format(currentTime, 'yyyy-MM-dd')})`);
      }
    } else {
      console.log(`Not today, starting from working interval start: ${format(currentTime, 'HH:mm')} (Date: ${format(currentTime, 'yyyy-MM-dd')})`);
    }
    console.log(`Processing working interval: ${format(workingInterval.start, 'HH:mm')}-${format(workingInterval.end, 'HH:mm')} (Date: ${format(workingInterval.start, 'yyyy-MM-dd')})`);
    console.log(`Starting from currentTime: ${format(currentTime, 'HH:mm')} (Date: ${format(currentTime, 'yyyy-MM-dd')})`);

    while (isBefore(addMinutes(currentTime, requiredDuration), addMinutes(workingInterval.end, 1))) {
      const slotStart = new Date(currentTime); // Criar nova instância para não modificar currentTime
      const slotEnd = addMinutes(slotStart, requiredDuration);

      console.log(`  Checking slot: ${format(slotStart, 'HH:mm')}-${format(slotEnd, 'HH:mm')} (Date: ${format(slotStart, 'yyyy-MM-dd')})`);

      let isSlotFree = true;
      
      // Check against merged busy intervals (appointments and exceptions)
      // Verificar overlap: slot sobrepõe busy se slotStart < busy.end E slotEnd > busy.start
      for (const busy of mergedBusyIntervals) {
        const slotStartTime = slotStart.getTime();
        const slotEndTime = slotEnd.getTime();
        const busyStartTime = busy.start.getTime();
        const busyEndTime = busy.end.getTime();
        
        // Verificar se estão na mesma data antes de comparar
        const slotDate = format(slotStart, 'yyyy-MM-dd');
        const busyDate = format(busy.start, 'yyyy-MM-dd');
        
        if (slotDate !== busyDate) {
          console.log(`    Skipping comparison: slot date (${slotDate}) != busy date (${busyDate})`);
          continue; // Não comparar se não estiverem na mesma data
        }
        
        console.log(`    Comparing slot ${format(slotStart, 'HH:mm')}-${format(slotEnd, 'HH:mm')} (${slotStartTime}) with busy interval ${format(busy.start, 'HH:mm')}-${format(busy.end, 'HH:mm')} (${busyStartTime}-${busyEndTime})`);
        
        // Overlap ocorre quando: slotStart < busy.end AND slotEnd > busy.start
        // Isso significa que há alguma interseção entre os intervalos
        if (slotStartTime < busyEndTime && slotEndTime > busyStartTime) {
          isSlotFree = false;
          console.log(`    ❌ Overlap detected: ${format(slotStart, 'HH:mm')}-${format(slotEnd, 'HH:mm')} overlaps with ${format(busy.start, 'HH:mm')}-${format(busy.end, 'HH:mm')}`);
          const busyEndAligned = setMinutes(setHours(busy.end, busy.end.getHours()), Math.ceil(busy.end.getMinutes() / interval) * interval);
          currentTime = isAfter(currentTime, busyEndAligned) ? currentTime : busyEndAligned;
          console.log(`    Advanced currentTime to: ${format(currentTime, 'HH:mm')}`);
          break;
        } else {
          console.log(`    ✅ No overlap: slot ${format(slotStart, 'HH:mm')}-${format(slotEnd, 'HH:mm')} is free`);
        }
      }

      if (isSlotFree) {
        availableSlots.push(`${format(slotStart, 'HH:mm')}`); // Simplificado para apenas o horário de início
        console.log(`    ✅ Slot added: ${format(slotStart, 'HH:mm')}`);
      } else {
        console.log(`    ❌ Slot ${format(slotStart, 'HH:mm')}-${format(slotEnd, 'HH:mm')} is NOT free.`);
      }
      
      // Sempre avançar para o próximo slot, independente de estar livre ou não
      currentTime = addMinutes(currentTime, interval);
    }
  }

  const uniqueSlots = Array.from(new Set(availableSlots)).sort();
  console.log('Final uniqueSlots:', uniqueSlots);
  console.log('--- getAvailableTimeSlots End ---');

  return uniqueSlots;
}