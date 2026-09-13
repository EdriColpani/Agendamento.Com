import React from 'react';
import { Link2, CalendarCheck, CheckCircle2 } from 'lucide-react';
import { ARENA_ATHLETE_BOOKING_STEPS } from '@/data/arenaLandingPageContent';

const STEP_ICONS = [Link2, CalendarCheck, CheckCircle2];

export const ArenaAthleteBookingSection: React.FC = () => (
  <section id="como-atleta-reserva" className="border-y border-gray-100 bg-white py-20">
    <div className="container mx-auto px-6">
      <div className="mx-auto mb-12 max-w-3xl text-center">
        <h2 className="text-3xl font-bold text-gray-900 md:text-4xl">
          Como o atleta reserva em 3 passos
        </h2>
        <p className="mt-4 text-lg text-gray-600">
          Simples para quem joga. Profissional para quem gerencia a arena.
        </p>
      </div>
      <ol className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
        {ARENA_ATHLETE_BOOKING_STEPS.map((item, index) => {
          const Icon = STEP_ICONS[index] ?? Link2;
          return (
            <li
              key={item.step}
              className="rounded-2xl border border-gray-200 bg-gray-50 p-6 shadow-sm"
            >
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0066ff] text-sm font-bold text-white">
                  {item.step}
                </span>
                <Icon className="h-6 w-6 text-[#0066ff]" aria-hidden />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-gray-900">{item.title}</h3>
              <p className="text-sm leading-relaxed text-gray-600">{item.description}</p>
            </li>
          );
        })}
      </ol>
    </div>
  </section>
);

export default ArenaAthleteBookingSection;
