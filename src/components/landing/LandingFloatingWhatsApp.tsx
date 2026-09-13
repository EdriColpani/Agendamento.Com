import React from 'react';
import { MessageCircle } from 'lucide-react';
import { LANDING_WHATSAPP_URL } from '@/data/landingPageContent';

export const LandingFloatingWhatsApp: React.FC = () => (
  <a
    href={LANDING_WHATSAPP_URL}
    target="_blank"
    rel="noopener noreferrer"
    aria-label="Conversar pelo WhatsApp"
    className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition-transform hover:scale-105 hover:bg-[#20bd5a]"
  >
    <MessageCircle className="h-7 w-7" />
  </a>
);

export default LandingFloatingWhatsApp;
