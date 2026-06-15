import React from 'react';
import { cardClass } from './themePrimitives';

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return <div className={`${cardClass}${className ? ` ${className}` : ''}`}>{children}</div>;
}

