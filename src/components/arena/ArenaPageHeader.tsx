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
    <div className="min-w-0 space-y-3">
      <h1 className="text-xl font-bold text-gray-900 dark:text-white sm:text-2xl">{title}</h1>
      {actions ? <div className="w-full min-w-0 max-w-full">{actions}</div> : null}
    </div>
  );
};

export default ArenaPageHeader;
