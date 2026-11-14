'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { AppUser } from '@/modules/auth/types';
import { 
  MODULE_GROUPS, 
  ALL_SUBMODULES, 
  SubModuleCapability, 
  UserPermissionsMap,
  getDefaultPermissionsForRole,
  normalizePermissions
} from '@/modules/auth/permissions-registry';
import { 
  ShieldCheck, 
  X, 
  Search, 
  ChevronDown, 
  ChevronRight, 
  Check, 
  Eye, 
  Edit3, 
  Ban, 
  Trash2, 
  Save, 
  Sliders,
  TrendingUp,
  ShoppingCart,
  Package,
  Receipt,
  BookOpen,
  BarChart3,
  Users,
  ClipboardList,
  Truck,
  CreditCard,
  RotateCcw,
  PlusCircle,
  FileText,
  Undo2,
  ShieldAlert,
  CheckCircle2,
  Layers,
  ToggleLeft
} from 'lucide-react';

interface ManagePermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: AppUser | null;
  onSaved: (updatedUser: AppUser) => void;
}

export const ManagePermissionsModal: React.FC<ManagePermissionsModalProps> = ({
  isOpen,
  onClose,
  user,
  onSaved,
}) => {
  const [mounted, setMounted] = useState(false);
  const [permissions, setPermissions] = useState<UserPermissionsMap>({});
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Initialize permissions and expand all by default
  useEffect(() => {
    if (user) {
      const initial = normalizePermissions(user.permissions || user.permissions_json, user.role);
      setPermissions(initial);

      // Expand all groups by default
      const exp: Record<string, boolean> = {};
      MODULE_GROUPS.forEach((g) => { exp[g.id] = true; });
      setExpandedGroups(exp);
      setSearchQuery('');
      setStatusMsg(null);
    }
  }, [user]);

  // Real-time statistics calculation (declared unconditionally at top)
  const stats = useMemo(() => {
    if (!user || !permissions) {
      return {
        mainModules: 0,
        totalMain: MODULE_GROUPS.length,
        subModules: 0,
        totalSub: ALL_SUBMODULES.length,
        editEnabled: 0,
        voidEnabled: 0,
        deleteEnabled: 0,
      };
    }

    let mainActiveCount = 0;
    let subActiveCount = 0;
    let editCount = 0;
    let voidCount = 0;
    let deleteCount = 0;

    MODULE_GROUPS.forEach((g) => {
      const hasActive = g.subModules.some((sm) => permissions[sm.slug]?.access);
      if (hasActive) mainActiveCount++;

      g.subModules.forEach((sm) => {
        const p = permissions[sm.slug];
        if (p?.access) subActiveCount++;
        if (p?.edit) editCount++;
        if (p?.void) voidCount++;
        if (p?.delete) deleteCount++;
      });
    });

    return {
      mainModules: mainActiveCount,
      totalMain: MODULE_GROUPS.length,
      subModules: subActiveCount,
      totalSub: ALL_SUBMODULES.length,
      editEnabled: editCount,
      voidEnabled: voidCount,
      deleteEnabled: deleteCount,
    };
  }, [permissions, user]);

  // Filter groups and submodules by search query (declared unconditionally at top)
  const filteredGroups = useMemo(() => {
    const q = (searchQuery || '').trim().toLowerCase();
    if (!q) return MODULE_GROUPS;

    return MODULE_GROUPS.map((g) => {
      const matchingSub = g.subModules.filter((sm) =>
        sm.name.toLowerCase().includes(q) ||
        sm.slug.toLowerCase().includes(q) ||
        sm.description.toLowerCase().includes(q)
      );
      return {
        ...g,
        subModules: matchingSub,
      };
    }).filter((g) => g.subModules.length > 0);
  }, [searchQuery]);

  // Render Lucide icon helper
  const renderIcon = (iconName: string, size = 18) => {
    switch (iconName) {
      case 'TrendingUp': return <TrendingUp size={size} />;
      case 'ShoppingCart': return <ShoppingCart size={size} />;
      case 'Package': return <Package size={size} />;
      case 'Receipt': return <Receipt size={size} />;
      case 'BookOpen': return <BookOpen size={size} />;
      case 'BarChart3': return <BarChart3 size={size} />;
      case 'Sliders': return <Sliders size={size} />;
      case 'Users': return <Users size={size} />;
      case 'ClipboardList': return <ClipboardList size={size} />;
      case 'Truck': return <Truck size={size} />;
      case 'CreditCard': return <CreditCard size={size} />;
      case 'RotateCcw': return <RotateCcw size={size} />;
      case 'PlusCircle': return <PlusCircle size={size} />;
      case 'FileText': return <FileText size={size} />;
      case 'Undo2': return <Undo2 size={size} />;
      case 'ShieldAlert': return <ShieldAlert size={size} />;
      case 'CheckCircle2': return <CheckCircle2 size={size} />;
      case 'Layers': return <Layers size={size} />;
      case 'ToggleLeft': return <ToggleLeft size={size} />;
      default: return <Sliders size={size} />;
    }
  };

  // Toggle group open/close
  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const expandAll = () => {
    const exp: Record<string, boolean> = {};
    MODULE_GROUPS.forEach((g) => { exp[g.id] = true; });
    setExpandedGroups(exp);
  };

  const collapseAll = () => {
    const exp: Record<string, boolean> = {};
    MODULE_GROUPS.forEach((g) => { exp[g.id] = false; });
    setExpandedGroups(exp);
  };

  // Toggle individual permission action
  const handleToggle = (slug: string, field: 'access' | 'edit' | 'void' | 'delete') => {
    setPermissions((prev) => {
      const current = prev[slug] || { access: false, edit: false, void: false, delete: false };
      const nextVal = !current[field];

      if (field === 'access') {
        // If turning off access, also turn off all actions
        if (!nextVal) {
          return {
            ...prev,
            [slug]: { access: false, edit: false, void: false, delete: false },
          };
        }
        return {
          ...prev,
          [slug]: { ...current, access: true },
        };
      } else {
        // If turning on any action, access must also be turned on
        return {
          ...prev,
          [slug]: {
            ...current,
            [field]: nextVal,
            access: nextVal ? true : current.access,
          },
        };
      }
    });
  };

  // Row preset actions: Full, View, None
  const handleRowPreset = (sm: SubModuleCapability, preset: 'full' | 'view' | 'none') => {
    setPermissions((prev) => {
      if (preset === 'full') {
        return {
          ...prev,
          [sm.slug]: {
            access: true,
            edit: sm.supportsEdit,
            void: sm.supportsVoid,
            delete: sm.supportsDelete,
          },
        };
      }
      if (preset === 'view') {
        return {
          ...prev,
          [sm.slug]: {
            access: true,
            edit: false,
            void: false,
            delete: false,
          },
        };
      }
      // 'none'
      return {
        ...prev,
        [sm.slug]: {
          access: false,
          edit: false,
          void: false,
          delete: false,
        },
      };
    });
  };

  // Group level presets: All Full, Read-Only, Clear
  const handleGroupPreset = (groupId: string, preset: 'full' | 'readonly' | 'clear') => {
    const group = MODULE_GROUPS.find((g) => g.id === groupId);
    if (!group) return;

    setPermissions((prev) => {
      const updated = { ...prev };
      for (const sm of group.subModules) {
        if (preset === 'full') {
          updated[sm.slug] = {
            access: true,
            edit: sm.supportsEdit,
            void: sm.supportsVoid,
            delete: sm.supportsDelete,
          };
        } else if (preset === 'readonly') {
          updated[sm.slug] = {
            access: true,
            edit: false,
            void: false,
            delete: false,
          };
        } else {
          updated[sm.slug] = {
            access: false,
            edit: false,
            void: false,
            delete: false,
          };
        }
      }
      return updated;
    });
  };

  // Master Access toggle on group header
  const handleToggleGroupMaster = (groupId: string, enable: boolean) => {
    handleGroupPreset(groupId, enable ? 'full' : 'clear');
  };

  // Save permissions
  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await fetch(`/api/auth/users/${user.id}/permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to save permissions.');
      }
      onSaved(data.user);
      onClose();
    } catch (err: any) {
      setStatusMsg({ text: err.message || 'Failed to save permissions.', isError: true });
    } finally {
      setSaving(false);
    }
  };

  const getRoleBadge = (r: string) => {
    switch (r) {
      case 'ADMIN': return { bg: '#fee2e2', text: '#b91c1c', border: '#fecaca', label: 'ADMIN' };
      case 'SALESMAN': return { bg: '#e0f2fe', text: '#0369a1', border: '#bae6fd', label: 'Salesman' };
      case 'CASHIER': return { bg: '#ffedd5', text: '#c2410c', border: '#fed7aa', label: 'Cashier' };
      case 'WAREHOUSE': return { bg: '#dcfce7', text: '#15803d', border: '#bbf7d0', label: 'Warehouse' };
      default: return { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0', label: r };
    }
  };

  // Early return strictly placed AFTER all hooks have executed
  if (!mounted || !isOpen || !user) {
    return null;
  }

  const roleBadge = getRoleBadge(user.role);

  return (
    <div
      suppressHydrationWarning
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100000,
        padding: '1.25rem',
      }}
    >
      <div
        suppressHydrationWarning
        style={{
          width: '100%',
          maxWidth: '1080px',
          maxHeight: '92vh',
          backgroundColor: '#ffffff',
          borderRadius: '0.85rem',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid #cbd5e1',
        }}
      >
        {/* ========================================================== */}
        {/* 1. MODAL HEADER BAR (Dark Slate bg-slate-900)             */}
        {/* ========================================================== */}
        <div
          style={{
            backgroundColor: '#0f172a',
            color: '#ffffff',
            padding: '1.25rem 1.5rem',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            borderBottom: '1px solid #334155',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                backgroundColor: 'rgba(56, 189, 248, 0.15)',
                color: '#38bdf8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: '2px',
                border: '1px solid rgba(56, 189, 248, 0.3)',
              }}
            >
              <ShieldCheck size={24} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.25rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc', margin: 0, letterSpacing: '-0.01em' }}>
                  Manage User Permissions
                </h2>
                <span
                  style={{
                    fontSize: '0.725rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    backgroundColor: roleBadge.bg,
                    color: roleBadge.text,
                    border: `1px solid ${roleBadge.border}`,
                  }}
                >
                  {roleBadge.label}
                </span>
              </div>
              <p style={{ fontSize: '0.825rem', color: '#94a3b8', margin: 0 }}>
                Configure Main Module access and granular Access, Edit, Void, and Delete rights for{' '}
                <strong style={{ color: '#f1f5f9' }}>{user.full_name}</strong> (
                <span className="font-mono" style={{ color: '#38bdf8' }}>@{user.username}</span>).
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '6px',
              padding: '6px',
              color: '#cbd5e1',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)')}
            title="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* ========================================================== */}
        {/* 2. STATS RIBBON (Pill Badges)                              */}
        {/* ========================================================== */}
        <div
          style={{
            backgroundColor: '#f8fafc',
            padding: '0.75rem 1.5rem',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span
              className="tabular-nums"
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: '6px',
                backgroundColor: '#e0f2fe',
                color: '#0369a1',
                border: '1px solid #bae6fd',
              }}
            >
              Main Modules: <strong>{stats.mainModules} / {stats.totalMain}</strong>
            </span>
            <span
              className="tabular-nums"
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: '6px',
                backgroundColor: '#f1f5f9',
                color: '#334155',
                border: '1px solid #cbd5e1',
              }}
            >
              Sub-modules: <strong>{stats.subModules} / {stats.totalSub}</strong>
            </span>
            <span
              className="tabular-nums"
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: '6px',
                backgroundColor: '#dcfce7',
                color: '#15803d',
                border: '1px solid #bbf7d0',
              }}
            >
              Edit: <strong>{stats.editEnabled}</strong> enabled
            </span>
            <span
              className="tabular-nums"
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: '6px',
                backgroundColor: '#fef3c7',
                color: '#b45309',
                border: '1px solid #fde68a',
              }}
            >
              Void: <strong>{stats.voidEnabled}</strong> enabled
            </span>
            <span
              className="tabular-nums"
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: '6px',
                backgroundColor: '#fee2e2',
                color: '#b91c1c',
                border: '1px solid #fecaca',
              }}
            >
              Delete: <strong>{stats.deleteEnabled}</strong> enabled
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={expandAll}
              className="btn btn-outline btn-sm"
              style={{ padding: '3px 9px', fontSize: '0.75rem', height: '28px' }}
            >
              Expand All
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="btn btn-outline btn-sm"
              style={{ padding: '3px 9px', fontSize: '0.75rem', height: '28px' }}
            >
              Collapse All
            </button>
          </div>
        </div>

        {/* ========================================================== */}
        {/* 3. SEARCH & ACTION LEGEND RIBBON                           */}
        {/* ========================================================== */}
        <div
          style={{
            padding: '0.65rem 1.5rem',
            backgroundColor: '#ffffff',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          {/* Search box */}
          <div style={{ position: 'relative', width: '280px' }}>
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#94a3b8',
              }}
            />
            <input
              type="text"
              placeholder="Search sub-modules..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input"
              style={{
                paddingLeft: '32px',
                paddingRight: '10px',
                height: '32px',
                fontSize: '0.8rem',
                borderRadius: '6px',
                width: '100%',
              }}
            />
          </div>

          {/* Action Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', fontSize: '0.75rem', color: '#64748b' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Eye size={13} color="#0284c7" />
              <span><strong>Access:</strong> Open page</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Edit3 size={13} color="#16a34a" />
              <span><strong>Edit:</strong> Create & update</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Ban size={13} color="#d97706" />
              <span><strong>Void:</strong> Void actions</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Trash2 size={13} color="#dc2626" />
              <span><strong>Delete:</strong> Remove records</span>
            </div>
            <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontStyle: 'italic' }}>
              *N/A indicates not supported
            </span>
          </div>
        </div>

        {/* ========================================================== */}
        {/* 4. COLLAPSIBLE MODULE GROUPS LIST (Scrollable)            */}
        {/* ========================================================== */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem', backgroundColor: '#f8fafc' }}>
          {statusMsg && (
            <div
              style={{
                padding: '0.65rem 1rem',
                borderRadius: '6px',
                marginBottom: '1rem',
                backgroundColor: statusMsg.isError ? '#fef2f2' : '#f0fdf4',
                border: `1px solid ${statusMsg.isError ? '#fecaca' : '#bbf7d0'}`,
                color: statusMsg.isError ? '#b91c1c' : '#15803d',
                fontSize: '0.825rem',
              }}
            >
              {statusMsg.text}
            </div>
          )}

          {filteredGroups.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8', fontSize: '0.9rem' }}>
              No sub-modules found matching &quot;{searchQuery}&quot;.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {filteredGroups.map((group) => {
                const isExpanded = expandedGroups[group.id] !== false;
                const activeCount = group.subModules.filter((sm) => permissions[sm.slug]?.access).length;
                const totalCount = group.subModules.length;
                const isAllActive = activeCount === totalCount && totalCount > 0;

                return (
                  <div
                    key={group.id}
                    style={{
                      backgroundColor: '#ffffff',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Accordion Card Header */}
                    <div
                      style={{
                        padding: '0.85rem 1.25rem',
                        backgroundColor: '#ffffff',
                        borderBottom: isExpanded ? '1px solid #f1f5f9' : 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                      onClick={() => toggleGroup(group.id)}
                    >
                      {/* Left: Group icon, title, active badge */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <span style={{ color: '#64748b' }}>
                          {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        </span>
                        <div
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '6px',
                            backgroundColor: '#f1f5f9',
                            color: '#0284c7',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {renderIcon(group.icon, 16)}
                        </div>
                        <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0f172a' }}>
                          {group.name}
                        </span>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '2px 7px',
                            borderRadius: '12px',
                            backgroundColor: activeCount > 0 ? '#e0f2fe' : '#f1f5f9',
                            color: activeCount > 0 ? '#0369a1' : '#64748b',
                          }}
                        >
                          {activeCount} / {totalCount} Active
                        </span>
                      </div>

                      {/* Right: Master Access Toggle & Presets */}
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        onClick={(e) => e.stopPropagation()} // don't toggle accordion on button clicks
                      >
                        {/* Master Access Switch */}
                        <button
                          type="button"
                          onClick={() => handleToggleGroupMaster(group.id, !isAllActive)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '0.725rem',
                            fontWeight: 700,
                            border: `1px solid ${isAllActive ? '#86efac' : '#e2e8f0'}`,
                            backgroundColor: isAllActive ? '#f0fdf4' : '#f8fafc',
                            color: isAllActive ? '#15803d' : '#64748b',
                            cursor: 'pointer',
                          }}
                          title="Toggle all items in this group"
                        >
                          {isAllActive ? <Check size={12} /> : null}
                          Access: {isAllActive ? 'Yes' : activeCount > 0 ? 'Partial' : 'No'}
                        </button>

                        <div style={{ width: '1px', height: '16px', backgroundColor: '#e2e8f0', margin: '0 2px' }} />

                        {/* Quick Presets */}
                        <button
                          type="button"
                          onClick={() => handleGroupPreset(group.id, 'full')}
                          className="btn btn-outline btn-sm"
                          style={{ padding: '2px 7px', fontSize: '0.7rem', height: '24px' }}
                        >
                          All Full
                        </button>
                        <button
                          type="button"
                          onClick={() => handleGroupPreset(group.id, 'readonly')}
                          className="btn btn-outline btn-sm"
                          style={{ padding: '2px 7px', fontSize: '0.7rem', height: '24px' }}
                        >
                          Read-Only
                        </button>
                        <button
                          type="button"
                          onClick={() => handleGroupPreset(group.id, 'clear')}
                          className="btn btn-outline btn-sm"
                          style={{ padding: '2px 7px', fontSize: '0.7rem', height: '24px', color: '#b91c1c' }}
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    {/* Accordion Card Body (Sub-modules Table) */}
                    {isExpanded && (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem' }}>
                          <thead>
                            <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                              <th style={{ padding: '0.65rem 1.25rem', color: '#475569', fontWeight: 700, width: '38%' }}>
                                SUB-MODULE / PAGE
                              </th>
                              <th style={{ padding: '0.65rem 0.5rem', color: '#475569', fontWeight: 700, textAlign: 'center', width: '11%' }}>
                                ACCESS
                              </th>
                              <th style={{ padding: '0.65rem 0.5rem', color: '#475569', fontWeight: 700, textAlign: 'center', width: '11%' }}>
                                EDIT
                              </th>
                              <th style={{ padding: '0.65rem 0.5rem', color: '#475569', fontWeight: 700, textAlign: 'center', width: '11%' }}>
                                VOID
                              </th>
                              <th style={{ padding: '0.65rem 0.5rem', color: '#475569', fontWeight: 700, textAlign: 'center', width: '11%' }}>
                                DELETE
                              </th>
                              <th style={{ padding: '0.65rem 1.25rem', color: '#475569', fontWeight: 700, textAlign: 'right', width: '18%' }}>
                                PRESETS
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.subModules.map((sm, idx) => {
                              const perm = permissions[sm.slug] || { access: false, edit: false, void: false, delete: false };

                              return (
                                <tr
                                  key={sm.slug}
                                  style={{
                                    borderBottom: idx === group.subModules.length - 1 ? 'none' : '1px solid #f1f5f9',
                                    backgroundColor: perm.access ? '#ffffff' : '#fafafa',
                                    transition: 'background-color 0.1s ease',
                                  }}
                                >
                                  {/* Sub-module / Page info */}
                                  <td style={{ padding: '0.75rem 1.25rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                                      <div
                                        style={{
                                          width: '24px',
                                          height: '24px',
                                          borderRadius: '4px',
                                          backgroundColor: perm.access ? '#e0f2fe' : '#f1f5f9',
                                          color: perm.access ? '#0284c7' : '#94a3b8',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          marginTop: '1px',
                                        }}
                                      >
                                        {renderIcon(sm.icon, 14)}
                                      </div>
                                      <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                          <span style={{ fontWeight: 700, color: perm.access ? '#0f172a' : '#64748b' }}>
                                            {sm.name}
                                          </span>
                                          <span
                                            className="font-mono"
                                            style={{
                                              fontSize: '0.68rem',
                                              padding: '1px 5px',
                                              borderRadius: '3px',
                                              backgroundColor: '#f1f5f9',
                                              color: '#0284c7',
                                            }}
                                          >
                                            {sm.slug}
                                          </span>
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px', lineHeight: 1.3 }}>
                                          {sm.description}
                                        </div>
                                      </div>
                                    </div>
                                  </td>

                                  {/* ACCESS Button */}
                                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                                    <button
                                      type="button"
                                      onClick={() => handleToggle(sm.slug, 'access')}
                                      style={{
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '6px',
                                        border: `1px solid ${perm.access ? '#86efac' : '#cbd5e1'}`,
                                        backgroundColor: perm.access ? '#f0fdf4' : '#ffffff',
                                        color: perm.access ? '#16a34a' : '#94a3b8',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        fontWeight: 800,
                                        fontSize: '0.9rem',
                                        transition: 'all 0.15s ease',
                                      }}
                                      title={perm.access ? 'Disable Access' : 'Enable Access'}
                                    >
                                      {perm.access ? '✓' : '✕'}
                                    </button>
                                  </td>

                                  {/* EDIT Button */}
                                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                                    {sm.supportsEdit ? (
                                      <button
                                        type="button"
                                        onClick={() => handleToggle(sm.slug, 'edit')}
                                        style={{
                                          width: '32px',
                                          height: '32px',
                                          borderRadius: '6px',
                                          border: `1px solid ${perm.edit ? '#86efac' : '#cbd5e1'}`,
                                          backgroundColor: perm.edit ? '#f0fdf4' : '#ffffff',
                                          color: perm.edit ? '#16a34a' : '#94a3b8',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          cursor: 'pointer',
                                          fontWeight: 800,
                                          fontSize: '0.9rem',
                                          transition: 'all 0.15s ease',
                                        }}
                                        title={perm.edit ? 'Disable Edit' : 'Enable Edit'}
                                      >
                                        {perm.edit ? '✓' : '✕'}
                                      </button>
                                    ) : (
                                      <span style={{ fontSize: '0.72rem', color: '#cbd5e1', fontWeight: 600 }}>
                                        N/A
                                      </span>
                                    )}
                                  </td>

                                  {/* VOID Button */}
                                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                                    {sm.supportsVoid ? (
                                      <button
                                        type="button"
                                        onClick={() => handleToggle(sm.slug, 'void')}
                                        style={{
                                          width: '32px',
                                          height: '32px',
                                          borderRadius: '6px',
                                          border: `1px solid ${perm.void ? '#fed7aa' : '#cbd5e1'}`,
                                          backgroundColor: perm.void ? '#fff7ed' : '#ffffff',
                                          color: perm.void ? '#ea580c' : '#94a3b8',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          cursor: 'pointer',
                                          fontWeight: 800,
                                          fontSize: '0.9rem',
                                          transition: 'all 0.15s ease',
                                        }}
                                        title={perm.void ? 'Disable Void' : 'Enable Void'}
                                      >
                                        {perm.void ? '✓' : '✕'}
                                      </button>
                                    ) : (
                                      <span style={{ fontSize: '0.72rem', color: '#cbd5e1', fontWeight: 600 }}>
                                        N/A
                                      </span>
                                    )}
                                  </td>

                                  {/* DELETE Button */}
                                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                                    {sm.supportsDelete ? (
                                      <button
                                        type="button"
                                        onClick={() => handleToggle(sm.slug, 'delete')}
                                        style={{
                                          width: '32px',
                                          height: '32px',
                                          borderRadius: '6px',
                                          border: `1px solid ${perm.delete ? '#fca5a5' : '#cbd5e1'}`,
                                          backgroundColor: perm.delete ? '#fef2f2' : '#ffffff',
                                          color: perm.delete ? '#dc2626' : '#94a3b8',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          cursor: 'pointer',
                                          fontWeight: 800,
                                          fontSize: '0.9rem',
                                          transition: 'all 0.15s ease',
                                        }}
                                        title={perm.delete ? 'Disable Delete' : 'Enable Delete'}
                                      >
                                        {perm.delete ? '✓' : '✕'}
                                      </button>
                                    ) : (
                                      <span style={{ fontSize: '0.72rem', color: '#cbd5e1', fontWeight: 600 }}>
                                        N/A
                                      </span>
                                    )}
                                  </td>

                                  {/* ROW PRESETS: [ Full ] [ View ] [ None ] */}
                                  <td style={{ padding: '0.75rem 1.25rem', textAlign: 'right' }}>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                      <button
                                        type="button"
                                        onClick={() => handleRowPreset(sm, 'full')}
                                        style={{
                                          padding: '2px 6px',
                                          borderRadius: '3px',
                                          border: '1px solid #cbd5e1',
                                          backgroundColor: '#ffffff',
                                          fontSize: '0.68rem',
                                          fontWeight: 600,
                                          color: '#334155',
                                          cursor: 'pointer',
                                        }}
                                      >
                                        Full
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleRowPreset(sm, 'view')}
                                        style={{
                                          padding: '2px 6px',
                                          borderRadius: '3px',
                                          border: '1px solid #cbd5e1',
                                          backgroundColor: '#ffffff',
                                          fontSize: '0.68rem',
                                          fontWeight: 600,
                                          color: '#334155',
                                          cursor: 'pointer',
                                        }}
                                      >
                                        View
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleRowPreset(sm, 'none')}
                                        style={{
                                          padding: '2px 6px',
                                          borderRadius: '3px',
                                          border: '1px solid #fecaca',
                                          backgroundColor: '#ffffff',
                                          fontSize: '0.68rem',
                                          fontWeight: 600,
                                          color: '#b91c1c',
                                          cursor: 'pointer',
                                        }}
                                      >
                                        None
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ========================================================== */}
        {/* 5. MODAL FOOTER                                            */}
        {/* ========================================================== */}
        <div
          style={{
            padding: '1rem 1.5rem',
            backgroundColor: '#ffffff',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
            Changes take effect immediately upon saving.
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-outline"
              disabled={saving}
              style={{ fontSize: '0.85rem' }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="btn btn-primary"
              disabled={saving}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                fontSize: '0.85rem',
                padding: '0.5rem 1.25rem',
              }}
            >
              <Save size={15} />
              {saving ? 'Saving Permissions...' : 'Save Permissions'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManagePermissionsModal;
