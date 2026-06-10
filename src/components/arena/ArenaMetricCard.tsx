import React from 'react';
import { cn } from '@/lib/utils';
import { arenaMetricLabelClass, arenaMetricValueClass } from './arenaPageStyles';

interface ArenaMetricCardProps {
  label: string;
  value: React.ReactNode;
  labelClassName?: string;
  valueClassName?: string;
  className?: string;
  onClick?: () => void;
}

/**
 * Card de métrica no estilo Relatórios (rótulo sm + valor 2xl).
 */
const ArenaMetricCard: React.FC<ArenaMetricCardProps> = ({
  label,
  value,
  labelClassName,
  valueClassName,
  className,
  onClick,
}) => {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'rounded-lg border p-4 text-center w-full transition-colors',
        onClick && 'cursor-pointer hover:opacity-90',
        className,
      )}
    >
      <p className={cn(arenaMetricLabelClass, labelClassName)}>{label}</p>
      <p className={cn(arenaMetricValueClass, valueClassName)}>{value}</p>
    </Tag>
  );
};

export default ArenaMetricCard;
