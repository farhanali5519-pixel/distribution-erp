'use client';

import React from 'react';
import {
  Settings,
  Globe,
  Shield,
  Server,
  Mail,
  CheckCircle2,
  HardDrive,
  Cpu,
} from 'lucide-react';
import { getBaseDomain, getAppProtocol } from '@/core/tenancy/subdomain';

export default function SettingsPage() {
  const baseDomain = getBaseDomain();
  const protocol = getAppProtocol();

  return (
    <div className="space-y-6 select-none max-w-4xl">
      <div>
        <h2 className="text-lg font-bold tracking-tight text-[#0F2747]">
          System Settings & Platform Architecture
        </h2>
        <p className="text-xs text-[#667085] mt-0.5">
          SaleFlow vendor configuration, domain orchestration, and runtime telemetry
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* DOMAIN ORCHESTRATION */}
        <div className="p-5 rounded-2xl bg-white border border-[#E4E7EC] shadow-sm space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F2747] flex items-center gap-2">
            <Globe className="w-4 h-4 text-[#16A46A]" />
            <span>Domain & Tenancy Architecture</span>
          </h3>

          <div className="space-y-3 text-xs">
            <div className="p-3.5 rounded-xl bg-[#F5F7FA] border border-[#E4E7EC]">
              <div className="text-[10px] text-[#667085] uppercase font-semibold">
                Apex Vendor Domain
              </div>
              <div className="font-mono text-sm font-bold text-[#0F2747] mt-0.5">
                https://{baseDomain}
              </div>
              <p className="text-[11px] text-[#667085] mt-1">
                Dedicated vendor Super Admin portal only. Customer transactional ERP is strictly forbidden.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-[#F5F7FA] border border-[#E4E7EC]">
              <div className="text-[10px] text-[#667085] uppercase font-semibold">
                Customer ERP Subdomain Pattern
              </div>
              <div className="font-mono text-sm font-bold text-[#16A46A] mt-0.5">
                https://&lt;tenant-slug&gt;.{baseDomain}
              </div>
              <p className="text-[11px] text-[#667085] mt-1">
                Each organization resolves exclusively to its isolated database and workspace context.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-[#F5F7FA] border border-[#E4E7EC]">
              <div className="text-[10px] text-[#667085] uppercase font-semibold">
                Canonical WWW Redirect
              </div>
              <div className="font-mono text-xs text-[#16A46A] font-medium mt-0.5 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>www.{baseDomain} → {baseDomain} (HTTP 307)</span>
              </div>
            </div>
          </div>
        </div>

        {/* SECURITY ARCHITECTURE */}
        <div className="p-5 rounded-2xl bg-white border border-[#E4E7EC] shadow-sm space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F2747] flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#16A46A]" />
            <span>Security & Session Guard</span>
          </h3>

          <div className="space-y-3 text-xs">
            <div className="p-3.5 rounded-xl bg-[#F5F7FA] border border-[#E4E7EC]">
              <div className="text-[10px] text-[#667085] uppercase font-semibold">
                Cookie Specifications
              </div>
              <div className="font-mono text-xs text-[#172033] mt-1 space-y-0.5">
                <div>Name: <span className="text-[#0F2747] font-semibold">saleflow_superadmin_session</span></div>
                <div>Flags: <span className="text-[#16A46A] font-semibold">HttpOnly, SameSite=Lax, Secure</span></div>
                <div>Expiry: <span className="text-[#667085]">7 Days Rolling</span></div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#F5F7FA] border border-[#E4E7EC]">
              <div className="text-[10px] text-[#667085] uppercase font-semibold">
                Two-Factor Security Core
              </div>
              <div className="text-xs text-[#344054] mt-1 space-y-1">
                <div>• Pure TypeScript RFC 6238 TOTP Engine (Zero native dependency)</div>
                <div>• SVG QR Matrix Generator (No canvas/binary dependencies)</div>
                <div>• SHA-256 Hashed One-Time Recovery Codes</div>
              </div>
            </div>
          </div>
        </div>

        {/* SMTP EMAIL TRANSPORT STATUS */}
        <div className="p-5 rounded-2xl bg-white border border-[#E4E7EC] shadow-sm space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F2747] flex items-center gap-2">
            <Mail className="w-4 h-4 text-[#16A46A]" />
            <span>Email Transport & OTP Delivery</span>
          </h3>

          <div className="space-y-3 text-xs text-[#344054]">
            <p>
              The platform utilizes a zero-dependency streaming socket SMTP client supporting Gmail, AWS SES, Mailgun, SendGrid, or custom relays.
            </p>

            <div className="p-3.5 rounded-xl bg-[#F5F7FA] border border-[#E4E7EC] font-mono text-[11px] text-[#667085] space-y-1">
              <div>SMTP_HOST: <span className="text-[#172033]">&lt;configured via env&gt;</span></div>
              <div>SMTP_PORT: <span className="text-[#172033]">587 / 465</span></div>
              <div>SMTP_USER: <span className="text-[#172033]">&lt;configured via env&gt;</span></div>
              <div>SMTP_FROM: <span className="text-[#16A46A]">SaleFlow Security &lt;no-reply@salesflow.space&gt;</span></div>
            </div>

            <p className="text-[11px] text-[#667085]">
              In development or absent SMTP credentials, emails route gracefully to the in-memory testing outbox.
            </p>
          </div>
        </div>

        {/* RUNTIME TELEMETRY */}
        <div className="p-5 rounded-2xl bg-white border border-[#E4E7EC] shadow-sm space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F2747] flex items-center gap-2">
            <Server className="w-4 h-4 text-[#16A46A]" />
            <span>Hosting & Deployment Architecture</span>
          </h3>

          <div className="space-y-3 text-xs text-[#344054]">
            <div className="p-3.5 rounded-xl bg-[#F5F7FA] border border-[#E4E7EC] space-y-1 font-mono text-[11px]">
              <div>Target Platform: <span className="text-[#172033] font-semibold">Hostinger Cloud VPS / Node.js 22</span></div>
              <div>Output Bundle: <span className="text-[#16A46A] font-semibold">.hostinger Standalone Webpack</span></div>
              <div>Database Driver: <span className="text-[#0F2747] font-semibold">SQLite WAL / Dual Postgres Compatible</span></div>
              <div>Numeric Standard: <span className="text-[#172033]">Global Tabular UI Standard Enforced</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
