import React from 'react';

interface ArenaPageHeaderProps {
  title: string;
  actions?: React.ReactNode;
}

/**
 * Cabeçalho padrão do módulo Arena.
 * Mantém título e ações com comportamento consistente em mobile/desktop.
 */
const ArenaPageHeader: React.FC<ArenaPageHeaderProps> = ({ title, actions }) => {
  return (
    <div className="space-y-2">
      {actions ? <div className="flex flex-wrap items-center gap-2 sm:gap-4">{actions}</div> : null}
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{title}</h1>
    </div>
  );
};

export default ArenaPageHeader;
