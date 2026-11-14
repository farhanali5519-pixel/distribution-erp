import React from 'react';
import { AlertTriangle, Clock, XCircle, Building2, HelpCircle } from 'lucide-react';
import { SaleFlowLogo } from '@/core/branding/logo';

export function TenantStatusBlock({
  status,
  companyName,
  companySlug,
}: {
  status: 'NOT_FOUND' | 'SUSPENDED' | 'EXPIRED' | string;
  companyName?: string;
  companySlug?: string;
}) {
  let title = 'Workspace Unavailable';
  let message = 'This company workspace cannot be accessed at this time.';
  let icon = <AlertTriangle className="w-10 h-10 text-amber-400" />;
  let badgeText = 'Status Notice';
  let badgeColor = 'bg-amber-500/10 text-amber-400 border-amber-500/20';

  if (status === 'NOT_FOUND') {
    title = 'Company Not Found / Inactive';
    message = `The requested organization "${companySlug || 'subdomain'}.salesflow.space" does not exist, has been deleted, or has not yet been provisioned by the platform administrator.`;
    icon = <Building2 className="w-10 h-10 text-zinc-400" />;
    badgeText = '404 Organization';
    badgeColor = 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
  } else if (status === 'SUSPENDED') {
    title = 'Account Suspended';
    message = `The workspace for "${companyName || companySlug || 'this company'}" has been temporarily suspended by the platform administrator. All company data, records, and databases are preserved intact.`;
    icon = <XCircle className="w-10 h-10 text-rose-400" />;
    badgeText = 'Access Suspended';
    badgeColor = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
  } else if (status === 'EXPIRED') {
    title = 'Subscription License Expired';
    message = `The license or trial term for "${companyName || companySlug || 'this company'}" has expired. Transactional ERP operations are temporarily locked pending license extension.`;
    icon = <Clock className="w-10 h-10 text-amber-400" />;
    badgeText = 'License Term Ended';
    badgeColor = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  }

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#c9d1d9] flex flex-col items-center justify-center p-6 select-none font-sans">
      <div className="w-full max-w-md text-center">
        {/* SaleFlow Logo */}
        <div className="flex justify-center mb-6">
          <SaleFlowLogo className="h-9" />
        </div>

        {/* Card */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-8 shadow-2xl space-y-4">
          <div className="inline-flex p-3 rounded-2xl bg-[#0d1117] border border-[#30363d] shadow-sm">
            {icon}
          </div>

          <div>
            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border mb-2 ${badgeColor}`}>
              {badgeText}
            </span>
            <h1 className="text-xl font-bold text-white tracking-tight">
              {title}
            </h1>
          </div>

          <p className="text-xs text-[#8b949e] leading-relaxed">
            {message}
          </p>

          <div className="pt-4 border-t border-[#30363d]/60 text-xs text-[#8b949e] space-y-1">
            <p>
              Please contact your organization administrator or System Support:
            </p>
            <div className="font-mono text-indigo-400 text-[11px]">
              support@salesflow.space
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
