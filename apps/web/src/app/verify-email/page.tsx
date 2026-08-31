import Link from 'next/link';

export const metadata = { title: 'Verify email — TC' };

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000') + '/api/v1';

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return <Result success={false} message="No verification token provided." />;
  }

  try {
    const res = await fetch(`${API_URL}/auth/verify-email?token=${encodeURIComponent(token)}`, {
      cache: 'no-store',
    });
    const body = await res.json() as { message?: string };

    if (!res.ok) {
      return <Result success={false} message={body.message ?? 'Verification failed. The link may have expired.'} />;
    }

    return <Result success={true} message={body.message ?? 'Email verified. You can now sign in.'} />;
  } catch {
    return <Result success={false} message="Unable to reach the server. Please try again." />;
  }
}

function Result({ success, message }: { success: boolean; message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-10 text-center space-y-4">
          <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-2 ${success ? 'bg-green-100' : 'bg-red-100'}`}>
            {success ? (
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </div>
          <h1 className="text-xl font-bold text-gray-900">{success ? 'Account verified!' : 'Verification failed'}</h1>
          <p className="text-sm text-gray-500">{message}</p>
          <Link
            href="/login"
            className="inline-block mt-2 rounded-lg bg-blue-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 transition-colors"
          >
            Go to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
