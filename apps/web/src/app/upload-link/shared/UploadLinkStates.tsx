'use client';

import { Loader2, XCircle } from 'lucide-react';

export function UploadLinkLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Loader2 size={24} className="animate-spin text-gray-400" />
    </div>
  );
}

export function UploadLinkErrorCard({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center bg-white rounded-xl border border-gray-200 p-8 max-w-sm">
        <XCircle size={40} className="text-red-400 mx-auto mb-4" />
        <p className="text-gray-700 font-medium mb-2">Unable to load upload page</p>
        <p className="text-sm text-gray-500">{message}</p>
      </div>
    </div>
  );
}
