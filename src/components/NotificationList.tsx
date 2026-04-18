import React from 'react';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Clock, CheckCircle, AlertTriangle, Calendar, XCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

interface Notification {
  id: string;
  type: 'PENDING_APPOINTMENT' | 'CANCELLED_APPOINTMENT';
  message: string;
  date: string;
  is_read: boolean;
  appointment_id: string;
}

interface NotificationListProps {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  markAllAsRead: () => void;
}

const NotificationList: React.FC<NotificationListProps> = ({ notifications, unreadCount, loading, markAllAsRead }) => {
  const navigate = useNavigate();

  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'PENDING_APPOINTMENT':
        return <Clock className="h-4 w-4 text-primary" />;
      case 'CANCELLED_APPOINTMENT':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-gray-600" />;
    }
  };

  const handleNotificationClick = (appointmentId: string) => {
    // Navigate to the edit appointment page for action
    navigate(`/agendamentos/edit/${appointmentId}`);
    // Optionally mark as read here if we had a DB implementation
  };

  return (
    <DropdownMenuContent align="end" className="w-80 p-0">
      <DropdownMenuLabel className="flex justify-between items-center p-3">
        <span className="font-bold text-lg">Notificações</span>
        {unreadCount > 0 && (
          <Button 
            variant="link" 
            size="sm" 
            onClick={markAllAsRead}
            className="text-xs text-blue-600 hover:text-blue-700 p-0 h-auto"
          >
            Marcar todas como lidas
          </Button>
        )}
      </DropdownMenuLabel>
      <DropdownMenuSeparator className="m-0" />
      
      <ScrollArea className="h-[300px]">
        {loading ? (
          <div className="p-4 text-center text-gray-600">
            <i className="fas fa-spinner fa-spin mr-2"></i> Carregando...
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-4 text-center text-gray-600">
            <CheckCircle className="h-6 w-6 mx-auto mb-2 text-green-500" />
            Nenhuma notificação recente.
          </div>
        ) : (
          notifications.map((notification) => (
            <DropdownMenuItem 
              key={notification.id} 
              className="flex items-start gap-3 p-3 cursor-pointer hover:bg-gray-50"
              onClick={() => handleNotificationClick(notification.appointment_id)}
            >
              <div className="flex-shrink-0 mt-1">
                {getIcon(notification.type)}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900 leading-snug">{notification.message}</p>
                <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {format(parseISO(notification.date), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                </p>
              </div>
            </DropdownMenuItem>
          ))
        )}
      </ScrollArea>
    </DropdownMenuContent>
  );
};

export default NotificationList;