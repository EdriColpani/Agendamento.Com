import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Check, Clock, Tag, Zap } from 'lucide-react';
import type { LandingPlanWithMenus } from '@/hooks/useLandingPlansWithMenus';

type LandingPlansSectionProps = {
  plansWithMenus: LandingPlanWithMenus[];
  loading: boolean;
  trialEnabled?: boolean;
  trialDays?: number;
  onPlanSignup: (planId: string) => void;
  planSignupLabel: string;
  sectionTitle?: string;
  sectionSubtitle?: string;
  emptyMessage?: string;
  accentClassName?: string;
  featuredBadgeLabel?: string;
};

function buildFeaturesList(plan: LandingPlanWithMenus): string[] {
  const limits = plan.limits ?? {};
  let featuresToShow: string[] = [];

  if (plan.features.length > 0) {
    featuresToShow = plan.features.map((feature) => {
      if (feature.includes('{collaborators}') || feature.toLowerCase().includes('colaborador')) {
        if (limits.collaborators === 0) return 'Colaboradores ilimitados';
        if (limits.collaborators !== undefined && limits.collaborators > 0) {
          return `Até ${limits.collaborators} Colaborador${limits.collaborators > 1 ? 'es' : ''}`;
        }
      }
      if (feature.includes('{services}') || feature.toLowerCase().includes('serviço')) {
        if (limits.services === 0) return 'Serviços ilimitados';
        if (limits.services !== undefined && limits.services > 0) {
          return `Até ${limits.services} Serviço${limits.services > 1 ? 's' : ''}`;
        }
      }
      return feature;
    });
  } else if (plan.menus.length > 0) {
    featuresToShow = plan.menus.map((menu) => menu.label || menu.menu_key);
  }

  return featuresToShow;
}

