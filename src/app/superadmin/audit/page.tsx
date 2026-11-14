'use client';

import React, { useState, useEffect } from 'react';
import {
  History,
  Search,
  RefreshCw,
  Filter,
  Shield,
  Clock,
  User,
  Building2,
  FileText,
} from 'lucide-react';
import type { AuditLogItem } from '@/core/audit/superadmin-audit.service';

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (actionFilter) params.set('action', actionFilter);
      params.set('limit', '100');

      const res = await fetch(`/api/superadmin/audit?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setLogs(json.data || []);
        setTotal(json.total || 0);
      }
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [searchQuery, actionFilter]);

  return (
    <div className="space-y-6 select-none">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-[#0F2747]">
            Activity & Security Audit Trail
          </h2>
          <p className="text-xs text-[#667085] mt-0.5">
            Cryptographic ledger of sensitive platform operations and authentication events ({total} logged)
          </p>
        </div>

        <button
          onClick={fetchLogs}
          className="p-2.5 rounded-xl border border-[#E4E7EC] bg-white hover:bg-[#F5F7FA] text-[#667085] hover:text-[#172033] transition-all cursor-pointer self-start sm:self-auto shadow-sm"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filter and Search */}
      <div className="p-4 rounded-2xl bg-white border border-[#E4E7EC] shadow-sm flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#98A2B3]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search audit trail by actor, reason, target..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#F5F7FA] border border-[#E4E7EC] text-xs text-[#172033] focus:outline-none focus:border-[#16A46A] focus:ring-1 focus:ring-[#16A46A] transition-all"
          />
        </div>

        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-3 py-2 rounded-xl bg-[#F5F7FA] border border-[#E4E7EC] text-xs text-[#172033] w-full sm:w-auto focus:outline-none focus:border-[#16A46A]"
        >
          <option value="">All Actions</option>
          <option value="SUPERADMIN_LOGIN">SUPERADMIN_LOGIN</option>
          <option value="SUPERADMIN_LOGIN_FAILED">SUPERADMIN_LOGIN_FAILED</option>
          <option value="2FA_ENABLED">2FA_ENABLED</option>
          <option value="2FA_DISABLED">2FA_DISABLED</option>
          <option value="CUSTOMER_CREATED">CUSTOMER_CREATED</option>
          <option value="CUSTOMER_UPDATED">CUSTOMER_UPDATED</option>
          <option value="CUSTOMER_SUSPENDED">CUSTOMER_SUSPENDED</option>
          <option value="CUSTOMER_ACTIVATED">CUSTOMER_ACTIVATED</option>
          <option value="LICENSE_EXTENDED">LICENSE_EXTENDED</option>
          <option value="MODULES_CHANGED">MODULES_CHANGED</option>
          <option value="GLOBAL_BRANDING_CHANGED">GLOBAL_BRANDING_CHANGED</option>
          <option value="TENANT_BRANDING_CHANGED">TENANT_BRANDING_CHANGED</option>
          <option value="TENANT_ADMIN_PASSWORD_RESET">TENANT_ADMIN_PASSWORD_RESET</option>
          <option value="TENANT_USER_CREATED">TENANT_USER_CREATED</option>
        </select>
      </div>

      {/* Logs Table */}
      <div className="rounded-2xl bg-white border border-[#E4E7EC] shadow-sm overflow-hidden">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-[#E4E7EC] bg-[#F8F9FA] text-[10px] font-bold uppercase tracking-wider text-[#667085]">
              <th className="py-3 px-4">Timestamp</th>
              <th className="py-3 px-3">Actor</th>
              <th className="py-3 px-3">Action</th>
              <th className="py-3 px-3">Target / Organization</th>
              <th className="py-3 px-3">Reason / Details</th>
              <th className="py-3 px-3">IP Address</th>
              <th className="py-3 px-4 text-right">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E4E7EC]">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-xs text-[#667085]">
                  No matching audit logs found.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-[#F5F7FA] transition-colors">
                  <td className="py-3 px-4 text-[11px] tabular-nums text-[#667085] whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="py-3 px-3 font-mono text-[#0F2747] font-semibold">
                    @{log.actor}
                  </td>
                  <td className="py-3 px-3 font-semibold text-[#172033]">
                    {log.action}
                  </td>
                  <td className="py-3 px-3 text-[#344054]">
                    {log.target || (log.tenantSlug ? `${log.tenantSlug}.salesflow.space` : 'System')}
                  </td>
                  <td className="py-3 px-3 text-[11px] text-[#667085] max-w-xs truncate">
                    {log.reason || '—'}
                  </td>
                  <td className="py-3 px-3 font-mono text-[10px] text-[#667085]">
                    {log.ip || 'internal'}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => setSelectedLog(log)}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-[#F5F7FA] border border-[#E4E7EC] text-[10px] font-medium text-[#344054] shadow-sm cursor-pointer transition-all"
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Log Inspector Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-[#E4E7EC] rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E4E7EC]">
              <div>
                <h3 className="text-base font-bold text-[#0F2747]">
                  Audit Event Details
                </h3>
                <span className="font-mono text-[10px] text-[#667085]">
                  Event ID: {selectedLog.id}
                </span>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-[#667085] hover:text-[#172033] p-1 cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-[#E4E7EC]">
                <span className="text-[#667085]">Action:</span>
                <span className="font-semibold text-[#172033]">{selectedLog.action}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E4E7EC]">
                <span className="text-[#667085]">Actor:</span>
                <span className="font-mono text-[#0F2747] font-semibold">@{selectedLog.actor}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E4E7EC]">
                <span className="text-[#667085]">Target:</span>
                <span className="text-[#172033]">{selectedLog.target || 'Platform'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E4E7EC]">
                <span className="text-[#667085]">Client IP:</span>
                <span className="font-mono text-[#172033]">{selectedLog.ip || 'internal'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E4E7EC]">
                <span className="text-[#667085]">Timestamp:</span>
                <span className="tabular-nums text-[#172033]">{selectedLog.timestamp}</span>
              </div>

              {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                <div className="pt-2">
                  <span className="block text-[11px] font-semibold text-[#667085] mb-1">
                    Sanitized Payload Metadata:
                  </span>
                  <pre className="p-3 rounded-xl bg-[#F5F7FA] border border-[#E4E7EC] font-mono text-[11px] text-[#0F2747] overflow-x-auto">
                    {JSON.stringify(selectedLog.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-[#E4E7EC] flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 rounded-xl bg-[#16A46A] hover:bg-[#12A594] text-white text-xs font-semibold cursor-pointer shadow-sm transition-all"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
