'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000') + '/admin/testing/buyer-transaction';

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function authedFetch(path: string, init?: RequestInit) {
  const token = (await cookies()).get('tc_token')?.value;
  if (!token) redirect('/admin-login');
  const res = await fetch(`${API_URL}${path}`, { ...init, headers: { ...authHeaders(token), ...init?.headers } });
  if (res.status === 401 || res.status === 403) redirect('/admin-login');
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Admin Test Center API error: ${res.status} — ${body}`);
  }
  return res.json();
}

export type TestRunMode = 'mock' | 'real';
export type TestStepStatus = 'pending' | 'running' | 'passed' | 'failed';

export interface TestRunStep {
  key: string;
  label: string;
  status: TestStepStatus;
  startedAt?: string;
  completedAt?: string;
  documentId?: string;
  emailId?: string;
  uploadLinkId?: string;
  envelopeId?: string;
  detail?: string;
  error?: string;
}

export interface TestRun {
  runId: string;
  mode: TestRunMode;
  accountId: string;
  organizationId: string;
  transactionId: string | null;
  uploadLinkTokens: Partial<Record<'buyerAgent' | 'sellerAgent' | 'broker' | 'escrow', string>>;
  steps: TestRunStep[];
  overallStatus: 'running' | 'passed' | 'failed';
  progressVersion: number;
  createdAt: string;
  updatedAt: string;
}

export async function createTestRunAction(mode: TestRunMode): Promise<{ runId: string }> {
  return authedFetch('/runs', { method: 'POST', body: JSON.stringify({ mode }) });
}

export async function getTestRunAction(runId: string): Promise<TestRun> {
  return authedFetch(`/runs/${runId}`);
}

export async function createTestTransactionAction(runId: string): Promise<{ transactionId: string }> {
  return authedFetch(`/runs/${runId}/create-transaction`, { method: 'POST', body: JSON.stringify({}) });
}

export type BuiltInTestDocument = 'rpa_valid' | 'rpa_missing_price' | 'sco_bco_counter_offer' | 'smco_valid';

export async function uploadTestDocumentAction(runId: string, document: BuiltInTestDocument): Promise<TestRun> {
  return authedFetch(`/runs/${runId}/upload-document`, { method: 'POST', body: JSON.stringify({ document }) });
}
