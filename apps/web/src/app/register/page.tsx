import Link from 'next/link';

export const metadata = { title: 'Create account — TC' };

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-700 shadow-lg mb-4">
            <span className="text-white text-2xl font-bold">TC</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
          <p className="mt-1 text-sm text-gray-500">Choose how you want to get started</p>
        </div>
        <div className="bg-white rounded-2xl shadow-xl p-8 space-y-4">
          <Link
            href="/register/agent"
            className="block p-5 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
          >
            <h3 className="font-semibold text-gray-900">I&apos;m a Real Estate Agent</h3>
            <p className="text-sm text-gray-500 mt-1">Create an account to manage your transactions</p>
          </Link>
          <Link
            href="/register/coordinator"
            className="block p-5 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
          >
            <h3 className="font-semibold text-gray-900">I&apos;m a Transaction Coordinator</h3>
            <p className="text-sm text-gray-500 mt-1">Create an account to coordinate transactions</p>
          </Link>
          <div className="pt-2 text-center">
            <p className="text-sm text-gray-500">
              Already have an account?{' '}
              <Link href="/login" className="font-medium text-blue-700 hover:text-blue-800">Sign in</Link>
            </p>
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-gray-400">© {new Date().getFullYear()} TC Platform</p>
      </div>
    </div>
  );
}