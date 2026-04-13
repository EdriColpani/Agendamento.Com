import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';
import { usePrimaryCompany } from '@/hooks/usePrimaryCompany';
import { useIsCollaborator } from '@/hooks/useIsCollaborator';
import { getDateRange, getPreviousDateRange, DateRangeKey, DateRange } from '@/utils/date-utils';
import { format } from 'date-fns';

interface ReportMetric {
  value: number;
  comparison: number; // Percentage change vs previous period
  isPositive: boolean;
}

interface CollaboratorPerformance {
  id: string;
  name: string;
  appointments: number;
  revenue: number;
  commission: number; // Total gerado
  paid_amount: number; // Valor já pago
  pending_amount: number; // Valor pendente
}

interface ServiceCommissionDetail {
  serviceId: string;
  serviceName: string;
  commission: number;
  appointmentDate: string; // Adicionado a data do agendamento
}

interface PopularService {
  service: string;
  quantity: number;
  percentual: number;
}

interface ReportsData {
  revenue: ReportMetric;
  averageTicket: ReportMetric;
  clientsServed: ReportMetric;
  cancellations: ReportMetric;
  collaboratorPerformance: CollaboratorPerformance[];
  popularServices: PopularService[];
  serviceCommissionsByCollaborator: { [collaboratorId: string]: ServiceCommissionDetail[] };
  allServiceNames: string[]; // Adicionado para os filtros
}

const initialReportMetric: ReportMetric = { value: 0, comparison: 0, isPositive: true };

const initialReportsData: ReportsData = {
  revenue: initialReportMetric,
  averageTicket: initialReportMetric,
  clientsServed: initialReportMetric,
  cancellations: initialReportMetric,
  collaboratorPerformance: [],
  popularServices: [],
  serviceCommissionsByCollaborator: {},
  allServiceNames: [], // Inicializado
};

// Helper to calculate comparison percentage
const calculateComparison = (currentValue: number, previousValue: number, isInverse: boolean = false): ReportMetric => {
  if (previousValue === 0) {
    return {
      value: currentValue,
      comparison: currentValue > 0 ? 100 : 0,
      isPositive: currentValue >= 0,
    };
  }
  const change = ((currentValue - previousValue) / previousValue) * 100;
  
  let isPositive = change >= 0;
  if (isInverse) {
    isPositive = change <= 0; // For cancellations, negative change (decrease) is positive
  }

  return {
    value: currentValue,
    comparison: Math.abs(change),
    isPositive: isInverse ? !isPositive : isPositive, // Flip positive logic for inverse metrics
  };
};

