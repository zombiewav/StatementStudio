import React from 'react';
import { sectionClass } from './themePrimitives';

export function Section({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return <div className={`${sectionClass}${className ? ` ${className}` : ''}`}>{children}</div>;
}

