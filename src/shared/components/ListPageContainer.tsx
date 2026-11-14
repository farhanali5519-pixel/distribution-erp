'use client';

import React from 'react';

export interface ListPageContainerProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function ListPageContainer({
  children,
  className = '',
  style = {},
}: ListPageContainerProps) {
  return (
    <div
      className={`list-page-container w-full max-w-none ${className}`}
      style={{
        width: '100%',
        maxWidth: 'none',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
