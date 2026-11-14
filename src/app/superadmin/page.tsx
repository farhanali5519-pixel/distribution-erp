import React from 'react';
import { redirect } from 'next/navigation';
import { getSuperAdminSession } from '@/core/auth/superadmin-session';
import { SuperAdminDashboardClient } from './SuperAdminDashboardClient';

export default async function SuperAdminPage() {
  const session = await getSuperAdminSession();
  if (!session) {
    redirect('/superadmin/login');
  }

  return (
    <div className="py-2">
      <SuperAdminDashboardClient />
    </div>
  );
}
