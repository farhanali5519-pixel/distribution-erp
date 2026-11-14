'use client';

import { useState } from 'react';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import { useFeatureFlags } from '@/shared/context/feature-flags-context';
import { 
  Sliders, 
  CheckCircle2, 
  AlertCircle, 
  TrendingUp, 
  Package, 
  BookOpen, 
  Settings, 
  Printer, 
  Sparkles,
  ShieldCheck,
  RefreshCw,
  Database,
  ShoppingCart,
  Receipt,
  CreditCard,
  RotateCcw,
  BarChart3
} from 'lucide-react';

export default function FeatureSettingsPage() {
  const { flags, loading, updateFlag, refreshFlags } = useFeatureFlags();
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const handleToggle = async (key: string, currentValue: string) => {
    setUpdatingKey(key);
    const newValue = currentValue === 'true' ? 'false' : 'true';
    const success = await updateFlag(key, newValue);
    setUpdatingKey(null);

    if (success) {
      setStatusMessage({
        text: `Configuration updated: "${key}" is now ${newValue === 'true' ? 'ENABLED' : 'DISABLED'}.`,
        isError: false,
      });
      setTimeout(() => setStatusMessage(null), 4000);
    } else {
      setStatusMessage({
        text: `Failed to update configuration for "${key}".`,
        isError: true,
      });
    }
  };

  const handleSelectChange = async (key: string, newValue: string) => {
    setUpdatingKey(key);
    const success = await updateFlag(key, newValue);
    setUpdatingKey(null);

    if (success) {
      setStatusMessage({
        text: `Configuration updated: "${key}" set to "${newValue}".`,
        isError: false,
      });
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  // Group flags by module
  const modules = [
    { id: 'sales', name: 'Sales & Distribution Workflow', icon: <TrendingUp size={20} color="#38bdf8" /> },
    { id: 'inventory', name: 'Inventory & Warehouse Master', icon: <Package size={20} color="#34d399" /> },
    { id: 'purchase', name: 'Purchase & Vendor Bills', icon: <ShoppingCart size={20} color="#10b981" /> },
    { id: 'expenses', name: 'Expense Management', icon: <Receipt size={20} color="#f43f5e" /> },
    { id: 'closing', name: 'Daily Cash Closing & Roznamcha', icon: <CreditCard size={20} color="#ec4899" /> },
    { id: 'returns', name: 'Returns Engine', icon: <RotateCcw size={20} color="#f97316" /> },
    { id: 'reports', name: 'Reports & Analytics', icon: <BarChart3 size={20} color="#8b5cf6" /> },
    { id: 'accounting', name: 'Accounting & Audit Controls', icon: <BookOpen size={20} color="#a78bfa" /> },
    { id: 'auth', name: 'Users, Roles & Security Access', icon: <ShieldCheck size={20} color="#06b6d4" /> },
    { id: 'settings', name: 'System Settings & Branding', icon: <Sliders size={20} color="#a855f7" /> },
    { id: 'backup', name: 'Database Backup & Recovery', icon: <Database size={20} color="#0284c7" /> },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-heading)', letterSpacing: '-0.02em' }}>
            Feature Management & Preferences
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Configure optional business features, order discounts, bonus items, and workflow preferences.
          </p>
        </div>

        <button 
          onClick={() => refreshFlags()} 
          className="btn btn-outline" 
          disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Reload Config
        </button>
      </div>

      {/* Notification Banner */}
      {statusMessage && (
        <div
          style={{
            background: statusMessage.isError ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
            border: `1px solid ${statusMessage.isError ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
            borderRadius: 'var(--radius-sm)',
            padding: '0.85rem 1.25rem',
            color: statusMessage.isError ? '#f87171' : '#10b981',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            marginBottom: '1.5rem',
            fontSize: '0.875rem',
          }}
        >
          {statusMessage.isError ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Flag Groups */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
          Loading feature flags...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {modules.map((mod) => {
            const moduleFlags = flags.filter((f) => f.moduleId === mod.id);
            if (moduleFlags.length === 0) return null;

            const isModuleActive = moduleFlags[0]?.isModuleEnabled !== false;

            return (
              <div key={mod.id} className="card" style={{ padding: '1.5rem', opacity: isModuleActive ? 1 : 0.85 }}>
                {/* Module Group Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {mod.icon}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-heading)' }}>{mod.name}</h2>
                        {!isModuleActive && (
                          <span className="badge badge-muted" style={{ fontSize: '0.65rem' }}>
                            MODULE INACTIVE
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Module ID: <code className="font-mono" style={{ color: 'var(--primary)' }}>{mod.id}</code> • <span className="tabular-nums font-semibold">{moduleFlags.length}</span> Configurable Toggles
                      </span>
                    </div>
                  </div>
                  {!isModuleActive && (
                    <span style={{ fontSize: '0.75rem', color: '#f59e0b' }}>
                      Enable module in Module Registry to activate features
                    </span>
                  )}
                </div>

                {/* Flags List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {moduleFlags.map((flag) => {
                    const isBool = flag.value === 'true' || flag.value === 'false';
                    const isEnabled = flag.value === 'true';
                    const isPending = updatingKey === flag.key;
                    const isFlagActive = flag.isModuleEnabled !== false;

                    return (
                      <div
                        key={flag.key}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '1.5rem',
                          padding: '1rem 1.25rem',
                          background: isEnabled && isFlagActive
                            ? 'var(--bg-panel)'
                            : 'var(--bg-surface)',
                          borderRadius: 'var(--radius-sm)',
                          border: `1px solid ${isEnabled && isFlagActive ? 'var(--primary)' : 'var(--border-subtle)'}`,
                          transition: 'all 0.2s ease',
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{flag.label}</span>
                            <code
                              className="font-mono"
                              style={{
                                fontSize: '0.7rem',
                                padding: '2px 6px',
                                background: 'var(--bg-card-hover)',
                                borderRadius: '4px',
                                color: 'var(--text-secondary)',
                              }}
                            >
                              {flag.key}
                            </code>
                            {!isFlagActive && (
                              <span style={{ fontSize: '0.68rem', color: '#f59e0b', fontWeight: 600 }}>
                                (Suspended - Module Disabled)
                              </span>
                            )}
                          </div>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                            {flag.description}
                          </p>
                        </div>

                        {/* Control (Toggle Switch or Select) */}
                        <div>
                          {isBool ? (
                            <button
                              type="button"
                              onClick={() => handleToggle(flag.key, flag.value)}
                              disabled={isPending}
                              style={{
                                width: '56px',
                                height: '30px',
                                borderRadius: '15px',
                                background: isEnabled
                                  ? 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)'
                                  : 'rgba(255, 255, 255, 0.1)',
                                border: `1px solid ${isEnabled ? '#38bdf8' : 'rgba(255, 255, 255, 0.2)'}`,
                                position: 'relative',
                                cursor: isPending ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s ease',
                                outline: 'none',
                                padding: 0,
                                opacity: isPending ? 0.6 : 1,
                              }}
                            >
                              <span
                                style={{
                                  position: 'absolute',
                                  top: '3px',
                                  left: isEnabled ? '29px' : '3px',
                                  width: '22px',
                                  height: '22px',
                                  borderRadius: '50%',
                                  background: '#fff',
                                  transition: 'left 0.2s ease',
                                  boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                                }}
                              />
                            </button>
                          ) : (
                            <div style={{ width: '160px' }}>
                              <SearchableSelect
                                options={[
                                  { value: 'THERMAL', label: 'THERMAL (80mm)' },
                                  { value: 'A4', label: 'A4 SHEET' },
                                ]}
                                value={flag.value}
                                onChange={(val) => handleSelectChange(flag.key, val as string)}
                                disabled={isPending}
                                size="sm"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
