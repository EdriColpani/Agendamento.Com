import React from 'react';
import { Link } from 'react-router-dom';
import BrandLogo from './BrandLogo';

interface BrandHeaderProps {
  to: string;
  titleClassName?: string;
  logoClassName?: string;
  fullLogoClassName?: string;
  showFullLogoOnDesktop?: boolean;
  subtitle?: string;
  onClick?: () => void;
}

/** Bloco de marca reutilizável para manter logo/nome consistentes. */
const BrandHeader: React.FC<BrandHeaderProps> = ({
  to,
  titleClassName = 'text-xl font-bold text-gray-900',
  logoClassName = 'h-10 w-10 shrink-0',
  fullLogoClassName = 'h-10 w-auto max-w-[140px] shrink-0',
  showFullLogoOnDesktop = false,
  subtitle,
  onClick,
}) => {
  return (
    <Link to={to} className="flex min-w-0 items-center gap-2 sm:gap-3 cursor-pointer" onClick={onClick}>
      {showFullLogoOnDesktop ? (
        <>
          <BrandLogo className={`${logoClassName} md:hidden`} />
          <BrandLogo variant="full" className={`${fullLogoClassName} hidden md:block`} />
        </>
      ) : (
        <BrandLogo className={logoClassName} />
      )}
      <div className="flex min-w-0 flex-col items-start">
        <h1 className={`${titleClassName} max-w-[9.5rem] truncate sm:max-w-none`}>PlanoAgenda</h1>
        {subtitle ? (
          <span className="mt-0.5 max-w-[11rem] truncate rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold leading-tight text-white sm:max-w-none sm:px-2 sm:text-xs">
            {subtitle}
          </span>
        ) : null}
      </div>
    </Link>
  );
};

export default BrandHeader;
