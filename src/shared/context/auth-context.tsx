'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AppUser, UserRole } from '@/modules/auth/types';
import { ALL_SUBMODULES, UserPermissionsMap } from '@/modules/auth/permissions-registry';

interface AuthContextType {
  currentUser: AppUser | null;
  allUsers: AppUser[];
  role: UserRole;
  isAdmin: boolean;
  isSalesman: boolean;
  isCashier: boolean;
  isWarehouse: boolean;
  isOrderBooker: boolean;
  switchUser: (user: AppUser) => void | Promise<void>;
  switchRole: (role: UserRole) => void;
  refreshUsers: () => Promise<void>;
  hasPermission: (path: string) => boolean;
  canUser: (submoduleSlug: string, action?: 'access' | 'edit' | 'void' | 'delete') => boolean;
  verifyPin: (pin: string) => Promise<boolean>;
  enabledModules: string[];
  isModuleEnabled: (moduleId: string) => boolean;
  loading: boolean;
  sessionResolved: boolean;
  modulesLoaded: boolean;
  isInitializing: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'saleflow_active_user';

export const AuthProvider: React.FC<{
  children: React.ReactNode;
  initialEnabledModules?: string[];
}> = ({ children, initialEnabledModules }) => {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [enabledModules, setEnabledModules] = useState<string[]>(initialEnabledModules || []);
  const [loading, setLoading] = useState(true);
  const [sessionResolved, setSessionResolved] = useState(false);
  const [modulesLoaded, setModulesLoaded] = useState(Boolean(initialEnabledModules && initialEnabledModules.length > 0));

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session');
      const data = await res.json();
      if (data.success) {
        if (Array.isArray(data.enabledModules)) {
          setEnabledModules(data.enabledModules);
        }

        // Server session is the authoritative source of truth
        if (data.session && data.currentUser) {
          setCurrentUser(data.currentUser);
          if (Array.isArray(data.users)) {
            setAllUsers(data.users);
          }
          try {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data.currentUser));
          } catch {}
        } else {
          // Unauthenticated
          setCurrentUser(null);
          setAllUsers([]);
          try {
            localStorage.removeItem(LOCAL_STORAGE_KEY);
          } catch {}
        }
      }
    } catch (err) {
      console.error('Failed to load session users:', err);
      setCurrentUser(null);
    } finally {
      setLoading(false);
      setSessionResolved(true);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const switchUser = async (user: AppUser) => {
    setCurrentUser(user);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(user));

    // Synchronize server-side HttpOnly cookie session
    try {
      await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
    } catch (err) {
      console.error('Failed to sync session with server:', err);
    }
  };

  const switchRole = (targetRole: UserRole) => {
    const userWithRole = allUsers.find((u) => u.role === targetRole && u.is_active === 1);
    if (userWithRole) {
      switchUser(userWithRole);
    }
  };

  const role: UserRole = currentUser?.role || 'ADMIN';
  const isAdmin = role === 'ADMIN';
  const isSalesman = role === 'SALESMAN';
  const isCashier = role === 'CASHIER';
  const isWarehouse = role === 'WAREHOUSE';
  const isOrderBooker = role === 'ORDER_BOOKER';

  const canUser = (submoduleSlug: string, action: 'access' | 'edit' | 'void' | 'delete' = 'access'): boolean => {
    // If user has specific granular permissions configured
    if (currentUser?.permissions && currentUser.permissions[submoduleSlug]) {
      return Boolean(currentUser.permissions[submoduleSlug][action]);
    }

    // Role default fallbacks
    if (isAdmin) return true;

    if (isSalesman) {
      const salesMods = ['order-booking', 'direct-sale', 'sales-history', 'route-collections', 'customer-returns', 'customers'];
      if (!salesMods.includes(submoduleSlug)) return false;
      if (action === 'delete') return false;
      if (action === 'void') return submoduleSlug === 'order-booking';
      return true;
    }

    if (isCashier) {
      const cashierMods = ['daily-expenses', 'cash-closing', 'route-collections', 'party-ledgers', 'chart-of-accounts', 'trial-balance', 'customers', 'sales-history'];
      if (!cashierMods.includes(submoduleSlug)) return false;
      if (action === 'delete') return false;
      return true;
    }

    if (isWarehouse) {
      const warehouseMods = ['new-purchase-bill', 'purchase-orders-detail', 'vendor-returns', 'vendors-master', 'products-master', 'quarantine-stock', 'stock-valuation', 'inventory-audit-ledger', 'dispatch-load-sheet'];
      if (!warehouseMods.includes(submoduleSlug)) return false;
      if (action === 'delete') return false;
      return true;
    }

    if (isOrderBooker) {
      const bookerMods = ['field-order-booking', 'sales-history', 'customers'];
      if (!bookerMods.includes(submoduleSlug)) return false;
      if (action === 'delete' || action === 'void') return false;
      if (submoduleSlug === 'field-order-booking') return true;
      return action === 'access';
    }

    return false;
  };

  const hasPermission = (path: string): boolean => {
    const p = path.toLowerCase();
    if (p === '/' || p === '') return true;

    // Check against canonical sub-modules
    for (const sm of ALL_SUBMODULES) {
      const matches = sm.routePrefixes.some((pref) => {
        const lowerPref = pref.toLowerCase();
        return p === lowerPref || p.startsWith(lowerPref + '/');
      });

      if (matches) {
        return canUser(sm.slug, 'access');
      }
    }

    // Legacy fallback by role
    if (isAdmin) return true;

    if (isSalesman) {
      return (
        p === '/sales' ||
        p.startsWith('/sales/order-booking') ||
        p.startsWith('/sales/direct-sale') ||
        p.startsWith('/sales/collections') ||
        p.startsWith('/customers') ||
        p.startsWith('/returns/sales')
      );
    }

    if (isCashier) {
      return (
        p.startsWith('/expenses') ||
        p.startsWith('/closing') ||
        p.startsWith('/sales/collections') ||
        p.startsWith('/accounting') ||
        p.startsWith('/reports/ledgers') ||
        p.startsWith('/customers')
      );
    }

    if (isWarehouse) {
      return (
        p.startsWith('/purchase') ||
        p.startsWith('/dispatch') ||
        p.startsWith('/inventory') ||
        p.startsWith('/returns') ||
        p.startsWith('/reports/stock')
      );
    }

    if (isOrderBooker) {
      return (
        p.startsWith('/sales/field-order-booking') ||
        p === '/sales' ||
        p.startsWith('/customers')
      );
    }

    return false;
  };

  const verifyPin = async (pin: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      return !!data.valid;
    } catch {
      return false;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        allUsers,
        role,
        isAdmin,
        isSalesman,
        isCashier,
        isWarehouse,
        isOrderBooker,
        switchUser,
        switchRole,
        refreshUsers: fetchUsers,
        hasPermission,
        canUser,
        verifyPin,
        enabledModules,
        isModuleEnabled: (moduleId: string) => {
          return enabledModules.includes(moduleId);
        },
        loading,
        sessionResolved,
        modulesLoaded: modulesLoaded || enabledModules.length > 0,
        isInitializing: loading || !sessionResolved,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
