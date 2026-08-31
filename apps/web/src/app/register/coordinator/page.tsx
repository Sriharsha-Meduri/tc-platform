import Link from 'next/link';
import { CoordinatorRegisterForm } from './CoordinatorRegisterForm';

export const metadata = { title: 'Register as Coordinator — TC' };

export default function CoordinatorRegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-700 shadow-lg mb-4">
            <span className="text-white text-2xl font-bold">TC</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Register as a Coordinator</h1>
          <p className="mt-1 text-sm text-gray-500">
            Create your transaction coordinator account
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <CoordinatorRegisterForm />
          <p className="mt-6 text-center text-sm text-gray-500">
            Already registered?{' '}
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