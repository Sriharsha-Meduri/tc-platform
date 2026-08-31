'use client';

import { useState } from 'react';
import { CheckCircle2, XCircle, Loader2, Circle, PlayCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  createTestRunAction,
  getTestRunAction,
  createTestTransactionAction,
  uploadTestDocumentAction,
  type TestRun,
  type TestRunMode,
  type BuiltInTestDocument,
} from '@/lib/admin-testing-actions';

const BUILT_IN_DOCUMENTS: { value: BuiltInTestDocument; label: string }[] = [
  { value: 'rpa_valid', label: 'RPA — Valid' },
  { value: 'rpa_missing_price', label: 'RPA — Missing Price' },
  { value: 'sco_bco_counter_offer', label: 'SCO/BCO — Counter Offer' },
  { value: 'smco_valid', label: 'SMCO — Valid' },
];

function StepIcon({ status }: { status: TestRun['steps'][number]['status'] }) {
  if (status === 'passed') return <CheckCircle2 size={16} className="text-emerald-600" />;
  if (status === 'failed') return <XCircle size={16} className="text-red-600" />;
  if (status === 'running') return <Loader2 size={16} className="text-blue-600 animate-spin" />;
  return <Circle size={16} className="text-gray-300" />;
}

export default function BuyerTransactionTestCenterClient() {
  const [mode, setMode] = useState<TestRunMode>('mock');
  const [run, setRun] = useState<TestRun | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh(runId: string) {
    const updated = await getTestRunAction(runId);
    setRun(updated);
  }

  async function handleStartRun() {
    setBusy('start');
    setError(null);
    try {
      const { runId } = await createTestRunAction(mode);
      await refresh(runId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleCreateTransaction() {
    if (!run) return;
    setBusy('create_transaction');
    setError(null);
    try {
      await createTestTransactionAction(run.runId);
      await refresh(run.runId);
    } catch (err) {
      setError((err as Error).message);
      await refresh(run.runId);
    } finally {
      setBusy(null);
    }
  }

  async function handleUploadDocument(document: BuiltInTestDocument) {
    if (!run) return;
    setBusy(`upload:${document}`);
    setError(null);
    try {
      const updated = await uploadTestDocumentAction(run.runId, document);
      setRun(updated);
    } catch (err) {
      setError((err as Error).message);
      await refresh(run.runId);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-gray-700">Test Mode</label>
          <div className="inline-flex rounded-md border border-gray-300 overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => setMode('mock')}
              disabled={!!run}
              className={cn('px-3 py-1.5', mode === 'mock' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50')}
            >
              Mock Test
            </button>
            <button
              type="button"
              onClick={() => setMode('real')}
              disabled={!!run}
              className={cn('px-3 py-1.5 border-l border-gray-300', mode === 'real' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50')}
            >
              Real Integration Test
            </button>
          </div>
          {!run && (
            <button
              type="button"
              onClick={handleStartRun}
              disabled={busy === 'start'}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-900 text-white text-xs font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              <PlayCircle size={14} /> Start Test Run
            </button>
          )}
        </div>
        {run && (
          <p className="text-xs text-gray-500">
            Run <span className="font-mono">{run.runId}</span> — mode: {run.mode}
          </p>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-md p-3">{error}</div>
      )}

      {run && (
        <>
          <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">Main Test Actions</h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleCreateTransaction}
                disabled={busy === 'create_transaction' || !!run.transactionId}
                className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-500 disabled:opacity-50"
              >
                {busy === 'create_transaction' ? 'Creating…' : run.transactionId ? 'Transaction Created' : 'Create Test Buyer Transaction'}
              </button>
              {BUILT_IN_DOCUMENTS.map((doc) => (
                <button
                  key={doc.value}
                  type="button"
                  onClick={() => handleUploadDocument(doc.value)}
                  disabled={!run.transactionId || busy === `upload:${doc.value}`}
                  className="px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
                >
                  {busy === `upload:${doc.value}` ? 'Uploading…' : `Upload ${doc.label}`}
                </button>
              ))}
            </div>
            {run.transactionId && (
              <p className="text-xs text-gray-500">
                Transaction ID: <span className="font-mono">{run.transactionId}</span>
              </p>
            )}
            {run.uploadLinkTokens.buyerAgent && (
              <p className="text-xs text-gray-500">
                Buyer Agent upload link token: <span className="font-mono">{run.uploadLinkTokens.buyerAgent}</span>
              </p>
            )}
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-2">
            <h2 className="text-sm font-semibold text-gray-900">Test Status Dashboard</h2>
            <ul className="space-y-1.5">
              {run.steps.map((step) => (
                <li key={step.key} className="flex items-start gap-2 text-xs">
                  <span className="mt-0.5"><StepIcon status={step.status} /></span>
                  <div>
                    <div className="text-gray-800">{step.label}</div>
                    {step.documentId && <div className="text-gray-400 font-mono">doc: {step.documentId}</div>}
                    {step.error && <div className="text-red-600">{step.error}</div>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
