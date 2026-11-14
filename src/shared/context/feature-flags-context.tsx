'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface FeatureFlag {
  key: string;
  moduleId: string;
  value: string;
  label: string;
  description: string;
  updatedAt: string;
  isModuleEnabled?: boolean;
}

interface FeatureFlagsContextType {
  flags: FeatureFlag[];
  loading: boolean;
  isEnabled: (key: string, defaultValue?: boolean) => boolean;
  getValue: (key: string, defaultValue?: string) => string;
  updateFlag: (key: string, value: string) => Promise<boolean>;
  refreshFlags: () => Promise<void>;
}

const FeatureFlagsContext = createContext<FeatureFlagsContextType>({
  flags: [],
  loading: true,
  isEnabled: () => true,
  getValue: () => '',
  updateFlag: async () => false,
  refreshFlags: async () => {},
});

export function FeatureFlagsProvider({ children }: { children: React.ReactNode }) {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFlags = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/features');
      const data = await res.json();
      if (data.success && Array.isArray(data.flags)) {
        setFlags(data.flags);
      }
    } catch (err) {
      console.error('Failed to load feature flags:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFlags();
  }, [fetchFlags]);

  const isEnabled = useCallback(
    (key: string, defaultValue = true): boolean => {
      const found = flags.find((f) => f.key === key);
      if (!found) return defaultValue;
      if (found.isModuleEnabled === false) return false;
      return found.value === 'true' || found.value === '1';
    },
    [flags]
  );

  const getValue = useCallback(
    (key: string, defaultValue = ''): string => {
      const found = flags.find((f) => f.key === key);
      if (!found) return defaultValue;
      if (found.isModuleEnabled === false) return defaultValue;
      return found.value;
    },
    [flags]
  );

  const updateFlag = useCallback(
    async (key: string, value: string): Promise<boolean> => {
      // Optimistically update local state immediately
      setFlags((prev) =>
        prev.map((f) => (f.key === key ? { ...f, value, updatedAt: new Date().toISOString() } : f))
      );

      try {
        const res = await fetch('/api/settings/features', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value }),
        });
        const data = await res.json();
        if (data.success && Array.isArray(data.flags)) {
          setFlags(data.flags);
          return true;
        }
        return false;
      } catch (err) {
        console.error(`Failed to update feature flag ${key}:`, err);
        // Rollback by refetching
        fetchFlags();
        return false;
      }
    },
    [fetchFlags]
  );

  return (
    <FeatureFlagsContext.Provider
      value={{
        flags,
        loading,
        isEnabled,
        getValue,
        updateFlag,
        refreshFlags: fetchFlags,
      }}
    >
      {children}
    </FeatureFlagsContext.Provider>
  );
}

/**
 * Hook to consume the complete feature flags context
 */
export function useFeatureFlags() {
  return useContext(FeatureFlagsContext);
}

/**
 * Hook to consume a specific feature flag
 */
export function useFeatureFlag(key: string, defaultValue = true) {
  const { isEnabled, getValue, updateFlag, loading } = useFeatureFlags();

  return {
    loading,
    isEnabled: isEnabled(key, defaultValue),
    value: getValue(key),
    setValue: (val: string) => updateFlag(key, val),
  };
}
