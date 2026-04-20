import React, { useEffect, useMemo, useState } from 'react';

interface BrandLogoProps {
  className?: string;
  variant?: 'mark' | 'full';
  alt?: string;
}

const BrandLogo: React.FC<BrandLogoProps> = ({
  className,
  variant = 'mark',
  alt = 'PlanoAgenda',
}) => {
  const [attempt, setAttempt] = useState<'full' | 'mark' | 'fallback'>(variant === 'full' ? 'full' : 'mark');

  useEffect(() => {
    setAttempt(variant === 'full' ? 'full' : 'mark');
  }, [variant]);

  const src = useMemo(() => {
    if (attempt === 'full') {
      return '/brand/planoagenda-logo-pa.svg';
    }
    if (attempt === 'mark') {
      return '/brand/planoagenda-mark.svg';
    }
    return null;
  }, [attempt]);

  if (attempt === 'fallback') {
    return (
      <div
        role="img"
        aria-label={alt}
        className={[
          'inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-emerald-500',
          'text-xs font-bold text-white',
          className || '',
        ].join(' ')}
      >
        PA
      </div>
    );
  }

  return (
    <img
      src={src || undefined}
      alt={alt}
      className={className}
      loading="eager"
      decoding="async"
      onError={() => {
        setAttempt((current) => {
          if (current === 'full') return 'mark';
          if (current === 'mark') return 'fallback';
          return 'fallback';
        });
      }}
    />
  );
};

export default BrandLogo;
