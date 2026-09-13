import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';
import { usePrimaryCompany } from './usePrimaryCompany';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Notification {
  id: string;
  type: 'PENDING_APPOINTMENT' | 'CANCELLED_APPOINTMENT';
  message: string;
  date: string;
  is_read: boolean;
  appointment_id: string;
}

// Helper function to safely parse date strings
const safeParseDate = (dateString: string | null | undefined): Date => {
    if (dateString) {
        try {
            return parseISO(dateString);
        } catch (e) {
            console.error("Failed to parse date:", dateString, e);
        }
    }
    // Fallback to current date if parsing fails or string is null/undefined
    return new Date(); 
};


export function useNotifications() {
  const { session } = useSession();
  const { primaryCompanyId, loadingPrimaryCompany } = usePrimaryCompany();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!primaryCompanyId || !session?.user || loadingPrimaryCompany) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data: recentApps, error: appsError } = await supabase
        .from('appointments')
        .select(`
          id,
          appointment_date,
          appointment_time,
          status,
          created_at,
          client_nickname,
          clients(name),
          collaborators(first_name)
        `)
        .eq('company_id', primaryCompanyId)
        .in('status', ['pendente', 'cancelado'])
        .order('created_at', { ascending: false })
        .limit(20);

      if (appsError) throw appsError;

      const pendingApps = (recentApps || []).filter((app) => app.status === 'pendente').slice(0, 10);
      const cancelledApps = (recentApps || []).filter((app) => app.status === 'cancelado').slice(0, 10);

      const allNotifications: Notification[] = [];

      // Process Pending Notifications
      pendingApps.forEach(app => {
        // Ensure required date fields are present
        if (!app.appointment_date || !app.created_at) return; 
        
        const clientName = app.client_nickname || app.clients?.name || 'Cliente';
        const collabName = app.collaborators?.first_name || 'Colaborador';
        const dateFormatted = format(safeParseDate(app.appointment_date), 'dd/MM/yyyy', { locale: ptBR });
        
        allNotifications.push({
          id: `pending-${app.id}`,
          type: 'PENDING_APPOINTMENT',
          message: `Novo agendamento de ${clientName} com ${collabName} em ${dateFormatted} às ${app.appointment_time.substring(0, 5)}.`,
          date: app.created_at,
          is_read: false,
          appointment_id: app.id,
        });
      });

      // Process Cancelled Notifications
      cancelledApps.forEach(app => {
        // Ensure required date fields are present
        if (!app.appointment_date || !app.created_at) return; 

        const clientName = app.client_nickname || app.clients?.name || 'Cliente';
        const collabName = app.collaborators?.first_name || 'Colaborador';
        const dateFormatted = format(safeParseDate(app.appointment_date), 'dd/MM/yyyy', { locale: ptBR });

        allNotifications.push({
          id: `cancelled-${app.id}`,
          type: 'CANCELLED_APPOINTMENT',
          message: `Agendamento de ${clientName} com ${collabName} em ${dateFormatted} foi CANCELADO.`,
          date: app.created_at,
          is_read: false,
          appointment_id: app.id,
        });
      });
      
      // Sort by date (most recent first)
      allNotifications.sort((a, b) => safeParseDate(b.date).getTime() - safeParseDate(a.date).getTime());

      setNotifications(allNotifications);
      setUnreadCount(allNotifications.length);

    } catch (error: any) {
      console.error('Error fetching notifications:', error);
      showError('Erro ao carregar notificações: ' + error.message);
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, [primaryCompanyId, session?.user, loadingPrimaryCompany]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Placeholder for marking as read (not fully implemented in DB yet, just clears the count locally)
  const markAllAsRead = () => {
    setUnreadCount(0);
    // In a real app, this would update a 'notifications' table in Supabase
  };

  return { notifications, unreadCount, loading, fetchNotifications, markAllAsRead };
}