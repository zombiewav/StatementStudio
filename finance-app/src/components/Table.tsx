import React from 'react';
import { tableClass, tableContainerClass, tableHeadRowClass, tableBodyRowClass } from './themePrimitives';

export function TableContainer({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className={`${tableContainerClass}${className ? ` ${className}` : ''}`}>{children}</div>
  );
}

export function Table({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return <table className={`${tableClass}${className ? ` ${className}` : ''}`}>{children}</table>;
}

export function TableHeadRow({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <tr className={`${tableHeadRowClass} ${className ? className : ''}`}>{children}</tr>
  );
}

export function TableBodyRow({
  className,
  children,
  onClick,
}: {
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}): React.ReactElement {
  return (
    <tr className={`${tableBodyRowClass}${className ? ` ${className}` : ''}`} onClick={onClick}>
      {children}
    </tr>
  );
}

