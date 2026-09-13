import React from 'react';
import { Bell, CalendarCheck, MessageCircle, Sparkles } from 'lucide-react';

/**
 * Hero visual: mockup de celular + cards flutuantes (CSS puro, sem assets externos).
 */
export const LandingHeroVisual: React.FC = () => (
  <div className="relative mx-auto w-full max-w-[420px] lg:max-w-none lg:mx-0">
    {/* Blobs de fundo — preenchem o “vazio” visual */}
    <div
      aria-hidden
      className="pointer-events-none absolute -right-8 top-6 h-56 w-56 rounded-full bg-primary/15 blur-3xl"
    />
    <div
      aria-hidden
      className="pointer-events-none absolute -left-6 bottom-12 h-48 w-48 rounded-full bg-emerald-200/40 blur-3xl"
    />

    {/* Card flutuante — estatística */}
    <div className="absolute -left-2 top-8 z-20 hidden rounded-2xl border border-white/80 bg-white/95 px-4 py-3 shadow-xl backdrop-blur-sm sm:-left-6 sm:flex sm:items-center sm:gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
        <Sparkles className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs font-medium text-gray-500">Menos faltas</p>
        <p className="text-sm font-bold text-gray-900">Lembretes automáticos</p>
      </div>
    </div>

    {/* Card flutuante — agenda */}
    <div className="absolute -right-2 top-24 z-20 hidden w-[148px] rounded-2xl border border-white/80 bg-white/95 p-3 shadow-xl backdrop-blur-sm sm:-right-4 sm:block">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-gray-800">
        <CalendarCheck className="h-3.5 w-3.5 text-primary" />
        Agenda hoje
      </div>
      <div className="space-y-1.5">
        {[
          { time: '09:00', label: 'Livre', active: false },
          { time: '10:30', label: 'Maria', active: true },
          { time: '14:00', label: 'João', active: true },
        ].map((slot) => (
          <div
            key={slot.time}
            className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-[10px] ${
              slot.active ? 'bg-primary/15 font-semibold text-gray-900' : 'bg-gray-100 text-gray-500'
            }`}
          >
            <span>{slot.time}</span>
            <span>{slot.label}</span>
          </div>
        ))}
      </div>
    </div>

    {/* Celular */}
    <div className="relative z-10 mx-auto w-[280px] sm:w-[300px] lg:translate-x-4 lg:rotate-[2deg] lg:transition-transform lg:hover:rotate-0">
      <div className="rounded-[2.75rem] border-[10px] border-gray-900 bg-gray-900 p-2 shadow-2xl shadow-gray-900/25 ring-1 ring-gray-800">
        {/* Notch */}
        <div className="mx-auto mb-2 h-6 w-28 rounded-full bg-gray-900" />

        {/* Tela WhatsApp */}
        <div className="overflow-hidden rounded-[2rem] bg-[#e5ddd5]">
          {/* Header WA */}
          <div className="flex items-center gap-3 bg-[#075E54] px-4 py-3 text-white">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-sm font-bold">
              PA
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">PlanoAgenda</p>
              <p className="text-[11px] text-emerald-100">online</p>
            </div>
            <MessageCircle className="h-5 w-5 shrink-0 opacity-80" />
          </div>

          {/* Chat */}
          <div
            className="space-y-3 px-3 py-4"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d4cdc4' fill-opacity='0.35'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          >
            <div className="ml-auto max-w-[88%] rounded-lg rounded-tr-none bg-[#DCF8C6] px-3 py-2 text-[11px] leading-relaxed text-gray-800 shadow-sm">
              Olá <strong>Maria</strong> 👋
              <br />
              Seu horário na <strong>Studio Bella</strong> está confirmado para{' '}
              <strong>sex., 14:30</strong>.
            </div>
            <div className="ml-auto max-w-[88%] rounded-lg rounded-tr-none bg-[#DCF8C6] px-3 py-2 text-[11px] leading-relaxed text-gray-800 shadow-sm">
              Lembrete: amanhã às <strong>14:30</strong>. Te esperamos! ✨
            </div>
            <div className="max-w-[75%] rounded-lg rounded-tl-none bg-white px-3 py-2 text-[11px] text-gray-800 shadow-sm">
              Obrigada! Confirmado 😊
            </div>
            <div className="flex items-center justify-center gap-1 pt-1 text-[10px] text-gray-500">
              <Bell className="h-3 w-3" />
              Enviado automaticamente pelo PlanoAgenda
            </div>
          </div>
        </div>
      </div>

      {/* Home indicator */}
      <div className="mx-auto mt-2 h-1 w-24 rounded-full bg-gray-300" />
    </div>

    {/* Badge inferior */}
    <div className="absolute -bottom-2 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-2 text-xs font-semibold text-emerald-800 shadow-lg sm:bottom-0">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      Agendamento 24h · WhatsApp automático
    </div>
  </div>
);

export default LandingHeroVisual;
