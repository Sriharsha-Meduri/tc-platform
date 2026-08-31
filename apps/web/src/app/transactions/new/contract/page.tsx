import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth-actions';
import { api } from '@/lib/api';
import ContractUpload from './ContractUpload';

export const metadata = { title: 'New Transaction — From Contract — TC' };

export default async function ContractUploadPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const accountId = session.account?.id ?? null;
  if (!accountId) redirect('/login');

  const orgs = await api.organizations.list();
  const organizationId = orgs?.[0]?.id ?? null;

  return (
    <ContractUpload
      accountId={accountId}
      organizationId={organizationId}
    />
  );
}
