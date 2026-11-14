'use client';

import React, { forwardRef } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'success'
  | 'danger'
  | 'danger-outline'
  | 'warning'
  | 'info';

export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  isLoading?: boolean;
  loadingText?: string;
  icon?: React.ReactNode;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
  href?: string;
  external?: boolean;
  target?: string;
  rel?: string;
}

export interface IconButtonProps extends Omit<ButtonProps, 'icon' | 'leftIcon' | 'rightIcon' | 'loadingText'> {
  icon: React.ReactNode;
  'aria-label': string;
  title?: string;
}

/**
 * Maps semantic variant to global design system class names
 */
function getVariantClass(variant: ButtonVariant = 'primary'): string {
  switch (variant) {
    case 'primary':
      return 'btn-primary';
    case 'secondary':
      return 'btn-secondary';
    case 'outline':
      return 'btn-outline';
    case 'ghost':
      return 'btn-ghost';
    case 'success':
      return 'btn-success';
    case 'danger':
      return 'btn-danger';
    case 'danger-outline':
      return 'btn-danger-outline';
    case 'warning':
      return 'btn-warning';
    case 'info':
      return 'btn-info';
    default:
      return 'btn-primary';
  }
}

/**
 * Maps size to global design system size classes
 */
function getSizeClass(size: ButtonSize = 'md'): string {
  switch (size) {
    case 'xs':
      return 'btn-xs';
    case 'sm':
      return 'btn-sm';
    case 'md':
      return 'btn-md';
    case 'lg':
      return 'btn-lg';
    case 'icon':
      return 'btn-icon';
    default:
      return 'btn-md';
  }
}

/**
 * SaleFlow Unified Semantic Button Component
 * Reusable across all Tenant ERP modules and Super Admin.
 * Strictly adheres to the SaleFlow design system tokens and WCAG contrast/focus standards.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    isLoading = false,
    loadingText,
    icon,
    leftIcon,
    rightIcon,
    fullWidth = false,
    disabled = false,
    className = '',
    children,
    href,
    external = false,
    target,
    rel,
    type = 'button',
    ...rest
  },
  ref
) {
  const isSpinning = loading || isLoading;
  const isDisabled = disabled || isSpinning;
  const leadIcon = icon || leftIcon;
  const variantClass = getVariantClass(variant);
  const sizeClass = getSizeClass(size);
  const widthClass = fullWidth ? 'w-full' : '';

  const combinedClasses = `btn ${variantClass} ${sizeClass} ${widthClass} ${className}`.trim();

  // Content rendering with spinner and icon placement
  const content = (
    <>
      {isSpinning ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden="true" />
      ) : leadIcon ? (
        <span className="inline-flex shrink-0 items-center justify-center pointer-events-none" aria-hidden="true">
          {leadIcon}
        </span>
      ) : null}

      {isSpinning && loadingText ? (
        <span>{loadingText}</span>
      ) : children ? (
        <span>{children}</span>
      ) : null}

      {!isSpinning && rightIcon ? (
        <span className="inline-flex shrink-0 items-center justify-center pointer-events-none" aria-hidden="true">
          {rightIcon}
        </span>
      ) : null}
    </>
  );

  // If href is specified, render as a Next.js Link with button appearance
  if (href && !isDisabled) {
    const linkTarget = external ? '_blank' : target;
    const linkRel = external ? 'noopener noreferrer' : rel;

    return (
      <Link
        href={href}
        target={linkTarget}
        rel={linkRel}
        className={combinedClasses}
        aria-disabled={isDisabled ? 'true' : undefined}
      >
        {content}
      </Link>
    );
  }

  // If href but disabled, render non-navigating styled element
  if (href && isDisabled) {
    return (
      <span
        className={`${combinedClasses} opacity-50 cursor-not-allowed`}
        aria-disabled="true"
        role="link"
      >
        {content}
      </span>
    );
  }

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading ? 'true' : undefined}
      className={combinedClasses}
      {...rest}
    >
      {content}
    </button>
  );
});

/**
 * Standardized Accessible Icon Button
 * Automatically applies icon size, enforces aria-label & title
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    icon,
    size = 'icon',
    variant = 'ghost',
    'aria-label': ariaLabel,
    title,
    className = '',
    ...rest
  },
  ref
) {
  return (
    <Button
      ref={ref}
      size={size}
      variant={variant}
      aria-label={ariaLabel}
      title={title || ariaLabel}
      className={`btn-icon ${className}`.trim()}
      {...rest}
    >
      {icon}
    </Button>
  );
});

export default Button;
