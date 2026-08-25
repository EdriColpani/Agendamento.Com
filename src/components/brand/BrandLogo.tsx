import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import markSrc from '@/assets/brand/planoagenda-mark.svg';
import officialMarkSrc from '@/assets/brand/planoagenda-mark-oficial.png';
import fullSrc from '@/assets/brand/planoagenda-logo-pa.svg';
import officialFullSrc from '@/assets/brand/planoagenda-logo-oficial.png';
import { BrandMarkInline } from './BrandMarkInline';

interface BrandLogoProps {
  className?: string;
  variant?: 'mark' | 'full';
  /** Usa a logo oficial completa (PNG) — landing/home. */
  official?: boolean;
  /** Usa o ícone oficial (PNG) no lugar do mark SVG. */
  officialMark?: boolean;
  alt?: string;
}

const LOGO_SRC = {
  mark: markSrc,
  officialMark: officialMarkSrc,
  full: fullSrc,
  officialFull: officialFullSrc,
} as const;

type LogoSrcKey = keyof typeof LOGO_SRC;

const resolveSrc = (
  variant: 'mark' | 'full',
  official: boolean,
  officialMark: boolean,
): LogoSrcKey => {
  if (official) return 'officialFull';
  if (officialMark) return 'officialMark';
  return variant === 'full' ? 'full' : 'mark';
};

const BrandLogo: React.FC<BrandLogoProps> = ({
  className,
  variant = 'mark',
  official = false,
  officialMark = false,
  alt = 'PlanoAgenda',
}) => {
  const [useInlineFallback, setUseInlineFallback] = useState(false);
  const [srcVariant, setSrcVariant] = useState<LogoSrcKey>(() =>
    resolveSrc(variant, official, officialMark),
  );

  useEffect(() => {
    setUseInlineFallback(false);
    setSrcVariant(resolveSrc(variant, official, officialMark));
  }, [variant, official, officialMark]);

  const imgClassName = cn('block shrink-0 object-contain', className);

  if (useInlineFallback) {
    return <BrandMarkInline className={imgClassName} alt={alt} />;
  }

  return (
    <img
      src={LOGO_SRC[srcVariant]}
      alt={alt}
      className={imgClassName}
      loading="eager"
      decoding="async"
      onError={() => {
        if (srcVariant !== 'mark') {
          setSrcVariant('mark');
          return;
        }
        setUseInlineFallback(true);
      }}
    />
  );
};

export default BrandLogo;
