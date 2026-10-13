import React from 'react';

interface LogoMarkProps {
  className?: string;
}

/** The ledger mark: a statement page with three balanced lines. Uses currentColor. */
export function LogoMark({ className = 'h-8 w-8' }: LogoMarkProps): React.ReactElement {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="36" height="36" rx="9" stroke="currentColor" strokeWidth="2" />
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M11 14h18" />
        <path d="M11 20h12" />
        <path d="M11 26h16" />
      </g>
    </svg>
  );
}
