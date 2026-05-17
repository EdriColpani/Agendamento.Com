import React from 'react';
import { cn } from '@/lib/utils';

/** Ícone marca (calendário) — fallback quando o asset não carrega. */
export function BrandMarkInline({ className, alt = 'PlanoAgenda' }: { className?: string; alt?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label={alt}
      className={cn('shrink-0', className)}
    >
      <defs>
        <linearGradient id="brandMarkPaBg" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0EA5E9" />
          <stop offset="1" stopColor="#10B981" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="url(#brandMarkPaBg)" />
      <rect x="17" y="20" width="30" height="26" rx="4" fill="white" />
      <rect x="17" y="20" width="30" height="7" rx="4" fill="#E8F6F1" />
      <rect x="22" y="16" width="4" height="8" rx="2" fill="white" />
      <rect x="38" y="16" width="4" height="8" rx="2" fill="white" />
      <circle cx="25" cy="32" r="2" fill="#10B981" />
      <circle cx="32" cy="32" r="2" fill="#10B981" />
      <circle cx="39" cy="32" r="2" fill="#10B981" />
      <circle cx="25" cy="39" r="2" fill="#10B981" />
      <circle cx="32" cy="39" r="2" fill="#10B981" />
    </svg>
  );
}
