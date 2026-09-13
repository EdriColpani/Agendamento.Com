import React from 'react';
import { Link } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Sparkles } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

export type TrialBannerVariant = 'info' | 'warning' | 'critical';

interface TrialBannerProps {
  trialDaysRemaining: number | null;
  endDate: string | null;
  className?: string;
}

function resolveVariant(days: number | null): TrialBannerVariant {
  if (days === null || days <= 0) return 'critical';
  if (days <= 1) return 'critical';
  if (days <= 3) return 'warning';
  return 'info';
}

const VARIANT_STYLES: Record<
  TrialBannerVariant,
  { alert: string; icon: string; title: string; description: string }
> = {
  info: {
    alert: 'border-emerald-300 bg-emerald-50 text-emerald-950',
    icon: 'text-emerald-600',
    title: 'text-emerald-900',
    description: 'text-emerald-900/90',
  },
  warning: {
    alert: 'border-amber-400 bg-amber-50 text-amber-950',
    icon: 'text-amber-700',
    title: 'text-amber-900',
    description: 'text-amber-900/90',
  },
  critical: {
    alert: 'border-red-400 bg-red-50 text-red-950',
    icon: 'text-red-600',
    title: 'text-red-900',
    description: 'text-red-900/90',
  },
};

function formatDaysLabel(days: number | null): string {
  if (days === null) return 'em breve';
  if (days <= 0) return 'hoje';
  if (days === 1) return '1 dia';
  return `${days} dias`;
}

const TrialBanner: React.FC<TrialBannerProps> = ({ trialDaysRemaining, endDate, className }) => {
  const variant = resolveVariant(trialDaysRemaining);
  const styles = VARIANT_STYLES[variant];
  const daysLabel = formatDaysLabel(trialDaysRemaining);
  const endLabel = endDate
    ? format(parseISO(endDate), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
    : null;

  const Icon = variant === 'info' ? Sparkles : AlertTriangle;

  return (
    <Alert className={cn('mb-6', styles.alert, className)}>
      <Icon className={cn('h-4 w-4', styles.icon)} />
      <AlertTitle className={styles.title}>
        {variant === 'critical'
          ? 'Seu teste grátis termina hoje'
          : `Seu teste grátis termina em ${daysLabel}`}
      </AlertTitle>
      <AlertDescription className={styles.description}>
        {variant === 'critical' ? (
          <>
            Último dia para experimentar o PlanoAgenda sem cobrança.
            {endLabel ? <> O teste encerra em <strong>{endLabel}</strong>.</> : null}{' '}
            <Link to="/planos" className="font-semibold underline underline-offset-2">
              Assinar agora
            </Link>{' '}
            para não perder o acesso.
          </>
        ) : variant === 'warning' ? (
          <>
            Faltam <strong>{daysLabel}</strong> do seu período de teste.
            {endLabel ? <> Término previsto: <strong>{endLabel}</strong>.</> : null}{' '}
            <Link to="/planos" className="font-semibold underline underline-offset-2">
              Assinar agora
            </Link>{' '}
            e continue usando sem interrupção.
          </>
        ) : (
          <>
            Você está no teste grátis — ainda restam <strong>{daysLabel}</strong>.
            {endLabel ? <> Válido até <strong>{endLabel}</strong>.</> : null}{' '}
            Quando quiser,{' '}
            <Link to="/planos" className="font-semibold underline underline-offset-2">
              escolha seu plano
            </Link>{' '}
            e converta para assinatura paga.
          </>
        )}
      </AlertDescription>
    </Alert>
  );
};

export default TrialBanner;
