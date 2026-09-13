import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { LANDING_SEGMENTS } from '@/data/landingPageContent';

export const LandingSegmentsSection: React.FC = () => (
  <section id="depoimentos" className="py-20 bg-gray-50">
    <div className="container mx-auto px-6">
      <div className="text-center mb-12">
        <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
          Feito para o seu tipo de negócio
        </h2>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Salões, barbearias, profissionais autônomos e arenas — o PlanoAgenda adapta-se ao seu segmento.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
        {LANDING_SEGMENTS.map((item) => (
          <Card key={item.segment} className="border border-gray-200 shadow-sm hover:border-primary/40 transition-colors">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-gray-900">
                  {item.initials}
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">{item.segment}</h3>
                  <p className="text-xs font-medium text-primary">{item.highlight}</p>
                </div>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">&ldquo;{item.quote}&rdquo;</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  </section>
);

export default LandingSegmentsSection;
