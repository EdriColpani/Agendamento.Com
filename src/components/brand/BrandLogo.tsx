import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import markSrc from '@/assets/brand/planoagenda-mark.svg';
import fullSrc from '@/assets/brand/planoagenda-logo-pa.svg';
import officialFullSrc from '@/assets/brand/planoagenda-logo-oficial.png';
import { BrandMarkInline } from './BrandMarkInline';

interface BrandLogoProps {
  className?: string;
  variant?: 'mark' | 'full';
  /** Usa a logo oficial (PNG) na variante full — landing/home. */
  official?: boolean;
  alt?: string;
}

const LOGO_SRC = {
  mark: markSrc,
  full: fullSrc,
  officialFull: officialFullSrc,
} as const;

const BrandLogo: React.FC<BrandLogoProps> = ({
  className,
  variant = 'mark',
  official = false,
  alt = 'PlanoAgenda',
}) => {
  const [useInlineFallback, setUseInlineFallback] = useState(false);
  const [srcVariant, setSrcVariant] = useState<'mark' | 'full' | 'officialFull'>(() =>
    official ? 'officialFull' : variant === 'full' ? 'full' : 'mark',
  );

  useEffect(() => {
    setUseInlineFallback(false);
    setSrcVariant(official ? 'officialFull' : variant === 'full' ? 'full' : 'mark');
  }, [variant, official]);

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
        if (srcVariant === 'officialFull' || srcVariant === 'full') {
          setSrcVariant('mark');
          return;
        }
        setUseInlineFallback(true);
      }}
    />
  );
};

export default BrandLogo;
