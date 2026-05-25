import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import LoginForm from '@/components/LoginForm';
import {
  Dumbbell,
  Goal,
  Sparkles,
  Volleyball,
} from 'lucide-react';
import { fetchArenaLoginMarketingPublic } from '@/services/arenaLoginMarketingService';
import BrandLogo from '@/components/brand/BrandLogo';
import planoArenaLogo from '@/assets/brand/plano-arena-logo.png';
import {
  ARENA_REGISTER_PROFESSIONAL_URL,
  persistArenaRegistrationIntent,
} from '@/utils/arenaRegistration';

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
  const [slotUrls, setSlotUrls] = useState<(string | null)[]>([null, null, null, null]);
  const fallbackIcons = [Volleyball, Goal, Dumbbell, Sparkles] as const;
  /** Slots cuja imagem falhou ao carregar — mostra ícone em vez de ícone quebrado. */
  const [imgFailed, setImgFailed] = useState<Record<number, true>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const row = await fetchArenaLoginMarketingPublic();
      if (cancelled || !row) return;
      setSlotUrls([row.image_url_1, row.image_url_2, row.image_url_3, row.image_url_4]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setImgFailed({});
  }, [slotUrls]);

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
            <div className="rounded-lg bg-white/20 p-1 backdrop-blur-sm">
              <BrandLogo className="h-8 w-8" alt="PlanoAgenda" />
            </div>
            <span className="text-lg font-semibold tracking-tight drop-shadow-sm">
              PlanoAgenda · Quadras
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {[0, 1, 2, 3].map((i) => {
              const src = slotUrls[i];
              const Icon = fallbackIcons[i % fallbackIcons.length];
              return (
                <div
                  key={i}
                  className="relative aspect-[4/3] overflow-hidden rounded-xl border border-white/30 bg-[#0c2340]/25 shadow-lg backdrop-blur-sm"
                >
                  {src && !imgFailed[i] ? (
                    <img
                      src={src}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                      onError={() => setImgFailed((prev) => ({ ...prev, [i]: true }))}
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
            <img
              src={planoArenaLogo}
              alt="Plano Arena — Sistema de agendamento de quadras"
              className="mb-4 w-full max-w-[300px] h-auto object-contain"
              loading="eager"
              decoding="async"
            />
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Gestão de quadras e reservas — entre com sua conta.
            </p>
          </div>

          <Link
            to={ARENA_REGISTER_PROFESSIONAL_URL}
            onClick={persistArenaRegistrationIntent}
            className="group block w-full rounded-2xl border border-teal-200/80 bg-gradient-to-br from-teal-50 via-white to-emerald-50 px-5 py-4 text-center shadow-sm transition hover:border-teal-300 hover:shadow-md dark:border-teal-800 dark:from-teal-950/40 dark:via-slate-900 dark:to-emerald-950/30"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">
              Planos a partir de
            </p>
            <p className="mt-1 text-3xl font-extrabold tracking-tight text-[#0c2340] dark:text-white">
              R$ 69,90
              <span className="text-base font-medium text-slate-600 dark:text-slate-400">/mês</span>
            </p>
            <p className="mt-2 text-sm font-medium text-teal-700 group-hover:underline dark:text-teal-300">
              Cadastre sua arena →
            </p>
          </Link>

          <div
            className={[
              'rounded-2xl border border-slate-200/90 bg-white p-6 shadow-md dark:border-slate-600 dark:bg-slate-800/80',
              '[&_a]:!text-[#0369a1] [&_a]:hover:!text-[#0055ff] dark:[&_a]:!text-teal-400 dark:[&_a]:hover:!text-teal-300',
              '[&_button[type="submit"]]:!border-0 [&_button[type="submit"]]:!bg-gradient-to-r [&_button[type="submit"]]:!from-[#0066ff] [&_button[type="submit"]]:!to-[#10b981] [&_button[type="submit"]]:!text-white [&_button[type="submit"]]:hover:!opacity-95 [&_button[type="submit"]]:!shadow-md',
            ].join(' ')}
          >
            <LoginForm signupTo={ARENA_REGISTER_PROFESSIONAL_URL} />
          </div>
        </div>
      </main>
    </div>
  );
};

export default ArenaLoginPage;
