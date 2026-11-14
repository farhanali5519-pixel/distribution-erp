'use client';

import React from 'react';
import { ExternalLink } from 'lucide-react';
import {
  ResolveTransactionInput,
  resolveTransactionTarget,
  isNonClickableReference,
} from '@/shared/utils/transaction-navigation-resolver';
import { useTransactionViewer } from '@/shared/context/transaction-viewer-context';
import { DOC_PATTERN_REGEX } from '@/shared/utils/reference';

export interface BusinessReferenceLinkProps {
  businessReference?: string | null;
  entryNumber?: string | null;
  sourceModule?: string | null;
  sourceDocumentId?: string | null;
  journalEntryId?: string | null;
  transactionType?: string | null;
  sourceDocumentType?: string | null;
  companyId?: string;
  className?: string;
  title?: string;
  children?: React.ReactNode;
  showIcon?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

/**
 * Universal Clickable Business Reference Link Component
 *
 * Renders an ERP text-link that opens the underlying source transaction
 * (Purchase Bill, Sales Order, Invoice, Payment, Return, Expense, Stock Adjustment, Journal Voucher).
 *
 * Fallbacks safely to plain text for empty, opening, or unclickable references.
 */
export function BusinessReferenceLink({
  businessReference,
  entryNumber,
  sourceModule,
  sourceDocumentId,
  journalEntryId,
  transactionType,
  sourceDocumentType,
  className = '',
  title,
  children,
  showIcon = true,
  onClick,
}: BusinessReferenceLinkProps) {
  const { openTransaction } = useTransactionViewer();

  const displayText = children || businessReference || entryNumber || '—';

  // Check if non-clickable
  if (
    isNonClickableReference(businessReference) &&
    isNonClickableReference(entryNumber) &&
    !sourceDocumentId &&
    !journalEntryId
  ) {
    return <span className={className}>{displayText}</span>;
  }

  const resolveInput: ResolveTransactionInput = {
    businessReference,
    entryNumber,
    sourceModule,
    sourceDocumentId,
    journalEntryId,
    transactionType,
    sourceDocumentType,
  };

  const target = resolveTransactionTarget(resolveInput);

  if (!target.isClickable) {
    return <span className={className}>{displayText}</span>;
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onClick) {
      onClick(e);
      return;
    }
    openTransaction(resolveInput);
  };

  const linkTitle =
    title ||
    `Click to open ${target.label} ${businessReference || entryNumber || ''}`;

  return (
    <button
      type="button"
      onClick={handleClick}
      title={linkTitle}
      aria-label={linkTitle}
      className={`group/ref inline-flex items-center gap-1 font-mono text-[var(--color-primary,#059669)] hover:underline cursor-pointer focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-[var(--focus-ring,#059669)] rounded-xs py-0.5 px-0.5 font-medium transition-colors print:text-inherit print:no-underline print:p-0 print:border-none print:bg-transparent ${className}`}
    >
      <span>{displayText}</span>
      {showIcon && (
        <ExternalLink
          size={10}
          className="opacity-0 group-hover/ref:opacity-75 transition-opacity shrink-0 print:hidden text-[var(--color-primary,#059669)]"
          aria-hidden="true"
        />
      )}
    </button>
  );
}

// Alias for TransactionReferenceLink
export const TransactionReferenceLink = BusinessReferenceLink;

/**
 * Description with Embedded Reference Parser
 *
 * Scans a narrative string (e.g. "Sale Bill ORD-2026-51614" or "Purchase Bill BILL-202610-0001")
 * and makes ONLY the recognized reference number clickable while keeping surrounding text intact.
 */
export function DescriptionWithReference({
  text,
  sourceModule,
  sourceDocumentId,
  journalEntryId,
  className = '',
}: {
  text: string | null | undefined;
  sourceModule?: string | null;
  sourceDocumentId?: string | null;
  journalEntryId?: string | null;
  className?: string;
}) {
  if (!text) return <span>—</span>;

  // Global document pattern regex to match multiple references if present
  const globalDocRegex = new RegExp(DOC_PATTERN_REGEX.source, 'gi');
  const matches = Array.from(text.matchAll(globalDocRegex));

  if (matches.length === 0) {
    return <span className={className}>{text}</span>;
  }

  const elements: React.ReactNode[] = [];
  let lastIndex = 0;

  matches.forEach((match, idx) => {
    const matchText = match[0];
    const matchIndex = match.index ?? 0;

    // Text preceding the match
    if (matchIndex > lastIndex) {
      elements.push(
        <span key={`text-${idx}`}>{text.substring(lastIndex, matchIndex)}</span>
      );
    }

    // Clickable reference token
    elements.push(
      <BusinessReferenceLink
        key={`ref-${idx}`}
        businessReference={matchText.toUpperCase()}
        sourceDocumentId={sourceDocumentId}
        sourceModule={sourceModule}
        journalEntryId={journalEntryId}
        showIcon={true}
      />
    );

    lastIndex = matchIndex + matchText.length;
  });

  // Remaining trailing text
  if (lastIndex < text.length) {
    elements.push(
      <span key="text-tail">{text.substring(lastIndex)}</span>
    );
  }

  return <span className={className}>{elements}</span>;
}
