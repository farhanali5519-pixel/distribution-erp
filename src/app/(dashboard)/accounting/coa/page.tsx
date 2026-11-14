import { DoubleEntryEngine } from '@/core/accounting/engine';
import { ChartOfAccountsClient } from './ChartOfAccountsClient';
import { getTenantContext } from '@/core/tenancy/context';
import { DEFAULT_COMPANY_ID } from '@/core/tenancy/constants';

export const dynamic = 'force-dynamic';

export default async function ChartOfAccountsPage() {
  let companyId = DEFAULT_COMPANY_ID;
  try {
    const tenant = await getTenantContext();
    if (tenant?.companyId) {
      companyId = tenant.companyId;
    }
  } catch {}

  const accounts = await DoubleEntryEngine.getAccountsWithBalancesAsync(companyId);

  return <ChartOfAccountsClient initialAccounts={accounts} />;
}

