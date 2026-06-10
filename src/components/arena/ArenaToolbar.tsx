import React, { useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { isArenaNavItemActive } from './arenaNavConfig';
import { arenaTouchButtonClass } from './arenaPageStyles';

export const arenaToolbarBtnClass = 'h-10 rounded-full px-4 text-sm sm:h-9';

export const arenaToolbarSolidClass =
  'border-2 border-white bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:text-primary-foreground';

const navPillActive =
  'font-semibold shadow-md ring-2 ring-white ring-offset-2 ring-offset-background';

const backButtonClass = cn(arenaToolbarSolidClass, 'justify-start');

const navLinkBtnClass = cn(
  arenaToolbarBtnClass,
  arenaToolbarSolidClass,
  'shrink-0 whitespace-nowrap px-4 transition-all sm:h-auto sm:min-h-9 sm:whitespace-normal sm:px-4 sm:py-2.5 sm:text-center sm:leading-snug',
);

interface ArenaToolbarProps {
  back?: { to?: string; onClick?: () => void; label: string };
  links: { to: string; label: string }[];
  trailing?: React.ReactNode;
  className?: string;
}

/**
 * Navegação do módulo quadras.
 * Mobile: voltar + select (legível, uma linha) — padrão Relatórios.
 * Desktop: pills horizontais.
 */
const ArenaToolbar: React.FC<ArenaToolbarProps> = ({ back, links, trailing, className }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname;

  const activeLink = useMemo(
    () => links.find((item) => isArenaNavItemActive(pathname, item.to))?.to ?? links[0]?.to ?? '',
    [links, pathname],
  );

  return (
    <div className={cn('w-full min-w-0 space-y-3', className)}>
      {/* Mobile */}
      <div className="flex flex-col gap-3 md:hidden">
        {back ? (
          <Button
            variant="default"
            className={cn(arenaToolbarBtnClass, backButtonClass, arenaTouchButtonClass, 'w-full')}
            {...(back.to ? { asChild: true } : { type: 'button' as const, onClick: back.onClick })}
          >
            {back.to ? (
              <Link to={back.to}>
                <ArrowLeft className="mr-2 h-5 w-5 shrink-0" aria-hidden />
                {back.label}
              </Link>
            ) : (
              <>
                <ArrowLeft className="mr-2 h-5 w-5 shrink-0" aria-hidden />
                {back.label}
              </>
            )}
          </Button>
        ) : null}

        <Select value={activeLink} onValueChange={(to) => navigate(to)}>
          <SelectTrigger className={cn('w-full', arenaTouchButtonClass)}>
            <SelectValue placeholder="Seção do módulo" />
          </SelectTrigger>
          <SelectContent>
            {links.map((item) => (
              <SelectItem key={item.to} value={item.to} className="text-base">
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {trailing ? <div className="w-full">{trailing}</div> : null}
      </div>

      {/* Desktop */}
      <div className="hidden md:flex md:flex-wrap md:items-center md:gap-2">
        {back ? (
          <Button
            variant="default"
            size="sm"
            className={cn(arenaToolbarBtnClass, backButtonClass, 'shrink-0')}
            {...(back.to ? { asChild: true } : { type: 'button' as const, onClick: back.onClick })}
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

        {links.map((item) => {
          const active = isArenaNavItemActive(pathname, item.to);
          return (
            <Button
              key={item.to}
              variant="default"
              size="sm"
              className={cn(navLinkBtnClass, active ? navPillActive : '')}
              asChild
            >
              <Link to={item.to}>{item.label}</Link>
            </Button>
          );
        })}

        {trailing ? <div className="ml-auto flex flex-wrap gap-2">{trailing}</div> : null}
      </div>
    </div>
  );
};

export default ArenaToolbar;
