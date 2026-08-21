import React from 'react';
import { Link } from 'react-router-dom';
import BrandLogo from './BrandLogo';

interface BrandHeaderProps {
  to: string;
  titleClassName?: string;
  logoClassName?: string;
  fullLogoClassName?: string;
  showFullLogoOnDesktop?: boolean;
  /** Exibe a logo oficial (PNG) no lugar da SVG — landing/home. */
  officialLogo?: boolean;
  /** Classe da logo oficial. Padrão: cabe na altura original do header (h-10). */
  officialLogoClassName?: string;
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
  officialLogo = false,
  // Mesma altura do header original — não aumenta a barra nem corta a arte.
  officialLogoClassName = 'h-10 max-h-10 w-auto max-w-[220px] shrink-0 object-contain',
  subtitle,
  onClick,
}) => {
  return (
    <Link to={to} className="flex min-w-0 items-center gap-2 sm:gap-3 cursor-pointer" onClick={onClick}>
      {showFullLogoOnDesktop ? (
        officialLogo ? (
          <BrandLogo variant="full" official className={officialLogoClassName} />
        ) : (
          <>
            <BrandLogo className={`${logoClassName} md:hidden`} />
            <BrandLogo variant="full" className={`${fullLogoClassName} hidden md:block`} />
          </>
        )
      ) : (
        <BrandLogo className={logoClassName} official={officialLogo} />
      )}
      {/* Logo oficial já inclui o nome; não repetir "PlanoAgenda" ao lado. */}
      {!officialLogo ? (
        <div className="flex min-w-0 flex-col items-start">
          <h1 className={`${titleClassName} max-w-[9.5rem] truncate sm:max-w-none`}>PlanoAgenda</h1>
          {subtitle ? (
            <span className="mt-0.5 max-w-[11rem] truncate rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold leading-tight text-white sm:max-w-none sm:px-2 sm:text-xs">
              {subtitle}
            </span>
          ) : null}
        </div>
      ) : subtitle ? (
        <span className="mt-0.5 max-w-[11rem] truncate rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold leading-tight text-white sm:max-w-none sm:px-2 sm:text-xs">
          {subtitle}
        </span>
      ) : null}
    </Link>
  );
};

export default BrandHeader;
