import React from 'react';
import { Link } from 'react-router-dom';
import LoginForm from '@/components/LoginForm';
import {
  Calendar,
  Dumbbell,
  Goal,
  Sparkles,
  Volleyball,
} from 'lucide-react';

/**
 * Imagens do painel esquerdo (opcional).
 * - Coloque arquivos em `public/` (ex.: `/arena/quadra-1.jpg`) e liste o caminho aqui.
 * - Ou use URLs absolutas (https://...).
 * - Se o array estiver vazio, o painel usa só o grid com ícones (como hoje).
 */
export const ARENA_LOGIN_MARKETING_IMAGE_URLS: string[] = [];

const marketingLines = [
  { lead: 'O PlanoAgenda veio para', highlight: 'organizar sua arena' },
  { lead: 'conectando', highlight: 'atletas e reservas' },
  { lead: 'com gestão simples do', highlight: 'seu esporte!' },
];

/** Paleta de teste (logo PlanoAgenda): azul vivo → teal; marinho para textos. */
const brand = {
  navy: '#0c2340',
  blue: '#0066ff',
  teal: '#10b981',
  tealDark: '#059669',
} as const;

const ArenaLoginPage: React.FC = () => {
  const images = ARENA_LOGIN_MARKETING_IMAGE_URLS.filter(Boolean);
  const fallbackIcons = [Volleyball, Goal, Dumbbell, Sparkles] as const;

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#0c2340]">
      {/* Painel marketing — gradiente marca (azul → teal), alinhado ao logo PlanoAgenda */}
      <aside
        className="relative flex min-h-[220px] flex-1 flex-col justify-between overflow-hidden px-6 py-8 text-white md:min-h-screen md:max-w-[50%] md:px-10 md:py-12"
        style={{
          background: `linear-gradient(145deg, ${brand.blue} 0%, #0d9488 45%, ${brand.teal} 100%)`,
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />

        <div className="relative z-10 space-y-6">
          <div className="flex items-center gap-2 text-white/95">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 backdrop-blur-sm">
              <Calendar className="h-5 w-5" aria-hidden />
            </div>
            <span className="text-lg font-semibold tracking-tight drop-shadow-sm">
              PlanoAgenda · Quadras
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {[0, 1, 2, 3].map((i) => {
              const src = images[i];
              const Icon = fallbackIcons[i % fallbackIcons.length];
              return (
                <div
                  key={i}
                  className="relative aspect-[4/3] overflow-hidden rounded-xl border border-white/30 bg-[#0c2340]/25 shadow-lg backdrop-blur-sm"
                >
                  {src ? (
                    <img
                      src={src}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[#0c2340]/20">
                      <Icon className="h-12 w-12 text-white" strokeWidth={1.25} aria-hidden />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="max-w-md space-y-3 text-sm leading-relaxed sm:text-base">
            {marketingLines.map((line, idx) => (
              <p key={idx} className="rounded-lg border border-white/20 bg-[#0c2340]/35 px-3 py-2 backdrop-blur-sm">
                <span className="font-medium text-white/95">{line.lead} </span>
                <span className="font-bold text-white">{line.highlight}</span>
              </p>
            ))}
          </div>
        </div>
      </aside>

      {/* Formulário — mesmo LoginForm de /login; cores só nesta página (seletores abaixo) */}
      <main className="flex flex-1 flex-col items-center justify-center bg-slate-50 px-4 py-10 dark:bg-[#0f172a] md:min-h-screen md:px-8">
        <div className="w-full max-w-md space-y-8">
          <div className="flex flex-col items-center text-center">
            <div
              className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl shadow-md ring-2 ring-white/30"
              style={{
                background: `linear-gradient(135deg, ${brand.blue}, ${brand.teal})`,
              }}
            >
              <Calendar className="h-8 w-8 text-white" aria-hidden />
            </div>
            <h1
              className="font-serif text-2xl font-bold tracking-tight text-[#0c2340] dark:text-white"
              style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
            >
              PlanoAgenda
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Gestão de quadras e reservas — entre com sua conta.
            </p>
          </div>

          <div
            className={[
              'rounded-2xl border border-slate-200/90 bg-white p-6 shadow-md dark:border-slate-600 dark:bg-slate-800/80',
              /* Sobrescreve amarelo do LoginForm só aqui */
              '[&_a]:!text-[#0369a1] [&_a]:hover:!text-[#0055ff] dark:[&_a]:!text-teal-400 dark:[&_a]:hover:!text-teal-300',
              '[&_button[type="submit"]]:!border-0 [&_button[type="submit"]]:!bg-gradient-to-r [&_button[type="submit"]]:!from-[#0066ff] [&_button[type="submit"]]:!to-[#10b981] [&_button[type="submit"]]:!text-white [&_button[type="submit"]]:hover:!opacity-95 [&_button[type="submit"]]:!shadow-md',
            ].join(' ')}
          >
            <LoginForm />
          </div>

          <p className="text-center text-xs text-slate-500 dark:text-slate-500">
            É salão, clínica ou outro agendamento?{' '}
            <Link
              to="/login"
              className="font-medium text-[#0369a1] underline-offset-4 hover:text-[#0055ff] hover:underline dark:text-teal-400 dark:hover:text-teal-300"
            >
              Acesso ao login geral
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
};

export default ArenaLoginPage;
