'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import {
  ResolveTransactionInput,
  ResolvedTransactionTarget,
  resolveTransactionTarget,
} from '@/shared/utils/transaction-navigation-resolver';
import { UniversalTransactionModal } from '@/shared/components/UniversalTransactionModal';

interface TransactionViewerContextType {
  openTransaction: (input: ResolveTransactionInput) => void;
  closeTransaction: () => void;
  isOpen: boolean;
  currentTarget: ResolvedTransactionTarget | null;
}

const TransactionViewerContext = createContext<TransactionViewerContextType | null>(null);

export function TransactionViewerProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentTarget, setCurrentTarget] = useState<ResolvedTransactionTarget | null>(null);

  const openTransaction = useCallback((input: ResolveTransactionInput) => {
    const target = resolveTransactionTarget(input);
    if (!target.isClickable) return;

    setCurrentTarget(target);
    setIsOpen(true);
  }, []);

  const closeTransaction = useCallback(() => {
    setIsOpen(false);
    setCurrentTarget(null);
  }, []);

  // Global event listener for saleflow:open-transaction
  useEffect(() => {
    const handleGlobalOpen = (e: Event) => {
      const customEvent = e as CustomEvent<ResolveTransactionInput>;
      if (customEvent.detail) {
        openTransaction(customEvent.detail);
      }
    };

    window.addEventListener('saleflow:open-transaction', handleGlobalOpen);
    return () => {
      window.removeEventListener('saleflow:open-transaction', handleGlobalOpen);
    };
  }, [openTransaction]);

  return (
    <TransactionViewerContext.Provider
      value={{
        openTransaction,
        closeTransaction,
        isOpen,
        currentTarget,
      }}
    >
      {children}
      <UniversalTransactionModal
        isOpen={isOpen}
        onClose={closeTransaction}
        target={currentTarget}
        onNavigate={(newTarget) => {
          setCurrentTarget(newTarget);
        }}
      />
    </TransactionViewerContext.Provider>
  );
}

export function useTransactionViewer() {
  const ctx = useContext(TransactionViewerContext);
  if (!ctx) {
    // Graceful fallback for components rendered outside the provider: trigger via custom event
    return {
      openTransaction: (input: ResolveTransactionInput) => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('saleflow:open-transaction', { detail: input })
          );
        }
      },
      closeTransaction: () => {},
      isOpen: false,
      currentTarget: null,
    };
  }
  return ctx;
}
