import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth-actions';
import TransactionSideSelector from './TransactionSideSelector';

export const metadata = { title: 'New Transaction — TC' };

export default async function NewTransactionPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return <TransactionSideSelector />;
}
