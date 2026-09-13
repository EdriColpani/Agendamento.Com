import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Star } from 'lucide-react';
import { ARENA_BRAND, ARENA_TESTIMONIALS } from '@/data/arenaLandingPageContent';

export const ArenaTestimonialsSection: React.FC = () => (
  <section id="depoimentos" className="bg-gradient-to-br from-slate-50 via-white to-teal-50/50 py-20">
    <div className="container mx-auto px-6">
      <div className="mx-auto mb-12 max-w-3xl text-center">
        <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-teal-700">
          Depoimentos
        </p>
        <h2 className="text-3xl font-bold text-gray-900 md:text-4xl">
          Donos de arena que já organizaram a operação
        </h2>
        <p className="mt-4 text-lg text-gray-600">
          Beach tennis, padel, vôlei e complexos esportivos — quem vive de quadra sabe a diferença de um sistema feito
          para isso.
        </p>
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {ARENA_TESTIMONIALS.map((item) => (
          <Card
            key={item.name}
            className="border border-teal-100/80 bg-white shadow-sm transition hover:border-teal-200 hover:shadow-md"
          >
            <CardContent className="flex h-full flex-col p-6">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{ background: ARENA_BRAND.blue }}
                  >
                    {item.initials}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{item.name}</p>
                    <p className="text-xs text-gray-500">
                      {item.role} · {item.city}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-0.5" aria-label={`${item.rating} estrelas`}>
                  {Array.from({ length: item.rating }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
              </div>

              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-teal-700">
                {item.segment}
              </p>
              <p className="flex-1 text-sm leading-relaxed text-gray-600">&ldquo;{item.quote}&rdquo;</p>
              <p className="mt-4 inline-flex w-fit rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
                {item.highlight}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  </section>
);

export default ArenaTestimonialsSection;
