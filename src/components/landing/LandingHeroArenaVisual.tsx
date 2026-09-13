import React from 'react';
import { CalendarCheck, Trophy, Volleyball } from 'lucide-react';
import { ARENA_BRAND } from '@/data/arenaLandingPageContent';

/** Hero visual Arena: mockup de agenda de quadras + cards flutuantes. */
export const LandingHeroArenaVisual: React.FC = () => (
  <div className="relative mx-auto w-full max-w-[440px] lg:max-w-none lg:mx-0">
    <div
      aria-hidden
      className="pointer-events-none absolute -right-6 top-4 h-64 w-64 rounded-full opacity-40 blur-3xl"
      style={{ background: ARENA_BRAND.blue }}
    />
    <div
      aria-hidden
      className="pointer-events-none absolute -left-8 bottom-16 h-56 w-56 rounded-full opacity-30 blur-3xl"
      style={{ background: ARENA_BRAND.teal }}
    />

    <div className="absolute -left-2 top-6 z-20 hidden rounded-2xl border border-white/30 bg-white/10 px-4 py-3 shadow-xl backdrop-blur-md sm:-left-8 sm:flex sm:items-center sm:gap-3">
      <div
        className="flex h-11 w-11 items-center justify-center rounded-xl text-white"
        style={{ background: `linear-gradient(135deg, ${ARENA_BRAND.blue}, ${ARENA_BRAND.teal})` }}
      >
        <Volleyball className="h-6 w-6" />
      </div>
      <div>
        <p className="text-xs font-medium text-white/80">Quadras ocupadas</p>
        <p className="text-sm font-bold text-white">+ reservas online</p>
      </div>
    </div>

    <div className="absolute -right-2 top-28 z-20 hidden w-[160px] rounded-2xl border border-white/30 bg-white/10 p-3 shadow-xl backdrop-blur-md sm:-right-6 sm:block">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-white">
        <CalendarCheck className="h-3.5 w-3.5" />
        Agenda hoje
      </div>
      <div className="space-y-1.5">
        {[
          { court: 'Quadra 1', time: '18:00', sport: 'Beach' },
          { court: 'Quadra 2', time: '19:30', sport: 'Padel' },
          { court: 'Quadra 3', time: '20:00', sport: 'Vôlei' },
        ].map((slot) => (
          <div
            key={slot.court}
            className="flex items-center justify-between rounded-lg bg-white/15 px-2 py-1.5 text-[10px] font-medium text-white"
          >
            <span>{slot.court}</span>
            <span>{slot.time}</span>
          </div>
        ))}
      </div>
    </div>

    <div className="relative z-10 mx-auto w-[290px] sm:w-[320px] lg:translate-x-2 lg:rotate-[-1deg] lg:transition-transform lg:hover:rotate-0">
      <div
        className="overflow-hidden rounded-3xl border border-white/20 shadow-2xl"
        style={{
          background: `linear-gradient(160deg, ${ARENA_BRAND.navy} 0%, #0d9488 50%, ${ARENA_BRAND.teal} 100%)`,
        }}
      >
        <div className="border-b border-white/15 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/70">Plano Arena</p>
          <p className="text-lg font-bold text-white">Painel da arena</p>
        </div>

        <div className="grid grid-cols-2 gap-2 p-4">
          {[
            { label: 'Reservas hoje', value: '24', color: ARENA_BRAND.blue },
            { label: 'Quadras ativas', value: '6', color: ARENA_BRAND.teal },
            { label: 'Mensalistas', value: '18', color: '#f59e0b' },
            { label: 'Ocupação', value: '87%', color: '#8b5cf6' },
          ].map((metric) => (
            <div
              key={metric.label}
              className="rounded-xl border border-white/15 bg-white/10 p-3 backdrop-blur-sm"
            >
              <p className="text-[10px] font-medium text-white/75">{metric.label}</p>
              <p className="text-2xl font-extrabold text-white">{metric.value}</p>
              <div
                className="mt-2 h-1 rounded-full"
                style={{ background: `${metric.color}99` }}
              />
            </div>
          ))}
        </div>

        <div className="mx-4 mb-4 rounded-xl border border-white/20 bg-white/10 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-white">
            <Trophy className="h-4 w-4 text-amber-300" />
            Próximo torneio
          </div>
          <p className="text-sm font-bold text-white">Copa Beach — Sábado 09:00</p>
          <p className="text-[11px] text-white/75">4 quadras · 32 duplas inscritas</p>
        </div>
      </div>
    </div>

    <div className="absolute -bottom-2 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-teal-300/50 bg-white px-4 py-2 text-xs font-semibold text-[#0c2340] shadow-lg sm:bottom-0">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-500" />
      </span>
      Reserva online · Agenda por quadra
    </div>
  </div>
);

export default LandingHeroArenaVisual;
