'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Boxes,
  CheckCircle2,
  Layers,
  ArrowRight,
  Shield,
  Zap,
} from 'lucide-react';
import { PLAN_CONFIGS, AVAILABLE_SYSTEM_MODULES, CompanyPlan } from '@/core/tenancy/plans';

export default function ModulesPage() {
  const [selectedPlan, setSelectedPlan] = useState<CompanyPlan>('COMMERCIAL');

  const plans = Object.values(PLAN_CONFIGS);
  const activePlanConfig = PLAN_CONFIGS[selectedPlan];

  return (
    <div className="space-y-8 select-none">
      <div>
        <h2 className="text-lg font-bold tracking-tight text-[#0F2747]">
          Modules & Subscription Plans
        </h2>
        <p className="text-xs text-[#667085] mt-0.5">
          Predefined plan tier definitions and modular capability matrix
        </p>
      </div>

      {/* SECTION 1: PREDEFINED PLAN TIERS */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F2747] flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#16A46A]" />
          <span>Predefined Tier Presets</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {plans.map((p) => {
            const isSelected = selectedPlan === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPlan(p.id)}
                className={`p-4 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#EAF8F2] border-[#16A46A] shadow-sm'
                    : 'bg-white border-[#E4E7EC] hover:bg-[#F5F7FA] shadow-sm'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-[#0F2747]">
                      {p.name}
                    </span>
                    {isSelected && <Zap className="w-3.5 h-3.5 text-[#16A46A]" />}
                  </div>
                  <p className="text-[10px] text-[#667085] line-clamp-2">
                    {p.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-[#E4E7EC] space-y-1 text-[10px]">
                  <div className="flex justify-between text-[#667085]">
                    <span>Max Users:</span>
                    <span className="font-semibold tabular-nums text-[#172033]">{p.maxUsers}</span>
                  </div>
                  <div className="flex justify-between text-[#667085]">
                    <span>Warehouses:</span>
                    <span className="font-semibold tabular-nums text-[#172033]">{p.maxWarehouses}</span>
                  </div>
                  <div className="flex justify-between text-[#667085]">
                    <span>Modules:</span>
                    <span className="font-semibold tabular-nums text-[#16A46A]">{p.modules.length}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* SECTION 2: MODULE MATRIX FOR SELECTED PLAN */}
      <div className="p-6 rounded-2xl bg-white border border-[#E4E7EC] shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#E4E7EC] gap-2">
          <div>
            <h3 className="text-sm font-bold text-[#0F2747] flex items-center gap-2">
              <Boxes className="w-4 h-4 text-[#16A46A]" />
              <span>{activePlanConfig.name} Plan Module Manifest</span>
            </h3>
            <p className="text-xs text-[#667085] mt-0.5">
              Default operational capability blueprint assigned upon provisioning
            </p>
          </div>

          <Link
            href="/superadmin/companies"
            className="text-xs text-[#16A46A] hover:text-[#12A594] font-semibold flex items-center gap-1 self-start sm:self-auto transition-colors"
          >
            <span>Assign to Tenant</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {AVAILABLE_SYSTEM_MODULES.map((m) => {
            const isIncluded = activePlanConfig.modules.includes(m.id);
            return (
              <div
                key={m.id}
                className={`p-3.5 rounded-xl border flex items-start gap-3 transition-all ${
                  isIncluded
                    ? 'bg-[#F5F7FA] border-[#A6F4C5] text-[#172033]'
                    : 'bg-[#F5F7FA]/40 border-[#E4E7EC] opacity-40 text-[#667085]'
                }`}
              >
                <div className="mt-0.5">
                  {isIncluded ? (
                    <CheckCircle2 className="w-4 h-4 text-[#16A46A] shrink-0" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border border-[#D0D5DD] shrink-0" />
                  )}
                </div>
                <div className="space-y-0.5 min-w-0">
                  <div className="font-semibold text-xs text-[#0F2747] truncate">
                    {m.name}
                  </div>
                  <p className="text-[11px] text-[#667085] leading-relaxed">
                    {m.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
