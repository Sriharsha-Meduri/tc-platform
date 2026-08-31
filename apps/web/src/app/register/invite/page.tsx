import Link from 'next/link';
import { InviteRegisterForm } from './InviteRegisterForm';

export const metadata = { title: 'Accept Invitation — TC' };

export default async function InviteRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Invalid Invitation</h1>
          <p className="text-sm text-gray-500">No invitation token provided. Please check the link you received.</p>
          <Link href="/login" className="mt-4 inline-block text-sm font-medium text-blue-700 hover:text-blue-800">
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-700 shadow-lg mb-4">
            <span className="text-white text-2xl font-bold">TC</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Accept Your Invitation</h1>
          <p className="mt-1 text-sm text-gray-500">
            Set up your account to join your organization
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <InviteRegisterForm token={token} />
          <p className="mt-6 text-center text-sm text-gray-500">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-blue-700 hover:text-blue-800">Sign in</Link>
          </p>
        </div>
        <p className="mt-6 text-center text-xs text-gray-400">
          &copy; {new Date().getFullYear()} TC Platform
        </p>
      </div>
    </div>
  );
}