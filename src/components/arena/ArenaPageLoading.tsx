import React from 'react';
import { Loader2 } from 'lucide-react';

interface ArenaPageLoadingProps {
  label?: string;
}

/** Loading local da área de conteúdo — não ocupa a tela inteira nem esconde a sidebar. */
const ArenaPageLoading: React.FC<ArenaPageLoadingProps> = ({ label = 'Carregando...' }) => (
  <div className="flex items-center justify-center py-16">
    <Loader2 className="mr-2 h-5 w-5 animate-spin text-gray-500" />
    <p className="text-gray-700 dark:text-gray-300">{label}</p>
  </div>
);

export default ArenaPageLoading;
