'use client';

import { useState, useEffect, useCallback } from 'react';
import { CompanyProfile, DEFAULT_COMPANY_PROFILE } from '@/modules/settings/types';

export function useCompanyProfile() {
  const [profile, setProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/company');
      const data = await res.json();
      if (data.success && data.profile) {
        setProfile(data.profile);
      }
    } catch (e) {
      console.warn('Failed to load company profile, using default:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return {
    profile,
    loading,
    refreshProfile: fetchProfile,
  };
}
