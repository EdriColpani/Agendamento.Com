import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.0';
import { format, getDay } from 'https://esm.sh/date-fns@3.6.0';

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
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { companyId, collaboratorId, date: rawDate, excludeAppointmentId } = await req.json();

    if (!companyId || !collaboratorId || !rawDate) {
      return jsonResponse({ error: 'Parâmetros obrigatórios ausentes.' }, 400);
    }

    // Parse date from YYYY-MM-DD string to avoid timezone issues
    // Se vier como ISO string, parse como ISO. Se vier como YYYY-MM-DD, parse como YYYY-MM-DD
    let date: Date;
    if (typeof rawDate === 'string' && rawDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      // É formato YYYY-MM-DD, criar data diretamente para evitar problemas de timezone
      const [year, month, day] = rawDate.split('-').map(Number);
      date = new Date(year, month - 1, day, 0, 0, 0, 0); // month é 0-indexed
    } else {
      // É ISO string ou outro formato, converter
      date = new Date(rawDate);
    }
    
    const formattedDate = format(date, 'yyyy-MM-dd');
    const selectedDayOfWeek = getDay(date); // 0 for Sunday, 1 for Monday, etc.
    
    console.log('get-scheduling-data: Received date:', rawDate, 'parsed:', formattedDate, 'dayOfWeek:', selectedDayOfWeek, 'date object:', date.toISOString());

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

    // Fetch working schedules (sempre buscar dados atualizados)
    console.log('get-scheduling-data: Buscando working schedules em:', new Date().toISOString());
    const { data: workingSchedules, error: wsError } = await supabaseAdmin
      .from('working_schedules')
      .select('id, day_of_week, start_time, end_time')
      .eq('collaborator_id', collaboratorId)
      .eq('company_id', companyId)
      .eq('day_of_week', selectedDayOfWeek)
      .order('start_time', { ascending: true });

    if (wsError) {
      console.error('Edge Function Error (get-scheduling-data): Error fetching working schedules:', wsError);
      return jsonResponse({ error: 'Erro ao carregar horários de trabalho.' }, 500);
    }
    console.log('get-scheduling-data: workingSchedules encontrados:', workingSchedules?.length || 0);

    // Fetch schedule exceptions (sempre buscar dados atualizados)
    console.log('get-scheduling-data: Buscando schedule exceptions em:', new Date().toISOString());
    const { data: exceptions, error: exError } = await supabaseAdmin
      .from('schedule_exceptions')
      .select('id, exception_date, is_day_off, start_time, end_time, reason')
      .eq('collaborator_id', collaboratorId)
      .eq('company_id', companyId)
      .eq('exception_date', formattedDate)
      .order('start_time', { ascending: true });

    if (exError) {
      console.error('Edge Function Error (get-scheduling-data): Error fetching schedule exceptions:', exError);
      return jsonResponse({ error: 'Erro ao carregar exceções de agenda.' }, 500);
    }
    console.log('get-scheduling-data: exceptions encontradas:', exceptions?.length || 0);

    // Fetch existing appointments (SEMPRE buscar dados atualizados)
    console.log('get-scheduling-data: Buscando appointments em:', new Date().toISOString());
    let appointmentsQuery = supabaseAdmin
      .from('appointments')
      .select('id, appointment_time, total_duration_minutes, status, created_at')
      .eq('collaborator_id', collaboratorId)
      .eq('company_id', companyId)
      .eq('appointment_date', formattedDate)
      .neq('status', 'cancelado')
      .order('appointment_time', { ascending: true });

    if (excludeAppointmentId) {
      appointmentsQuery = appointmentsQuery.neq('id', excludeAppointmentId);
      console.log('get-scheduling-data: Excluindo appointment ID:', excludeAppointmentId);
    }

    const { data: existingAppointments, error: appError } = await appointmentsQuery;
    console.log('get-scheduling-data: appointments encontrados:', existingAppointments?.length || 0);

    if (appError) {
      console.error('Edge Function Error (get-scheduling-data): Error fetching existing appointments:', appError);
      return jsonResponse({ error: 'Erro ao carregar agendamentos existentes.' }, 500);
    }

    return jsonResponse({
      workingSchedules,
      exceptions,
      existingAppointments,
    }, 200);

  } catch (error: unknown) {
    console.error('Edge Function Error (get-scheduling-data): Uncaught exception -', error);
    return jsonResponse({ error: 'Erro interno ao buscar dados de agenda.' }, 500);
  }
});

