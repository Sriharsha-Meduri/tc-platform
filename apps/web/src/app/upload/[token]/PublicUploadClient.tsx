'use client';

import { useRef, useState } from 'react';
import { Upload, Loader2, CheckCircle2, AlertCircle, FileUp } from 'lucide-react';
import { cn } from '@/lib/utils';

function decodeTokenPayload(token: string): { stage?: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(payload) as { stage?: string };
  } catch {
    return null;
  }
}

interface Props {
  token: string;
}

export default function PublicUploadClient({ token }: Props) {
  const payload = decodeTokenPayload(token);
  const stage = payload?.stage;
  const stageLabel = stage
    ? stage.charAt(0).toUpperCase() + stage.slice(1).toLowerCase()
    : 'document';

  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

  function pickFile(file: File) {
    if (file.type !== 'application/pdf') {
      setUploadError('Only PDF files are supported.');
      return;
    }
    setSelectedFile(file);
    setUploadError(null);
  }

  async function handleUpload() {
    if (!selectedFile) return;
    setUploading(true);
    setUploadError(null);

    const form = new FormData();
    form.append('file', selectedFile);
    form.append('token', token);

    try {
      const res = await fetch(`${apiUrl}/api/v1/document-extraction/upload-via-token`, {
        method: 'POST',
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Upload failed' }));
        throw new Error((err as { message?: string }).message ?? 'Upload failed');
      }
      setDone(true);
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 max-w-md w-full text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900">Document received</h1>
          <p className="text-gray-500 text-sm">
            Your <strong>{stageLabel}</strong> document has been uploaded and will be reviewed by your
            transaction coordinator.
          </p>
          <p className="text-xs text-gray-400">You may close this window.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md w-full space-y-6">
        {/* Header */}
        <div className="space-y-1.5">
          <div className="w-10 h-10 rounded-xl bg-blue-700 flex items-center justify-center">
            <span className="text-white text-sm font-bold">TC</span>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">
            Upload {stageLabel} documents
          </h1>
          <p className="text-sm text-gray-500">
            Your transaction coordinator has requested this document.
            Upload the PDF below — no account needed.
          </p>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) pickFile(f); }}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors',
            dragOver
              ? 'border-blue-400 bg-blue-50'
              : selectedFile
              ? 'border-blue-300 bg-blue-50/50'
              : 'border-gray-300 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/30',
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) pickFile(f);
              e.target.value = '';
            }}
          />
          {selectedFile ? (
            <div className="space-y-1">
              <p className="text-3xl">📄</p>
              <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
              <p className="text-xs text-gray-400">
                {(selectedFile.size / 1024 / 1024).toFixed(1)} MB — click to change
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <FileUp className="w-10 h-10 text-gray-300 mx-auto" />
              <p className="text-sm font-medium text-gray-700">
                Drop your PDF here or <span className="text-blue-600">browse</span>
              </p>
              <p className="text-xs text-gray-400">PDF up to 50 MB</p>
            </div>
          )}
        </div>

        {uploadError && (
          <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <AlertCircle size={16} />
            {uploadError}
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={!selectedFile || uploading}
          className="w-full flex items-center justify-center gap-2 py-3 bg-blue-700 text-white text-sm font-medium rounded-xl hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {uploading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Uploading…
            </>
          ) : (
            <>
              <Upload size={16} />
              Submit Document
            </>
          )}
        </button>

        <p className="text-xs text-gray-400 text-center">
          This upload link was sent by your transaction coordinator and expires in 7 days.
        </p>
      </div>
    </div>
  );
}
