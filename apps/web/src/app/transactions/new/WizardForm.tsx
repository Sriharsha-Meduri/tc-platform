'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MeResponseDto } from '@tc/shared';
import Step1Parties, { type Step1Data, emptyStep1 } from './steps/Step1Parties';
import Step2FormChecklist, { type Step2Data } from './steps/Step2FormChecklist';

// ── Wizard shape ──────────────────────────────────────────────────────────────

export interface WizardData {
  step1: Step1Data;
  step2: Step2Data;
}

const STEPS = [
  { id: 1, label: 'Parties & Property' },
  { id: 2, label: 'Form Checklist' },
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  session: MeResponseDto;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function WizardForm({ session }: Props) {
  const { account, user } = session;

  const [currentStep, setCurrentStep] = useState(1);
  const [data, setData] = useState<WizardData>(() => ({
    step1: emptyStep1(
      account?.firstName ?? undefined,
      account?.lastName  ?? undefined,
      user.email,
      user.phone ?? undefined,
    ),
    step2: { templateId: null, templateName: null, selectedForms: [] },
  }));
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateStep1(patch: Partial<Step1Data>) {
    setData((prev) => ({ ...prev, step1: { ...prev.step1, ...patch } }));
  }

  function updateStep2(patch: Partial<Step2Data>) {
    setData((prev) => ({ ...prev, step2: { ...prev.step2, ...patch } }));
  }

  async function handleSubmit() {
    setIsSubmitting(true);
    // TODO: wire to POST /api/v1/transactions
    console.log('Creating transaction:', data);
    await new Promise((r) => setTimeout(r, 600)); // temp delay for UX
    setSubmitted(true);
  }

  // ── Success screen ────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 max-w-md w-full text-center">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
            <Check size={28} className="text-green-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Transaction Created!</h2>
          <p className="text-sm text-gray-500 mb-2">
            Your transaction draft has been set up with{' '}
            <span className="font-semibold text-gray-700">
              {data.step2.selectedForms.length} forms
            </span>{' '}
            in the checklist.
          </p>
          {data.step2.templateName && (
            <p className="text-xs text-gray-400 mb-7">Template: {data.step2.templateName}</p>
          )}
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // ── Wizard layout ─────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-200 h-14 flex items-center px-6 gap-4">
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft size={15} />
          Dashboard
        </Link>
        <div className="w-px h-5 bg-gray-200" />
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-700 flex items-center justify-center">
            <span className="text-white text-xs font-bold">TC</span>
          </div>
          <span className="text-sm font-semibold text-gray-900">New Transaction — Manual Entry</span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Step indicator */}
        <div className="flex items-center gap-0 mb-8">
          {STEPS.map((step, idx) => {
            const isCompleted = currentStep > step.id;
            const isActive = currentStep === step.id;
            return (
              <div key={step.id} className="flex items-center flex-1 last:flex-none">
                <div className="flex items-center gap-2.5 shrink-0">
                  <div
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors',
                      isCompleted
                        ? 'bg-blue-700 border-blue-700 text-white'
                        : isActive
                          ? 'bg-white border-blue-700 text-blue-700'
                          : 'bg-white border-gray-300 text-gray-400',
                    )}
                  >
                    {isCompleted ? <Check size={14} /> : step.id}
                  </div>
                  <span className={cn(
                    'text-sm font-medium hidden sm:block',
                    isActive ? 'text-gray-900' : isCompleted ? 'text-blue-700' : 'text-gray-400',
                  )}>
                    {step.label}
                  </span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={cn(
                    'flex-1 h-0.5 mx-4 transition-colors',
                    isCompleted ? 'bg-blue-700' : 'bg-gray-200',
                  )} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {currentStep === 1 && (
            <Step1Parties data={data.step1} onChange={updateStep1} />
          )}
          {currentStep === 2 && (
            <Step2FormChecklist
              stateCode={data.step1.property.state || 'CA'}
              transactionType={data.step1.property.transactionType}
              side={data.step1.side}
              data={data.step2}
              onChange={updateStep2}
            />
          )}

          {/* Footer nav */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-white">
            <button
              type="button"
              onClick={() => setCurrentStep((s) => s - 1)}
              disabled={currentStep === 1}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ArrowLeft size={15} />
              Back
            </button>

            <div className="flex items-center gap-3">
              {currentStep === 2 && (
                <p className="text-xs text-gray-400">
                  {data.step2.selectedForms.length} form{data.step2.selectedForms.length !== 1 ? 's' : ''} selected
                </p>
              )}
              {currentStep < STEPS.length ? (
                <button
                  type="button"
                  onClick={() => setCurrentStep((s) => s + 1)}
                  className="flex items-center gap-2 px-5 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Next
                  <ArrowRight size={15} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-5 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Creating…
                    </>
                  ) : (
                    <>
                      <Check size={15} />
                      Create Transaction
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