// Main function to fetch and calculate metrics for a given date range
// collaboratorId: opcional - se fornecido, filtra dados apenas deste colaborador
async function fetchMetrics(companyId: string, range: DateRange, collaboratorId?: string) {
  const { startDateDb, endDateDb } = range;
  const startDateTimeDb = `${startDateDb}T00:00:00`;
  const endDateTimeDb = format(range.endDate, "yyyy-MM-dd'T'HH:mm:ss");

  // 1. Fetch all relevant appointments (completed and cancelled)
  // Se collaboratorId fornecido, filtrar apenas agendamentos deste colaborador
  let appointmentsQuery = supabase
    .from('appointments')
    .select('id, client_id, collaborator_id, total_price, status, appointment_date') // Adicionado appointment_date
    .eq('company_id', companyId)
    .gte('appointment_date', startDateDb)
    .lte('appointment_date', endDateDb);

  if (collaboratorId) {
    appointmentsQuery = appointmentsQuery.eq('collaborator_id', collaboratorId);
  }

  const { data: appointmentsData, error: appError } = await appointmentsQuery;

  if (appError) throw appError;

  // 2. Fetch all cash movements (revenue)
  // Se collaboratorId fornecido, filtrar apenas recebimentos de agendamentos deste colaborador
  let cashMovementsQuery = supabase
    .from('cash_movements')
    .select('total_amount, transaction_type, appointment_id')
    .eq('company_id', companyId)
    .eq('transaction_type', 'recebimento')
    .gte('transaction_date', startDateTimeDb)
    .lte('transaction_date', endDateTimeDb);

  const { data: cashMovementsData, error: cmError } = await cashMovementsQuery;

  if (cmError) throw cmError;

  // Se collaboratorId fornecido, filtrar cash_movements apenas dos agendamentos deste colaborador
  let filteredCashMovements = cashMovementsData || [];
  if (collaboratorId && appointmentsData) {
    const collaboratorAppointmentIds = new Set(appointmentsData.map(a => a.id));
    filteredCashMovements = (cashMovementsData || []).filter((cm: any) => 
      cm.appointment_id && collaboratorAppointmentIds.has(cm.appointment_id)
    );
  }

  // 3. Fetch appointment services for popular services calculation and service-level commission
  const completedAppointmentIds = appointmentsData.filter(a => a.status === 'concluido').map(a => a.id);
  
  let serviceCounts: { [serviceId: string]: number } = {};
  let serviceDetails: { [serviceId: string]: { name: string, price: number } } = {};
  let appointmentServiceDetails: { [appointmentId: string]: { serviceId: string, servicePrice: number, appointmentDate: string }[] } = {}; // Adicionado appointmentDate

  if (completedAppointmentIds.length > 0) {
    const { data: appServicesData, error: asError } = await supabase
      .from('appointment_services')
      .select(`service_id, appointments(id, collaborator_id, appointment_date), services(name, price)`) // Selecionar appointment_date
      .in('appointment_id', completedAppointmentIds);

    if (asError) throw asError;

    appServicesData.forEach((as: any) => {
      const serviceId = as.service_id;
      const appointmentId = as.appointments.id;
      const serviceName = as.services?.name || 'Serviço Desconhecido';
      const servicePrice = as.services?.price || 0;
      const appointmentDate = as.appointments.appointment_date; // Obter a data do agendamento

      serviceCounts[serviceId] = (serviceCounts[serviceId] || 0) + 1;
      serviceDetails[serviceId] = { name: serviceName, price: servicePrice };

      if (!appointmentServiceDetails[appointmentId]) {
        appointmentServiceDetails[appointmentId] = [];
      }
      appointmentServiceDetails[appointmentId].push({ serviceId, servicePrice, appointmentDate }); // Incluir appointmentDate
    });
  }

  const allServiceNames = Array.from(new Set(Object.values(serviceDetails).map(s => s.name))); // Coletar todos os nomes de serviços

  // --- Calculations ---

  // Revenue (usar filteredCashMovements se foi filtrado por colaborador)
  const totalRevenue = filteredCashMovements.reduce((sum: number, cm: any) => {
    const amount = parseFloat(cm.total_amount) || 0;
    return sum + amount;
  }, 0);

  // Completed Appointments
  const completedAppointments = appointmentsData.filter(a => a.status === 'concluido');
  const completedAppointmentsCount = completedAppointments.length;

  // Average Ticket
  const averageTicket = completedAppointmentsCount > 0 ? totalRevenue / completedAppointmentsCount : 0;

  // Clients Served (Unique client IDs in completed appointments)
  const uniqueClientsServed = new Set(completedAppointments.map(a => a.client_id)).size;

  // Cancellations
  const cancellationsCount = appointmentsData.filter(a => a.status === 'cancelado').length;

  // Collaborator Performance (Appointments Count and Revenue)
  const collabPerformanceMap = new Map<string, { appointments: number, revenue: number, commission: number }>();
  const serviceCommissionsByCollaborator: { [collaboratorId: string]: ServiceCommissionDetail[] } = {};

  // 4. Buscar comissões reais de cash_movements (transaction_type = 'despesa' e appointment_id não null)
  console.log('[DEBUG Relatório] Buscando comissões:', {
    companyId,
    startDateDb,
    endDateDb,
    transaction_type: 'despesa',
  });

  const { data: commissionMovements, error: commissionError } = await supabase
    .from('cash_movements')
    .select(`
      id,
      appointment_id,
      total_amount,
      transaction_date,
      appointments!inner(
        id,
        collaborator_id,
        appointment_date,
        appointment_services(
          service_id,
          services(name, price)
        )
      )
    `)
    .eq('company_id', companyId)
    .eq('transaction_type', 'despesa')
    .not('appointment_id', 'is', null)
    .gte('transaction_date', startDateTimeDb)
    .lte('transaction_date', endDateTimeDb);

  // DEBUG: Log do resultado da busca
  console.log('[DEBUG Relatório] Resultado da busca de comissões:', {
    count: commissionMovements?.length || 0,
    data: commissionMovements,
    error: commissionError,
  });

  if (commissionError) {
    console.error('[DEBUG Relatório] Erro ao buscar comissões:', commissionError);
    throw commissionError;
  }

  // Processar comissões reais
  if (commissionMovements && commissionMovements.length > 0) {
    console.log('[DEBUG Relatório] Processando', commissionMovements.length, 'comissões encontradas');
    
    commissionMovements.forEach((cm: any) => {
      const appointment = cm.appointments;
      if (!appointment || !appointment.collaborator_id) {
        console.warn('[DEBUG Relatório] Comissão sem appointment ou collaborator_id:', cm);
        return;
      }

      const collabId = appointment.collaborator_id;
      const appointmentDate = appointment.appointment_date || cm.transaction_date;
      const totalCommission = parseFloat(cm.total_amount) || 0;

      console.log('[DEBUG Relatório] Processando comissão:', {
        cash_movement_id: cm.id,
        appointment_id: cm.appointment_id,
        collaborator_id: collabId,
        total_amount: totalCommission,
        appointment_date: appointmentDate,
      });

      // Inicializar mapas se necessário
      if (!collabPerformanceMap.has(collabId)) {
        collabPerformanceMap.set(collabId, { appointments: 0, revenue: 0, commission: 0 });
      }
      if (!serviceCommissionsByCollaborator[collabId]) {
        serviceCommissionsByCollaborator[collabId] = [];
      }

      // Atualizar comissão total do colaborador
      const collabMetrics = collabPerformanceMap.get(collabId)!;
      collabMetrics.commission += totalCommission;

      // Distribuir comissão proporcionalmente entre os serviços do agendamento
      const appointmentServices = appointment.appointment_services || [];
      if (appointmentServices.length > 0) {
        // Calcular total de preços dos serviços para distribuição proporcional
        const totalServicePrice = appointmentServices.reduce((sum: number, as: any) => {
          const servicePrice = as.services?.price || serviceDetails[as.service_id]?.price || 0;
          return sum + servicePrice;
        }, 0);

        // Distribuir comissão proporcionalmente
        appointmentServices.forEach((as: any) => {
          const serviceId = as.service_id;
          const serviceName = as.services?.name || serviceDetails[serviceId]?.name || 'Serviço Desconhecido';
          const servicePrice = as.services?.price || serviceDetails[serviceId]?.price || 0;
          
          // Calcular comissão proporcional ao preço do serviço
          const serviceCommission = totalServicePrice > 0 
            ? (totalCommission * servicePrice) / totalServicePrice 
            : totalCommission / appointmentServices.length;

          if (serviceCommission > 0) {
            serviceCommissionsByCollaborator[collabId].push({
              serviceId: serviceId,
              serviceName: serviceName,
              commission: serviceCommission,
              appointmentDate: appointmentDate,
            });
          }
        });
      }
    });
  }

  // Processar agendamentos para contagem e receita
  completedAppointments.forEach(app => {
    const collabId = app.collaborator_id;
    if (!collabId) return; // Skip if no collaborator

    const current = collabPerformanceMap.get(collabId) || { appointments: 0, revenue: 0, commission: 0 };
    current.appointments += 1;
    current.revenue += parseFloat(app.total_price as any) || 0;
    collabPerformanceMap.set(collabId, current);
  });

  return {
    totalRevenue,
    completedAppointmentsCount,
    averageTicket,
    uniqueClientsServed,
    cancellationsCount,
    collabPerformanceMap,
    serviceCounts,
    serviceDetails,
    serviceCommissionsByCollaborator,
    allServiceNames, // Retornar todos os nomes de serviços únicos
  };
}


