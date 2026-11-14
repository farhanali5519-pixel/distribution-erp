'use client';

import React, { useEffect, useRef } from 'react';

export interface IndeterminateCheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function IndeterminateCheckbox({
  checked,
  indeterminate = false,
  onChange,
  disabled = false,
  title,
  className = '',
  style = {},
}: IndeterminateCheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = !checked && indeterminate;
    }
  }, [checked, indeterminate]);

  return (
    <input
      type="checkbox"
      ref={ref}
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      title={title}
      className={`form-checkbox cursor-pointer rounded border-slate-300 text-primary focus:ring-primary ${className}`}
      style={{
        width: '16px',
        height: '16px',
        accentColor: 'var(--primary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        verticalAlign: 'middle',
        ...style,
      }}
    />
  );
}
