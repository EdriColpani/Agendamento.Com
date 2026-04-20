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
  logoClassName = 'h-10 w-10',
  fullLogoClassName = 'h-10 w-auto',
  showFullLogoOnDesktop = false,
  subtitle,
  onClick,
}) => {
  return (
    <Link to={to} className="flex items-center gap-3 cursor-pointer" onClick={onClick}>
      {showFullLogoOnDesktop ? (
        <>
          <BrandLogo className={`${logoClassName} md:hidden`} />
          <BrandLogo variant="full" className={`${fullLogoClassName} hidden md:block`} />
        </>
      ) : (
        <BrandLogo className={logoClassName} />
      )}
      <div className="flex flex-col items-start">
        <h1 className={titleClassName}>PlanoAgenda</h1>
        {subtitle ? (
          <span className="mt-0.5 rounded bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">
            {subtitle}
          </span>
        ) : null}
      </div>
    </Link>
  );
};

export default BrandHeader;