export const LandingPlansSection: React.FC<LandingPlansSectionProps> = ({
  plansWithMenus,
  loading,
  trialEnabled = false,
  trialDays = 15,
  onPlanSignup,
  planSignupLabel,
  sectionTitle = 'Planos que cabem no seu negócio',
  sectionSubtitle,
  emptyMessage = 'Nenhum plano disponível no momento.',
  accentClassName = 'text-primary',
  featuredBadgeLabel = 'MAIS POPULAR',
}) => {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');

  const highestPricedPlan = plansWithMenus.reduce(
    (max, plan) => (plan.price > max.price ? plan : max),
    plansWithMenus[0] ?? { price: -1, id: '' },
  );

  const defaultSubtitle =
    sectionSubtitle ??
    (trialEnabled
      ? `Teste grátis por ${trialDays} dias, sem cartão. Escolha o plano e cadastre sua empresa.`
      : 'Escolha o plano ideal e cadastre sua empresa em poucos minutos.');

  return (
    <section id="plans-section" className="py-20 bg-white">
      <div className="container mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">{sectionTitle}</h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">{defaultSubtitle}</p>

          <div className="flex items-center justify-center mt-8">
            <ToggleGroup
              type="single"
              value={billingPeriod}
              onValueChange={(value) => {
                if (value === 'monthly' || value === 'yearly') setBillingPeriod(value);
              }}
              className="border border-gray-300 rounded-lg p-1"
            >
              <ToggleGroupItem
                value="monthly"
                aria-label="Mensal"
                className={`px-4 py-2 rounded-md ${billingPeriod === 'monthly' ? 'bg-primary text-primary-foreground' : 'bg-transparent text-gray-600'}`}
              >
                Mensal
              </ToggleGroupItem>
              <ToggleGroupItem
                value="yearly"
                aria-label="Anual"
                className={`px-4 py-2 rounded-md ${billingPeriod === 'yearly' ? 'bg-primary text-primary-foreground' : 'bg-transparent text-gray-600'}`}
              >
                Anual
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {billingPeriod === 'yearly' && (
            <div className="bg-green-50 border-2 border-green-500 rounded-lg p-4 max-w-2xl mx-auto mt-6">
              <div className="flex items-center gap-2 justify-center">
                <div className="bg-green-500 text-white rounded-full p-1">
                  <Tag className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-bold text-green-900">Desconto de 15% no Plano Anual!</p>
                  <p className="text-xs text-green-700 mt-1">
                    Economize ao pagar 12 meses de uma vez.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <p className="text-center text-gray-600">Carregando planos...</p>
        ) : plansWithMenus.length === 0 ? (
          <p className="text-center text-gray-600">{emptyMessage}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {plansWithMenus.map((plan) => {
              const isFeatured = plan.id === highestPricedPlan.id;
              const yearlyBasePrice = plan.price * 12;
              const basePrice =
                billingPeriod === 'yearly'
                  ? Math.round(yearlyBasePrice * 0.85 * 100) / 100
                  : plan.price;
              const priceWithoutYearlyDiscount =
                billingPeriod === 'yearly' ? yearlyBasePrice : plan.price;
              const displayDuration = billingPeriod === 'yearly' ? 12 : 1;
              const yearlySavings =
                billingPeriod === 'yearly'
                  ? Math.round((yearlyBasePrice - basePrice) * 100) / 100
                  : 0;
              const featuresToShow = buildFeaturesList(plan);

              return (
                <Card
                  key={plan.id}
                  className={
                    isFeatured
                      ? 'relative border-4 border-primary shadow-2xl scale-105'
                      : 'border-2 border-gray-200 hover:border-primary transition-all shadow-lg'
                  }
                >
                  {isFeatured && (
                    <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full shadow-md flex items-center gap-1">
                      <Zap className="h-3 w-3" /> {featuredBadgeLabel}
                    </div>
                  )}
                  <CardHeader className="text-center pt-8">
                    <CardTitle className={`text-3xl font-bold text-gray-900 ${accentClassName}`}>
                      {plan.name}
                    </CardTitle>
                    <div className="mt-4">
                      {billingPeriod === 'yearly' && (
                        <p className="text-lg font-semibold text-gray-400 line-through mb-1">
                          R$ {priceWithoutYearlyDiscount.toFixed(2).replace('.', ',')}
                        </p>
                      )}
                      <p className={`text-5xl font-extrabold ${accentClassName}`}>
                        R$ {basePrice.toFixed(2).replace('.', ',')}
                      </p>
                      <p className="text-base text-gray-500">
                        /{displayDuration} {displayDuration > 1 ? 'meses' : 'mês'}
                        {billingPeriod === 'yearly' && yearlySavings > 0 && (
                          <span className="block text-xs text-green-600 font-semibold mt-1">
                            Economize R$ {yearlySavings.toFixed(2).replace('.', ',')} com 15% de desconto!
                          </span>
                        )}
                      </p>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {plan.description && (
                      <p className="text-center text-gray-600">{plan.description}</p>
                    )}
                    {plan.name.toLowerCase().includes('platinum') && (
                      <div className="flex items-center justify-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                        <Clock className="h-4 w-4 text-blue-600" />
                        <span className="text-sm font-medium text-blue-900">Suporte em horário comercial</span>
                      </div>
                    )}
                    {featuresToShow.length > 0 ? (
                      <ul className="space-y-2 text-sm text-gray-700">
                        {featuresToShow.map((feature) => (
                          <li key={feature} className="flex items-center gap-2">
                            <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-gray-500 text-center">
                        Nenhum módulo configurado para este plano.
                      </p>
                    )}
                    <Button
                      className="!rounded-button whitespace-nowrap w-full font-semibold py-2.5 text-base bg-primary text-primary-foreground hover:bg-primary/90"
                      onClick={() => onPlanSignup(plan.id)}
                    >
                      {planSignupLabel}
                    </Button>
                    {trialEnabled && (
                      <p className="text-center text-xs text-gray-500">
                        Sem cartão · preço acima vale após o teste grátis
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default LandingPlansSection;
