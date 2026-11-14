import React from 'react';
import { redirect } from 'next/navigation';
import { getSuperAdminSession } from '@/core/auth/superadmin-session';
import { CompanyDetailClient } from './CompanyDetailClient';

export default async function SuperAdminCompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSuperAdminSession();
  if (!session) {
    redirect('/superadmin/login');
  }

  const { id } = await params;

  return (
    <div className="py-2">
      <CompanyDetailClient companyId={id} />
    </div>
  );
}
