import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { isArenaNavItemActive } from './arenaNavConfig';

/** Altura e raio únicos para botões da barra do módulo arena. */
export const arenaToolbarBtnClass = 'h-9 rounded-full px-4 text-sm';

/** Padrão visual único: fundo primário (verde/teal), texto branco, borda branca — use em toda a barra arena. */
export const arenaToolbarSolidClass =
  'border-2 border-white bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:text-primary-foreground';

/** Destaque do item ativo (mesmas cores; anel para indicar rota atual). */
const navPillActive =
  'font-semibold shadow-md ring-2 ring-white ring-offset-2 ring-offset-background';

const backButtonClass = cn(arenaToolbarSolidClass, 'justify-start');

interface ArenaToolbarProps {
  /** Voltar: link ou ação (ex.: dashboard). */
  back?: { to?: string; onClick?: () => void; label: string };
  /** Links do sub-menu (destaque no item da rota atual). */
  links: { to: string; label: string }[];
  /** Ex.: botão Atualizar */
  trailing?: React.ReactNode;
  className?: string;
}

/**
 * Barra do módulo quadras: fundo primário (verde), texto branco e borda branca em todos os botões;
 * o item da rota atual recebe anel de foco extra.
 */
const ArenaToolbar: React.FC<ArenaToolbarProps> = ({ back, links, trailing, className }) => {
  const location = useLocation();
  const pathname = location.pathname;

  return (
    <div className={cn('flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center', className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
        {back ? (
          <Button
            variant="default"
            size="sm"
            className={cn(arenaToolbarBtnClass, backButtonClass, 'w-full sm:w-auto')}
            {...(back.to
              ? { asChild: true }
              : { type: 'button' as const, onClick: back.onClick })}
          >
            {back.to ? (
              <Link to={back.to}>
                <ArrowLeft className="mr-2 h-4 w-4 shrink-0" aria-hidden />
                {back.label}
              </Link>
            ) : (
              <>
                <ArrowLeft className="mr-2 h-4 w-4 shrink-0" aria-hidden />
                {back.label}
              </>
            )}
          </Button>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {links.map((item) => {
            const active = isArenaNavItemActive(pathname, item.to);
            return (
              <Button
                key={item.to}
                variant="default"
                size="sm"
                className={cn(
                  arenaToolbarBtnClass,
                  arenaToolbarSolidClass,
                  'w-full sm:w-auto sm:min-w-0 transition-all',
                  active ? navPillActive : '',
                )}
                asChild
              >
                <Link to={item.to}>{item.label}</Link>
              </Button>
            );
          })}
        </div>
      </div>

      {trailing ? <div className="flex flex-wrap gap-2 sm:ml-auto">{trailing}</div> : null}
    </div>
  );
};

export default ArenaToolbar;
