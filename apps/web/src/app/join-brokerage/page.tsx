import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth-actions';
import JoinBrokerageForm from './JoinBrokerageForm';

export const metadata = { title: 'Join a brokerage — TC' };

export default async function JoinBrokeragePage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-12">
      <div className="w-full max-w-xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-700 shadow-lg mb-4">
            <span className="text-white text-2xl font-bold">TC</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Join a brokerage</h1>
          <p className="mt-1 text-sm text-gray-500">
            Search for your brokerage and request to join
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <JoinBrokerageForm />
        </div>
      </div>
    </div>
  );
}
