const PACOTES = { to: '/quadras/pacotes-mensais', label: 'Pacotes mensais' } as const;

/** Navegação principal do módulo (sem pacotes mensais — útil quando o plano não libera). */
export const ARENA_MODULE_LINKS_CORE: { to: string; label: string }[] = [
  { to: '/quadras/horarios', label: 'Horários de funcionamento' },
  { to: '/quadras/agenda', label: 'Agenda do dia' },
  { to: '/quadras/precos', label: 'Preços por horário' },
  { to: '/quadras/reservas', label: 'Lista de reservas' },
];

/** Inclui pacotes mensais (ex.: listagem de quadras quando o recurso está ativo). */
export function getArenaModuleLinks(includePacotes: boolean): { to: string; label: string }[] {
  return includePacotes ? [...ARENA_MODULE_LINKS_CORE, PACOTES] : [...ARENA_MODULE_LINKS_CORE];
}

function stripTrailingSlash(p: string): string {
  return p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
}

export function isArenaNavItemActive(pathname: string, linkTo: string): boolean {
  const p = stripTrailingSlash(pathname);
  const to = stripTrailingSlash(linkTo);
  if (to === '/quadras') {
    return p === '/quadras';
  }
  return p === to || p.startsWith(`${to}/`);
}
