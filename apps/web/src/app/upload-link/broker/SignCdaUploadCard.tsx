'use client';

import { useState } from 'react';
import { CheckCircle, UploadCloud } from 'lucide-react';
import { uploadSignedCda } from '../shared/uploadLinkApi';

/**
 * The Broker's one upload capability — the signed CDA. Deliberately its own
 * small component rather than a reuse of RequiredDocumentUploadField/
 * uploadFiles, which route through the general documents endpoint the Broker
 * link is blocked from (see ExternalDocumentUploadService's assertNotBrokerLink).
 */
export default function SignCdaUploadCard({ token, submitted, onUploaded }: {
  token: string;
  submitted: boolean;
  onUploaded: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !token) return;
    setError(null);
    setUploading(true);
    uploadSignedCda(token, file)
      .then(() => onUploaded())
      .catch((err: Error) => setError(err.message))
      .finally(() => setUploading(false));
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
        <UploadCloud size={16} className="text-blue-700" />
        <h2 className="text-sm font-semibold text-gray-800">Sign CDA</h2>
      </div>
      <div className="px-6 py-5">
        {submitted ? (
          <p className="text-sm text-green-700 flex items-center gap-1.5">
            <CheckCircle size={14} /> Signed CDA received.
          </p>
        ) : (
          <p className="text-sm text-gray-600">Once you've signed the CDA above, upload the signed copy here.</p>
        )}
        <label className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-600 cursor-pointer hover:border-blue-300">
          {uploading ? 'Uploading…' : submitted ? 'Replace Signed CDA' : 'Upload Signed CDA'}
          <input type="file" className="hidden" onChange={handleSelect} disabled={uploading} />
        </label>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </div>
    </div>
  );
}
