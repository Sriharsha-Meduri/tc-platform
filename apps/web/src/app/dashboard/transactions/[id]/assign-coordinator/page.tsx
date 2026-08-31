import { redirect, notFound } from 'next/navigation';
import { getSession } from '@/lib/auth-actions';
import { AssignCoordinatorForm } from './AssignCoordinatorForm';

export const metadata = { title: 'Assign Coordinator — TC' };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AssignCoordinatorPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { id } = await params;

  const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000') + '/api/v1';

  let transaction: { id: string; transactionNumber?: string; assignedCoordinatorAccountId?: string | null } | null = null;
  try {
    const cookieStore = await import('next/headers').then((m) => m.cookies());
    const tcToken = (await cookieStore).get('tc_token')?.value;
    const res = await fetch(`${API_URL}/transactions/${id}`, {
      headers: { Authorization: `Bearer ${tcToken}` },
    });
    if (res.ok) transaction = await res.json();
  } catch {
    // ignore
  }

  if (!transaction) notFound();

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Assign Coordinator</h1>
        <p className="mt-1 text-sm text-gray-500">
          Transaction: {transaction.transactionNumber ?? transaction.id}
        </p>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <AssignCoordinatorForm
          transactionId={transaction.id}
          currentCoordinatorAccountId={transaction.assignedCoordinatorAccountId ?? null}
        />
      </div>
    </div>
  );
}