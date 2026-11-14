'use client';

import { useState, useEffect } from 'react';
import { useFeatureFlags } from '@/shared/context/feature-flags-context';
import { 
  Sliders, 
  Layers, 
  CheckCircle2, 
  AlertTriangle, 
  TrendingUp, 
  Users, 
  Package, 
  Receipt, 
  ShoppingCart,
  RefreshCw,
  Lock,
  CreditCard,
  RotateCcw,
  BarChart3,
  ShieldCheck,
  Smartphone
} from 'lucide-react';

interface SystemModule {
  id: string;
  name: string;
  description: string;
  version: string;
  isEnabled: boolean;
  dependencies: string[];
  isCore?: boolean;
}

export default function ModulesPage() {
  const { refreshFlags } = useFeatureFlags();
  const [modules, setModules] = useState<SystemModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const fetchModules = async () => {
    try {
      const res = await fetch('/api/modules');
      const data = await res.json();
      if (data.success) {
        setModules(data.modules);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModules();
  }, []);

  const handleToggle = async (mod: SystemModule) => {
    setUpdatingId(mod.id);
    setStatusMessage(null);

    const nextState = !mod.isEnabled;

    try {
      const res = await fetch('/api/modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleId: mod.id,
          enable: nextState,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setStatusMessage({ text: data.message, isError: false });
        if (data.modules && Array.isArray(data.modules)) {
          setModules(data.modules);
        } else {
          await fetchModules();
        }
        // Immediately refresh feature flags across the app
        refreshFlags();
      } else {
        setStatusMessage({ text: data.message, isError: true });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Toggle failed', isError: true });
    } finally {
      setUpdatingId(null);
    }
  };

  const getModuleIcon = (id: string) => {
    switch (id) {
      case 'sales': return <TrendingUp size={22} color="#38bdf8" />;
      case 'customers': return <Users size={22} color="#818cf8" />;
      case 'inventory': return <Package size={22} color="#f59e0b" />;
      case 'expenses': return <Receipt size={22} color="#f43f5e" />;
      case 'purchase': return <ShoppingCart size={22} color="#10b981" />;
      case 'closing': return <CreditCard size={22} color="#ec4899" />;
      case 'returns': return <RotateCcw size={22} color="#f97316" />;
      case 'reports': return <BarChart3 size={22} color="#8b5cf6" />;
      case 'auth': return <ShieldCheck size={22} color="#06b6d4" />;
      case 'settings': return <Sliders size={22} color="#a855f7" />;
      case 'field_order_booking': return <Smartphone size={22} color="#06b6d4" />;
      default: return <Layers size={22} color="#94a3b8" />;
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-heading)', letterSpacing: '-0.02em' }}>
            System Modules
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Enable or disable business modules and features according to your operational needs.
          </p>
        </div>

        <button onClick={fetchModules} className="btn btn-outline btn-sm">
          <RefreshCw size={14} /> Refresh Modules
        </button>
      </div>

      {/* Notification banner */}
      {statusMessage && (
        <div style={{
          background: statusMessage.isError ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
          border: `1px solid ${statusMessage.isError ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
          borderRadius: 'var(--radius-sm)',
          padding: '0.85rem 1.25rem',
          color: statusMessage.isError ? '#f87171' : '#10b981',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          marginBottom: '1.5rem',
          fontSize: '0.875rem'
        }}>
          {statusMessage.isError ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Module Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem', marginBottom: '2.5rem' }}>
        {loading ? (
          <div style={{ color: 'var(--text-secondary)', padding: '2rem' }}>Loading modules...</div>
        ) : (
          modules.map((mod) => (
            <div key={mod.id} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-panel)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px solid var(--border-subtle)'
                    }}>
                      {getModuleIcon(mod.id)}
                    </div>
                    <div>
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-heading)' }}>{mod.name}</h3>
                      <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {mod.id} • v{mod.version}
                      </span>
                    </div>
                  </div>

                  {/* Switch or Locked Badge */}
                  {mod.isCore ? (
                    <span className="badge badge-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Lock size={12} /> Core
                    </span>
                  ) : (
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={mod.isEnabled}
                        disabled={updatingId === mod.id}
                        onChange={() => handleToggle(mod)}
                      />
                      <span className="slider"></span>
                    </label>
                  )}
                </div>

                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem', lineHeight: 1.5 }}>
                  {mod.description}
                </p>
              </div>

              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {mod.dependencies && mod.dependencies.length > 0 ? (
                    <span>Requires: <strong style={{ color: 'var(--text-secondary)' }}>{mod.dependencies.join(', ')}</strong></span>
                  ) : (
                    <span>Zero dependencies</span>
                  )}
                </div>

                <span className={mod.isEnabled ? 'badge badge-success' : 'badge badge-muted'}>
                  {mod.isEnabled ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Architecture Explanatory Card */}
      <div className="card">
        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-heading)', marginBottom: '0.75rem' }}>
          How Dynamic Module Decoupling Works
        </h3>
        <ul style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', paddingLeft: '1.25rem', lineHeight: 1.8 }}>
          <li><strong>Event-Driven Boundaries:</strong> Feature modules (e.g. Sales, Expenses) never write directly to General Ledger tables. They emit standardized accounting events.</li>
          <li><strong>Zero Corruption on Toggle:</strong> Toggling a module off suspends its UI routes and event listeners. Past posted journal entries remain immutable and locked in the GL.</li>
          <li><strong>Dependency Guardrails:</strong> Modules declare prerequisite dependencies (e.g., Sales requires Customers and Inventory), preventing broken relational graphs.</li>
        </ul>
      </div>
    </div>
  );
}
