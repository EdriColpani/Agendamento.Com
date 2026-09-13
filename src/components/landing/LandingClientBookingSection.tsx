import React from 'react';
import { Link2, CalendarCheck, MessageSquare } from 'lucide-react';
import { LANDING_CLIENT_BOOKING_STEPS } from '@/data/landingPageContent';

const STEP_ICONS = [Link2, CalendarCheck, MessageSquare];

export const LandingClientBookingSection: React.FC = () => (
  <section id="como-cliente-agenda" className="py-20 bg-white border-y border-gray-100">
    <div className="container mx-auto px-6">
      <div className="text-center mb-12 max-w-3xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
          Como seu cliente agenda em 3 passos
        </h2>
        <p className="text-lg text-gray-600">
          Simples para quem marca horário. Profissional para quem gerencia o negócio.
        </p>
      </div>
      <ol className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
        {LANDING_CLIENT_BOOKING_STEPS.map((item, index) => {
          const Icon = STEP_ICONS[index] ?? Link2;
          return (
            <li
              key={item.step}
              className="relative rounded-2xl border border-gray-200 bg-gray-50 p-6 shadow-sm"
            >
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {item.step}
                </span>
                <Icon className="h-6 w-6 text-primary" aria-hidden />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{item.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{item.description}</p>
            </li>
          );
        })}
      </ol>
    </div>
  </section>
);

export default LandingClientBookingSection;
