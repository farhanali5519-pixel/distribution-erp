'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import { ListPageContainer } from '@/shared/components/ListPageContainer';
import { PaginationControls, usePagination } from '@/shared/components/PaginationControls';
import { useAuth } from '@/shared/context/auth-context';
import { AppUser, UserRole } from '@/modules/auth/types';
import dynamic from 'next/dynamic';

const ManagePermissionsModal = dynamic(
  () => import('./ManagePermissionsModal'),
  { ssr: false }
);
import { 
  Users, 
  UserPlus, 
  ShieldCheck, 
  KeyRound, 
  Lock, 
  Unlock, 
  CheckCircle2, 
  AlertCircle, 
  UserCheck, 
  UserX,
  Edit3, 
  Trash2,
  X,
  Sparkles,
  ShieldAlert,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';

export default function UsersManagementPage() {
  const { allUsers, refreshUsers } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPermsModal, setShowPermsModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);

  // Add User Form State
  const [addUsername, setAddUsername] = useState('');
  const [addFullName, setAddFullName] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addRole, setAddRole] = useState<UserRole>('SALESMAN');
  const [addStaffId, setAddStaffId] = useState('');

  // Edit User Form State
  const [editFullName, setEditFullName] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('SALESMAN');
  const [editStaffId, setEditStaffId] = useState('');

  // Reset Password Form State
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');

  // PIN Form State
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  // Status feedback
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; isError: boolean } | null>(null);

  const fetchUsersAndStaff = async () => {
    try {
      const [resUsers, resStaff] = await Promise.all([
        fetch('/api/auth/users'),
        fetch('/api/staff'),
      ]);
      const dataUsers = await resUsers.json();
      const dataStaff = await resStaff.json();

      if (dataUsers.success) setUsers(dataUsers.users);
      if (dataStaff.success) setStaffList(dataStaff.staff || []);
    } catch (err: any) {
      console.error('Failed to load users/staff:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsersAndStaff();
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('new') === '1' || params.get('create') === '1') {
        setShowAddModal(true);
      }
    }
  }, []);

  const staffOptions = useMemo(() => [
    { value: '', label: 'No linked staff member' },
    ...staffList.map((s) => ({
      value: s.id,
      label: s.name,
      subLabel: `${s.role} • ${s.phone || 'No Phone'}`,
      badge: s.role,
      badgeColor: 'blue' as const,
      keywords: [s.name, s.role, s.phone || ''],
    })),
  ], [staffList]);

  // Format date helper: DD/MM/YYYY
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // Pastel Pill Badge styles
  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'ADMIN':
        return { bg: '#fee2e2', text: '#b91c1c', border: '#fecaca', label: 'Administrator' };
      case 'SALESMAN':
        return { bg: '#e0f2fe', text: '#0369a1', border: '#bae6fd', label: 'Salesman' };
      case 'CASHIER':
        return { bg: '#ffedd5', text: '#c2410c', border: '#fed7aa', label: 'Cashier' };
      case 'WAREHOUSE':
        return { bg: '#dcfce7', text: '#15803d', border: '#bbf7d0', label: 'Warehouse / Logistics' };
      case 'ORDER_BOOKER':
        return { bg: '#f3e8ff', text: '#7e22ce', border: '#e9d5ff', label: 'Order Booker' };
      default:
        return { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0', label: role };
    }
  };

  // Create User Handler
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setStatusMsg(null);

    try {
      const res = await fetch('/api/auth/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: addUsername,
          fullName: addFullName,
          password: addPassword,
          role: addRole,
          staffId: addStaffId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to create user.');
      }

      setStatusMsg({ text: `User @${data.user.username} created successfully!`, isError: false });
      setShowAddModal(false);
      setAddUsername('');
      setAddFullName('');
      setAddPassword('');
      setAddStaffId('');
      setAddRole('SALESMAN');
      await fetchUsersAndStaff();
      await refreshUsers();
    } catch (err: any) {
      setStatusMsg({ text: err.message || 'Failed to create user.', isError: true });
    } finally {
      setSubmitting(false);
    }
  };

  // Update User Details Handler
  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setSubmitting(true);
    setStatusMsg(null);

    try {
      const res = await fetch(`/api/auth/users/${selectedUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: editFullName,
          role: editRole,
          staffId: editStaffId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to update user.');
      }

      setStatusMsg({ text: `User @${data.user.username} updated successfully!`, isError: false });
      setShowEditModal(false);
      setSelectedUser(null);
      await fetchUsersAndStaff();
      await refreshUsers();
    } catch (err: any) {
      setStatusMsg({ text: err.message || 'Failed to update user.', isError: true });
    } finally {
      setSubmitting(false);
    }
  };

  // Reset Password Handler
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    if (resetPassword !== resetConfirm) {
      alert('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/auth/users/${selectedUser.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPassword }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to reset password.');
      }

      setStatusMsg({ text: `Password for @${selectedUser.username} reset successfully!`, isError: false });
      setShowResetModal(false);
      setSelectedUser(null);
      setResetPassword('');
      setResetConfirm('');
    } catch (err: any) {
      alert(err.message || 'Failed to reset password.');
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle Active/Inactive Status Handler
  const handleToggleStatus = async (u: AppUser) => {
    if (u.username === 'admin') {
      alert('Primary System Administrator cannot be deactivated.');
      return;
    }
    try {
      const res = await fetch(`/api/auth/users/${u.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to update user status.');
      }
      setStatusMsg({ text: data.message, isError: false });
      await fetchUsersAndStaff();
      await refreshUsers();
    } catch (err: any) {
      setStatusMsg({ text: err.message || 'Failed to toggle status.', isError: true });
    }
  };

  // Delete User Handler
  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    if (selectedUser.username === 'admin') {
      alert('Primary System Administrator cannot be deleted.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/auth/users/${selectedUser.id}?action=delete`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to delete user.');
      }

      setStatusMsg({ text: `User @${selectedUser.username} has been permanently removed.`, isError: false });
      setShowDeleteModal(false);
      setSelectedUser(null);
      await fetchUsersAndStaff();
      await refreshUsers();
    } catch (err: any) {
      alert(err.message || 'Failed to delete user.');
    } finally {
      setSubmitting(false);
    }
  };

  // Change Admin Security PIN Handler
  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
      alert('New PIN must be exactly 4 digits (0-9).');
      return;
    }
    if (newPin !== confirmPin) {
      alert('New PIN and Confirm PIN do not match.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPin, currentPin }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to update Admin PIN.');
      }
      setStatusMsg({ text: 'Admin Security PIN updated successfully!', isError: false });
      setShowPinModal(false);
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
    } catch (err: any) {
      alert(err.message || 'Failed to update PIN.');
    } finally {
      setSubmitting(false);
    }
  };

  const usersPagination = usePagination(users);

  return (
    <ListPageContainer style={{ paddingBottom: '3.5rem' }}>
      {/* ========================================================== */}
      {/* 1. SCREEN HEADER (Bold Title + Action Buttons)             */}
      {/* ========================================================== */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.75rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '1.5rem',
              fontWeight: 800,
              color: '#0f172a',
              margin: 0,
              letterSpacing: '-0.02em',
            }}
          >
            User Management
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '0.25rem 0 0 0' }}>
            Manage user accounts, assign roles, and configure granular submodule permissions.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={() => setShowPinModal(true)}
            className="btn btn-outline"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              color: '#b45309',
              borderColor: '#fde68a',
              backgroundColor: '#fffbeb',
              fontSize: '0.85rem',
            }}
          >
            <KeyRound size={15} /> Admin Security PIN
          </button>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="btn btn-primary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              fontSize: '0.85rem',
              padding: '0.55rem 1.25rem',
              borderRadius: '0.5rem',
              fontWeight: 700,
            }}
          >
            <UserPlus size={16} /> + Add User
          </button>
        </div>
      </div>

      {/* Notification Banner */}
      {statusMsg && (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '0.5rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: statusMsg.isError ? '#fef2f2' : '#f0fdf4',
            border: `1px solid ${statusMsg.isError ? '#fecaca' : '#bbf7d0'}`,
            color: statusMsg.isError ? '#b91c1c' : '#15803d',
            fontSize: '0.875rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {statusMsg.isError ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
            <span>{statusMsg.text}</span>
          </div>
          <button
            onClick={() => setStatusMsg(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* ========================================================== */}
      {/* 2. USER MANAGEMENT DATA TABLE (Replicating Image 1)        */}
      {/* ========================================================== */}
      <div
        className="card"
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '0.75rem',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
          overflow: 'hidden',
        }}
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: '3.5rem', color: '#64748b', fontSize: '0.9rem' }}>
            Loading user accounts...
          </div>
        ) : (
          <div className="table-container" style={{ margin: 0 }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '0.9rem 1.25rem', fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    USERNAME
                  </th>
                  <th style={{ padding: '0.9rem 1.25rem', fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    FULL NAME
                  </th>
                  <th style={{ padding: '0.9rem 1.25rem', fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    ROLE
                  </th>
                  <th style={{ padding: '0.9rem 1.25rem', fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    STATUS
                  </th>
                  <th style={{ padding: '0.9rem 1.25rem', fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    CREATED
                  </th>
                  <th style={{ padding: '0.9rem 1.25rem', fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>
                    ACTIONS
                  </th>
                </tr>
              </thead>
              <tbody>
                {usersPagination.paginatedItems.map((u, idx) => {
                  const badge = getRoleBadge(u.role);
                  return (
                    <tr
                      key={u.id}
                      style={{
                        borderBottom: idx === users.length - 1 ? 'none' : '1px solid #f1f5f9',
                        backgroundColor: u.is_active ? '#ffffff' : '#fafafa',
                        opacity: u.is_active ? 1 : 0.65,
                        transition: 'background-color 0.15s ease',
                      }}
                    >
                      {/* 1. USERNAME (lowercase, slate-700) */}
                      <td style={{ padding: '1rem 1.25rem' }}>
                        <span
                          className="font-mono"
                          style={{
                            fontSize: '0.875rem',
                            color: '#334155',
                            fontWeight: 600,
                          }}
                        >
                          {u.username.toLowerCase()}
                        </span>
                      </td>

                      {/* 2. FULL NAME (capitalized/uppercase, slate-900) */}
                      <td style={{ padding: '1rem 1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>
                            {u.full_name}
                          </span>
                          {u.staff_name && (
                            <span style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 600 }}>
                              ({u.staff_name})
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 3. ROLE (Soft pastel rounded pill badge) */}
                      <td style={{ padding: '1rem 1.25rem' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            padding: '3px 10px',
                            borderRadius: '9999px', // rounded pill
                            backgroundColor: badge.bg,
                            color: badge.text,
                            border: `1px solid ${badge.border}`,
                          }}
                        >
                          {badge.label}
                        </span>
                      </td>

                      {/* 4. STATUS (Green badge "Active" or gray badge "Inactive") */}
                      <td style={{ padding: '1rem 1.25rem' }}>
                        {u.is_active ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              backgroundColor: '#dcfce7',
                              color: '#15803d',
                              border: '1px solid #bbf7d0',
                            }}
                          >
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#22c55e' }} />
                            Active
                          </span>
                        ) : (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              backgroundColor: '#f1f5f9',
                              color: '#64748b',
                              border: '1px solid #e2e8f0',
                            }}
                          >
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#94a3b8' }} />
                            Inactive
                          </span>
                        )}
                      </td>

                      {/* 5. CREATED (Formatted date DD/MM/YYYY) */}
                      <td className="tabular-nums" style={{ padding: '1rem 1.25rem', fontSize: '0.85rem', color: '#64748b' }}>
                        {formatDate(u.created_at)}
                      </td>

                      {/* 6. ACTIONS (Horizontal link buttons with colored icons) */}
                      <td style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.85rem',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                          }}
                        >
                          {/* ✏️ Edit Action */}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedUser(u);
                              setEditFullName(u.full_name);
                              setEditRole(u.role);
                              setEditStaffId(u.staff_id || '');
                              setShowEditModal(true);
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: 'none',
                              border: 'none',
                              color: '#0284c7',
                              cursor: 'pointer',
                              padding: '2px 4px',
                              borderRadius: '4px',
                            }}
                            title="Edit User Details"
                          >
                            <Edit3 size={13} color="#0284c7" />
                            <span>Edit</span>
                          </button>

                          {/* 🛡️ Permissions Action */}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedUser(u);
                              setShowPermsModal(true);
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: 'none',
                              border: 'none',
                              color: '#7c3aed',
                              cursor: 'pointer',
                              padding: '2px 4px',
                              borderRadius: '4px',
                            }}
                            title="Configure Granular Sub-Module Permissions"
                          >
                            <ShieldCheck size={14} color="#7c3aed" />
                            <span>Permissions</span>
                          </button>

                          {/* 🔑 Reset Password Action */}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedUser(u);
                              setResetPassword('');
                              setResetConfirm('');
                              setShowResetModal(true);
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: 'none',
                              border: 'none',
                              color: '#d97706',
                              cursor: 'pointer',
                              padding: '2px 4px',
                              borderRadius: '4px',
                            }}
                            title="Reset User Password"
                          >
                            <KeyRound size={13} color="#d97706" />
                            <span>Reset Password</span>
                          </button>

                          {/* 👥 Deactivate / Activate Action */}
                          {u.username !== 'admin' ? (
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(u)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: 'none',
                                border: 'none',
                                color: u.is_active ? '#ea580c' : '#16a34a',
                                cursor: 'pointer',
                                padding: '2px 4px',
                                borderRadius: '4px',
                              }}
                              title={u.is_active ? 'Deactivate User Account' : 'Activate User Account'}
                            >
                              {u.is_active ? <UserX size={13} color="#ea580c" /> : <UserCheck size={13} color="#16a34a" />}
                              <span>{u.is_active ? 'Deactivate' : 'Activate'}</span>
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>—</span>
                          )}

                          {/* 🗑️ Delete Action */}
                          {u.username !== 'admin' ? (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedUser(u);
                                setShowDeleteModal(true);
                              }}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: 'none',
                                border: 'none',
                                color: '#dc2626',
                                cursor: 'pointer',
                                padding: '2px 4px',
                                borderRadius: '4px',
                              }}
                              title="Delete User Account"
                            >
                              <Trash2 size={13} color="#dc2626" />
                              <span>Delete</span>
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <PaginationControls pagination={usersPagination} />
      </div>

      {/* ========================================================== */}
      {/* 3. GRANULAR "MANAGE USER PERMISSIONS" MODAL (SCREEN 2)     */}
      {/* ========================================================== */}
      {showPermsModal && selectedUser && (
        <ManagePermissionsModal
          isOpen={showPermsModal}
          onClose={() => {
            setShowPermsModal(false);
            setSelectedUser(null);
          }}
          user={selectedUser}
          onSaved={async (updated: AppUser) => {
            setStatusMsg({
              text: `Permissions updated successfully for @${updated.username}!`,
              isError: false,
            });
            await fetchUsersAndStaff();
            await refreshUsers();
          }}
        />
      )}

      {/* ========================================================== */}
      {/* 4. ADD NEW USER MODAL                                      */}
      {/* ========================================================== */}
      {showAddModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '1rem',
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: '520px',
              width: '100%',
              backgroundColor: '#ffffff',
              borderRadius: '0.75rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              border: '1px solid #e2e8f0',
              padding: '1.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <UserPlus size={20} color="#0284c7" />
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Add New User Account
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateUser}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '0.25rem' }}>
                    Username (Login Handle) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. rashid.sales"
                    className="input font-mono"
                    value={addUsername}
                    onChange={(e) => setAddUsername(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '0.25rem' }}>
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rashid Khan"
                    className="input"
                    value={addFullName}
                    onChange={(e) => setAddFullName(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '0.25rem' }}>
                    Password *
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    className="input font-mono"
                    value={addPassword}
                    onChange={(e) => setAddPassword(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '0.25rem' }}>
                    Assigned Role *
                  </label>
                  <SearchableSelect
                    options={[
                      { value: 'SALESMAN', label: 'SALESMAN (Orders & Customers)' },
                      { value: 'ORDER_BOOKER', label: 'ORDER BOOKER (Field Orders & Market Visits)' },
                      { value: 'CASHIER', label: 'CASHIER (Expenses & Daily Closing)' },
                      { value: 'WAREHOUSE', label: 'WAREHOUSE (Purchases & Stock)' },
                      { value: 'ADMIN', label: 'ADMIN (Full Access)' },
                    ]}
                    value={addRole}
                    onChange={(val) => setAddRole(val as UserRole)}
                    placeholder="Select Role"
                  />
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '0.25rem' }}>
                  Link to Staff Member (Optional)
                </label>
                <SearchableSelect
                  options={staffOptions}
                  value={addStaffId}
                  onChange={(val) => setAddStaffId(val)}
                  placeholder="No linked staff member"
                  className="w-full"
                />
                <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.25rem', display: 'block' }}>
                  Links sales orders, returns, or expenses booked by this user to staff accountability reports.
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn btn-outline"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting}
                >
                  {submitting ? 'Creating User...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* 5. EDIT USER DETAILS MODAL                                 */}
      {/* ========================================================== */}
      {showEditModal && selectedUser && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '1rem',
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: '480px',
              width: '100%',
              backgroundColor: '#ffffff',
              borderRadius: '0.75rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              border: '1px solid #e2e8f0',
              padding: '1.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Edit3 size={18} color="#0284c7" />
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Edit User: @{selectedUser.username}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateUser}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '0.25rem' }}>
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  className="input"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '0.25rem' }}>
                  Assigned Role *
                </label>
                <SearchableSelect
                  options={[
                    { value: 'ADMIN', label: 'ADMIN' },
                    { value: 'SALESMAN', label: 'SALESMAN' },
                    { value: 'ORDER_BOOKER', label: 'ORDER BOOKER' },
                    { value: 'CASHIER', label: 'CASHIER' },
                    { value: 'WAREHOUSE', label: 'WAREHOUSE' },
                  ]}
                  value={editRole}
                  onChange={(val) => setEditRole(val as UserRole)}
                  disabled={selectedUser.username === 'admin'}
                  placeholder="Select Role"
                />
                {selectedUser.username === 'admin' && (
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.25rem', display: 'block' }}>
                    Primary admin role cannot be changed.
                  </span>
                )}
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '0.25rem' }}>
                  Linked Staff Member
                </label>
                <SearchableSelect
                  options={staffOptions}
                  value={editStaffId}
                  onChange={(val) => setEditStaffId(val)}
                  placeholder="No linked staff member"
                  className="w-full"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="btn btn-outline"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting}
                >
                  {submitting ? 'Saving Changes...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* 6. QUICK PASSWORD RESET MODAL                             */}
      {/* ========================================================== */}
      {showResetModal && selectedUser && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '1rem',
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: '420px',
              width: '100%',
              backgroundColor: '#ffffff',
              borderRadius: '0.75rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              border: '1px solid #e2e8f0',
              padding: '1.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <KeyRound size={18} color="#d97706" />
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Reset Password: @{selectedUser.username}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleResetPassword}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '0.25rem' }}>
                  New Password *
                </label>
                <input
                  type="password"
                  required
                  placeholder="Enter new password"
                  className="input font-mono"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '0.25rem' }}>
                  Confirm Password *
                </label>
                <input
                  type="password"
                  required
                  placeholder="Repeat new password"
                  className="input font-mono"
                  value={resetConfirm}
                  onChange={(e) => setResetConfirm(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  className="btn btn-outline"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting || !resetPassword}
                >
                  {submitting ? 'Resetting...' : 'Reset Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* 7. DELETE CONFIRMATION MODAL                               */}
      {/* ========================================================== */}
      {showDeleteModal && selectedUser && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '1rem',
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: '440px',
              width: '100%',
              backgroundColor: '#ffffff',
              borderRadius: '0.75rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              border: '1px solid #fca5a5',
              padding: '1.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1rem' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  backgroundColor: '#fee2e2',
                  color: '#dc2626',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Confirm User Deletion
                </h3>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>This action is permanent</span>
              </div>
            </div>

            <p style={{ fontSize: '0.875rem', color: '#475569', lineHeight: 1.5, marginBottom: '1.5rem' }}>
              Are you sure you want to permanently delete user{' '}
              <strong style={{ color: '#0f172a' }}>{selectedUser.full_name}</strong> (
              <span className="font-mono" style={{ color: '#0284c7' }}>@{selectedUser.username}</span>)?
              This user will no longer be able to access the system.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="btn btn-outline"
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                className="btn btn-sm"
                disabled={submitting}
                style={{
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  border: '1px solid #b91c1c',
                  fontWeight: 700,
                  padding: '0.5rem 1rem',
                  borderRadius: '0.375rem',
                }}
              >
                {submitting ? 'Deleting...' : 'Yes, Delete User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* 8. CHANGE ADMIN PIN MODAL                                  */}
      {/* ========================================================== */}
      {showPinModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '1rem',
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: '420px',
              width: '100%',
              backgroundColor: '#ffffff',
              borderRadius: '0.75rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              border: '1px solid #e2e8f0',
              padding: '1.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <KeyRound size={20} color="#b45309" />
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Admin Security PIN
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPinModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleChangePin}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '0.25rem' }}>
                  Current PIN (Default: 1234)
                </label>
                <input
                  type="password"
                  maxLength={4}
                  placeholder="••••"
                  className="input font-mono"
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                  style={{ width: '100%', textAlign: 'center', letterSpacing: '0.3rem', fontSize: '1.1rem' }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '0.25rem' }}>
                  New 4-Digit PIN *
                </label>
                <input
                  type="password"
                  maxLength={4}
                  required
                  placeholder="••••"
                  className="input font-mono"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  style={{ width: '100%', textAlign: 'center', letterSpacing: '0.3rem', fontSize: '1.1rem' }}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '0.25rem' }}>
                  Confirm New PIN *
                </label>
                <input
                  type="password"
                  maxLength={4}
                  required
                  placeholder="••••"
                  className="input font-mono"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  style={{ width: '100%', textAlign: 'center', letterSpacing: '0.3rem', fontSize: '1.1rem' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setShowPinModal(false)}
                  className="btn btn-outline"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting || newPin.length !== 4}
                >
                  {submitting ? 'Updating PIN...' : 'Update Admin PIN'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </ListPageContainer>
  );
}
