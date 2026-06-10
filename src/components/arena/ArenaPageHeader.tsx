import React from 'react';
import { arenaPageTitleClass } from './arenaPageStyles';

interface ArenaPageHeaderProps {
  title: string;
  actions?: React.ReactNode;
}

/**
 * Cabeçalho do módulo arena — mesmo peso visual de Relatórios / Dashboard.
 */
const ArenaPageHeader: React.FC<ArenaPageHeaderProps> = ({ title, actions }) => {
  return (
    <div className="flex flex-col gap-4 min-w-0">
      <h1 className={arenaPageTitleClass}>{title}</h1>
      {actions ? <div className="w-full min-w-0 max-w-full">{actions}</div> : null}
    </div>
  );
};

export default ArenaPageHeader;
