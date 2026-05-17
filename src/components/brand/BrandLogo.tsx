import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import markSrc from '@/assets/brand/planoagenda-mark.svg';
import fullSrc from '@/assets/brand/planoagenda-logo-pa.svg';
import { BrandMarkInline } from './BrandMarkInline';

interface BrandLogoProps {
  className?: string;
  variant?: 'mark' | 'full';
  alt?: string;
}

const LOGO_SRC = {
  mark: markSrc,
  full: fullSrc,
} as const;

const BrandLogo: React.FC<BrandLogoProps> = ({
  className,
  variant = 'mark',
  alt = 'PlanoAgenda',
}) => {
  const [useInlineFallback, setUseInlineFallback] = useState(false);
  const [srcVariant, setSrcVariant] = useState<'mark' | 'full'>(variant === 'full' ? 'full' : 'mark');

  useEffect(() => {
    setUseInlineFallback(false);
    setSrcVariant(variant === 'full' ? 'full' : 'mark');
  }, [variant]);

  const imgClassName = cn('shrink-0 object-contain', className);

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
        if (srcVariant === 'full') {
          setSrcVariant('mark');
          return;
        }
        setUseInlineFallback(true);
      }}
    />
  );
};

export default BrandLogo;
