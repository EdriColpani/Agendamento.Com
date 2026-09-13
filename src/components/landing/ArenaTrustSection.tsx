import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Clock, Headphones, Shield, TrendingUp } from 'lucide-react';
import { ARENA_STATS, ARENA_TRUST_ITEMS } from '@/data/arenaLandingPageContent';

const TRUST_ICONS = [Clock, Headphones, TrendingUp, Shield];

export const ArenaTrustSection: React.FC = () => (
  <section className="py-20">
    <div className="container mx-auto px-6">
      <div className="mx-auto mb-10 grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3">
        {ARENA_STATS.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-50 to-white px-6 py-5 text-center"
          >
            <p className="text-3xl font-extrabold text-[#0066ff]">{stat.value}</p>
            <p className="mt-1 text-sm font-medium text-gray-700">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="mb-12 text-center">
        <h2 className="text-3xl font-bold text-gray-900 md:text-4xl">Por que escolher o Plano Arena?</h2>
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {ARENA_TRUST_ITEMS.map((item, index) => {
          const Icon = TRUST_ICONS[index] ?? Clock;
          return (
            <Card key={item.title} className="border-2 border-gray-100 text-center shadow-sm">
              <CardContent className="p-6">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#0066ff]/10">
                  <Icon className="h-7 w-7 text-[#0066ff]" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">{item.title}</h3>
                <p className="mt-2 text-sm text-gray-600">{item.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  </section>
);

export default ArenaTrustSection;
