import React, { useMemo } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { buildLandingFaq, type LandingFaqItem } from '@/data/landingPageContent';

type LandingFaqSectionProps = {
  trialEnabled?: boolean;
  trialDays?: number;
  faqItems?: LandingFaqItem[];
};

export const LandingFaqSection: React.FC<LandingFaqSectionProps> = ({
  trialEnabled = false,
  trialDays = 15,
  faqItems,
}) => {
  const resolvedFaqItems = useMemo(
    () => faqItems ?? buildLandingFaq(trialDays, trialEnabled),
    [faqItems, trialDays, trialEnabled],
  );

  return (
    <section id="faq-section" className="py-20 bg-white">
      <div className="container mx-auto px-6 max-w-3xl">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">Perguntas frequentes</h2>
          <p className="text-gray-600">
            {trialEnabled
              ? `Teste grátis de ${trialDays} dias, sem cartão — veja as respostas antes de cadastrar.`
              : 'Respostas rápidas antes de você cadastrar sua empresa.'}
          </p>
        </div>
        <Accordion type="single" collapsible className="w-full">
          {resolvedFaqItems.map((item, index) => (
            <AccordionItem key={item.question} value={`faq-${index}`}>
              <AccordionTrigger className="text-left font-medium text-gray-900">
                {item.question}
              </AccordionTrigger>
              <AccordionContent className="text-gray-600 leading-relaxed">
                {item.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
};

export default LandingFaqSection;
