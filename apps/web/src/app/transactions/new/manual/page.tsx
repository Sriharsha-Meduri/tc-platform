import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth-actions';
import WizardForm from '../WizardForm';

export const metadata = { title: 'New Transaction — Manual Entry — TC' };

export default async function ManualEntryPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return <WizardForm session={session} />;
}
