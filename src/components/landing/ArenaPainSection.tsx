import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ARENA_PAIN_POINTS } from '@/data/arenaLandingPageContent';

export const ArenaPainSection: React.FC = () => (
  <section className="bg-gray-50 py-20">
    <div className="container mx-auto px-6">
      <div className="mx-auto mb-12 max-w-3xl text-center">
        <h2 className="text-3xl font-bold text-gray-900 md:text-4xl">
          Sem sistema, sua arena perde dinheiro todo dia
        </h2>
        <p className="mt-4 text-lg text-gray-600">
          WhatsApp, planilha e caderninho parecem funcionar — até você ver quantos horários ficam vazios e quanto
          tempo a equipe gasta confirmando reserva.
        </p>
      </div>
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
        {ARENA_PAIN_POINTS.map((item) => (
          <Card key={item.title} className="border border-gray-200 shadow-sm">
            <CardContent className="p-6">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-lg text-red-600">
                ✖
              </div>
              <h3 className="text-lg font-semibold text-gray-900">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">{item.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  </section>
);

export default ArenaPainSection;