export function useReportsData(dateRangeKey: DateRangeKey = 'current_month') {
  const { session } = useSession();
  const { primaryCompanyId, loadingPrimaryCompany } = usePrimaryCompany();
  const { isCollaborator } = useIsCollaborator();
  const [reportsData, setReportsData] = useState<ReportsData>(initialReportsData);
  const [loading, setLoading] = useState(true);
  const [collaborators, setCollaborators] = useState<CollaboratorPerformance[]>([]);
  const [currentCollaboratorId, setCurrentCollaboratorId] = useState<string | null>(null);

  // Buscar collaborator_id se o usuário for colaborador
  useEffect(() => {
    const fetchCollaboratorId = async () => {
      if (!session?.user || !isCollaborator) {
        setCurrentCollaboratorId(null);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('collaborators')
          .select('id')
          .eq('user_id', session.user.id)
          .eq('is_arena_system_placeholder', false)
          .limit(1)
          .maybeSingle();

        if (error && error.code !== 'PGRST116') {
          console.warn('useReportsData: Erro ao buscar collaborator_id:', error);
        } else if (data) {
          setCurrentCollaboratorId(data.id);
        }
      } catch (error) {
        console.error('useReportsData: Erro ao buscar collaborator_id:', error);
      }
    };

    fetchCollaboratorId();
  }, [session?.user, isCollaborator]);

  const fetchReports = useCallback(async () => {
    if (!primaryCompanyId || !session?.user) {
      setReportsData(initialReportsData);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const currentRange = getDateRange(dateRangeKey);
      const previousRange = getPreviousDateRange(currentRange);

      // Se for colaborador, usar collaboratorId para filtrar dados
      const collaboratorId = isCollaborator ? currentCollaboratorId : undefined;

      // Fetch data for current period
      const currentMetrics = await fetchMetrics(primaryCompanyId, currentRange, collaboratorId || undefined);
      
      // Fetch data for previous period
      const previousMetrics = await fetchMetrics(primaryCompanyId, previousRange, collaboratorId || undefined);

      // --- KPI Calculations ---
      
      const revenue = calculateComparison(currentMetrics.totalRevenue, previousMetrics.totalRevenue);
      const averageTicket = calculateComparison(currentMetrics.averageTicket, previousMetrics.averageTicket, currentMetrics.averageTicket < previousMetrics.averageTicket);
      const clientsServed = calculateComparison(currentMetrics.uniqueClientsServed, previousMetrics.uniqueClientsServed);
      
      // Cancellations comparison is inverse (lower is better, so positive change means fewer cancellations)
      const cancellations = calculateComparison(currentMetrics.cancellationsCount, previousMetrics.cancellationsCount, true);

      // --- Collaborator Performance ---
      // Se for colaborador, não mostrar performance de outros colaboradores
      // (apenas mostrar seus próprios dados)
      let collaboratorPerformance: CollaboratorPerformance[] = [];
      
      if (isCollaborator && currentCollaboratorId) {
        // Para colaborador, não buscar lista de colaboradores
        setCollaborators([]);
        collaboratorPerformance = [];
      } else {
        // Fetch collaborator names and commission rates (apenas para proprietários/admins)
        const { data: collabNames, error: collabNamesError } = await supabase
          .from('collaborators')
          .select('id, first_name, last_name, commission_percentage')
          .eq('company_id', primaryCompanyId)
          .eq('is_arena_system_placeholder', false);

        if (collabNamesError) throw collabNamesError;

        // Buscar comissões do período para obter os IDs e verificar pagamentos
        const { startDateDb, endDateDb } = currentRange;
        const startDateTimeDb = `${startDateDb}T00:00:00`;
        const endDateTimeDb = `${endDateDb}T23:59:59`;
        
        const { data: commissionMovementsForPayments, error: commissionPaymentsError } = await supabase
          .from('cash_movements')
          .select('id, appointments!inner(collaborator_id)')
          .eq('company_id', primaryCompanyId)
          .eq('transaction_type', 'despesa')
          .not('appointment_id', 'is', null)
          .gte('transaction_date', startDateTimeDb)
          .lte('transaction_date', endDateTimeDb);

        if (commissionPaymentsError) {
          console.warn('[useReportsData] Erro ao buscar comissões para verificar pagamentos:', commissionPaymentsError);
        }

        // Buscar pagamentos realizados para essas comissões
        let paymentsMap = new Map<string, number>();
        if (commissionMovementsForPayments && commissionMovementsForPayments.length > 0) {
          const commissionCashMovementIds = commissionMovementsForPayments.map((cm: any) => cm.id);
          
          const { data: paymentsData, error: paymentsError } = await supabase
            .from('commission_payments')
            .select('cash_movement_id, amount_paid, collaborator_id')
            .in('cash_movement_id', commissionCashMovementIds)
            .eq('company_id', primaryCompanyId);

          if (paymentsError) {
            console.warn('[useReportsData] Erro ao buscar pagamentos de comissões:', paymentsError);
          } else if (paymentsData) {
            // Agrupar pagamentos por colaborador
            paymentsData.forEach((payment: any) => {
              const collabId = payment.collaborator_id;
              const currentPaid = paymentsMap.get(collabId) || 0;
              paymentsMap.set(collabId, currentPaid + parseFloat(payment.amount_paid));
            });
          }
        }

        collaboratorPerformance = collabNames
          .map(collab => {
            const metrics = currentMetrics.collabPerformanceMap.get(collab.id) || { appointments: 0, revenue: 0, commission: 0 };
            const totalCommission = metrics.commission || 0;
            const paidAmount = paymentsMap.get(collab.id) || 0;
            const pendingAmount = totalCommission - paidAmount;
            
            return {
              id: collab.id,
              name: `${collab.first_name} ${collab.last_name}`,
              appointments: metrics.appointments,
              revenue: metrics.revenue,
              commission: totalCommission, // Total gerado
              paid_amount: paidAmount, // Valor já pago
              pending_amount: pendingAmount, // Valor pendente
            };
          })
          .filter(collab => collab.commission > 0) // Filtrar apenas colaboradores com comissão > 0
          .sort((a, b) => b.commission - a.commission); // Sort by commission descending

        setCollaborators(collaboratorPerformance);
      }

      // --- Popular Services ---
      const totalServicesSold = Object.values(currentMetrics.serviceCounts).reduce((sum, count) => sum + count, 0);
      
      const popularServices: PopularService[] = Object.entries(currentMetrics.serviceCounts)
        .map(([serviceId, quantity]) => {
          const name = currentMetrics.serviceDetails[serviceId]?.name || 'Serviço Desconhecido';
          const percentual = totalServicesSold > 0 ? (quantity / totalServicesSold) * 100 : 0;
          return {
            service: name,
            quantity,
            percentual: Math.round(percentual),
          };
        })
        .sort((a, b) => b.quantity - a.quantity);

      setReportsData({
        revenue,
        averageTicket,
        clientsServed,
        cancellations,
        collaboratorPerformance,
        popularServices,
        serviceCommissionsByCollaborator: currentMetrics.serviceCommissionsByCollaborator,
        allServiceNames: currentMetrics.allServiceNames, // Incluir todos os nomes de serviços
      });

    } catch (error: any) {
      console.error('Error fetching reports:', error);
      showError('Erro ao gerar relatórios: ' + error.message);
      setReportsData(initialReportsData);
    } finally {
      setLoading(false);
    }
  }, [primaryCompanyId, session?.user, dateRangeKey, isCollaborator, currentCollaboratorId]);

  useEffect(() => {
    if (!loadingPrimaryCompany) {
      fetchReports();
    }
  }, [loadingPrimaryCompany, fetchReports]);

  return { reportsData, loading, collaborators, fetchReports };
}