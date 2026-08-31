'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, AlertCircle, FileSignature, CheckCircle, User, ChevronRight, ArrowLeft, Send, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DocumentAnalysis, RecipientRole } from '@/lib/docusign-field.types';

/* ── Status helpers ───────────────────────────────────────── */

function statusConfig(status: string) {
  switch (status) {
    case 'complete':
      return { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', label: 'Complete' };
    case 'missing_signatures':
      return { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', label: 'Missing Signatures' };
    case 'missing_initials':
      return { icon: AlertCircle, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200', label: 'Missing Initials' };
    case 'missing_dates':
      return { icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', label: 'Missing Dates' };
    case 'missing_fields':
      return { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', label: 'Missing Fields' };
    case 'needs_review':
      return { icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', label: 'Review Required' };
    default:
      return { icon: AlertCircle, color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200', label: 'Unknown' };
  }
}

function buildMissingSummary(analysis: DocumentAnalysis): string {
  if (analysis.fields.length === 0) return 'All required signatures present';

  const parts: string[] = [];
  const sigRoles = new Set(analysis.fields.filter((f) => f.fieldType === 'signature').map((f) => f.recommendedRecipientRole));
  const initPages = analysis.fields.filter((f) => f.fieldType === 'initials').map((f) => f.pageNumber);
  const dateRoles = new Set(analysis.fields.filter((f) => f.fieldType === 'date').map((f) => f.recommendedRecipientRole));
  const nameFields = analysis.fields.filter((f) => f.fieldType === 'name');

  if (sigRoles.size > 0) {
    const labels = [...sigRoles].map((r) => r === 'buyer' ? 'Buyer' : r === 'seller' ? 'Seller' : r === 'buyer_agent' ? 'Buyer Agent' : 'Seller Agent');
    parts.push(`${labels.join('/')} Signature${sigRoles.size > 1 ? 's' : ''} Missing`);
  }
  if (initPages.length > 0) {
    const unique = [...new Set(initPages)];
    parts.push(`Initials Missing on Page${unique.length > 1 ? 's' : ''} ${unique.join(', ')}`);
  }
  if (dateRoles.size > 0) {
    const labels = [...dateRoles].map((r) => r === 'buyer' ? 'Buyer' : r === 'seller' ? 'Seller' : r === 'buyer_agent' ? 'Buyer Agent' : 'Seller Agent');
    parts.push(`${labels.join('/')} Date Missing`);
  }
  if (nameFields.length > 0) {
    parts.push(`Name${nameFields.length > 1 ? 's' : ''} Missing`);
  }
  if (parts.length === 0 && analysis.fields.length > 0) {
    parts.push(`${analysis.fields.length} field${analysis.fields.length > 1 ? 's' : ''} need attention`);
  }

  return parts.join(' — ');
}

const ROLE_LABELS: Record<string, string> = {
  buyer: 'Buyer',
  seller: 'Seller',
  buyer_agent: 'Buyer Agent',
  seller_agent: 'Seller Agent',
};

/* ── Props ────────────────────────────────────────────────── */

interface Props {
  open: boolean;
  onClose: () => void;
  transactionId: string;
  documentAnalyses: DocumentAnalysis[];
  loadingAnalysis: boolean;
  analysisError: string | null;
  recipients: RecipientRole[];
  emailSubject: string;
  emailBody: string;
  onSend: (selectedDocIds: string[], signers: Array<{ name: string; email: string; role: string }>) => Promise<void>;
  sending: boolean;
  sendError: string | null;
  sent: boolean;
}

type Step = 'select' | 'review' | 'sent';

export default function DocuSignFieldWorkflow({
  open,
  onClose,
  documentAnalyses,
  loadingAnalysis,
  analysisError,
  recipients,
  emailSubject,
  emailBody,
  onSend,
  sending,
  sendError,
  sent,
}: Props) {
  const [step, setStep] = useState<Step>('select');
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      setStep('select');
      // Select all docs by default
      setSelectedDocIds(new Set(documentAnalyses.map((a) => a.documentId)));
    }
  }, [open, documentAnalyses]);

  const toggleDoc = (docId: string) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const handleNext = () => {
    setStep('review');
  };

  const handleSend = async () => {
    const signers = recipients.map((r) => ({
      name: r.name,
      email: r.email,
      role: r.role,
    }));
    await onSend([...selectedDocIds], signers);
    if (!sendError) setStep('sent');
  };

  const selectedAnalyses = documentAnalyses.filter((a) => selectedDocIds.has(a.documentId));
  const totalMissingRequired = selectedAnalyses.reduce((s, a) => s + a.missingRequired, 0);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white shadow-2xl mx-4">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 rounded-full p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors z-10"
        >
          <X size={20} />
        </button>

        {/* Header */}
        <div className="flex items-center gap-2 p-6 pb-4 border-b border-gray-100">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <FileSignature size={20} className="text-blue-700" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">Send via DocuSign</h3>
            <p className="text-sm text-gray-500">
              {step === 'select' && 'Select documents to send for signature'}
              {step === 'review' && 'Review recipients and confirm'}
              {step === 'sent' && 'Documents sent for signature'}
            </p>
          </div>
        </div>

        {/* Loading */}
        {loadingAnalysis && (
          <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm">Analyzing documents...</span>
          </div>
        )}

        {/* Error */}
        {analysisError && (
          <div className="mx-6 mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 flex items-start gap-2">
            <AlertCircle size={16} className="text-red-600 mt-0.5 shrink-0" />
            <p className="text-sm text-red-800">{analysisError}</p>
          </div>
        )}

        {/* Step 1: Select Documents */}
        {step === 'select' && !loadingAnalysis && (
          <div className="p-6 space-y-4">
            {documentAnalyses.length === 0 && !loadingAnalysis ? (
              <p className="text-sm text-gray-400 py-4 text-center">No documents available. Upload documents first.</p>
            ) : (
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700">Documents to Send</label>
                <p className="text-xs text-gray-400 -mt-1">Select the documents you want to include in the DocuSign envelope.</p>

                {documentAnalyses.map((analysis) => {
                  const config = statusConfig(analysis.status);
                  const Icon = config.icon;
                  const checked = selectedDocIds.has(analysis.documentId);

                  return (
                    <label
                      key={analysis.documentId}
                      className={cn(
                        'flex items-start gap-3 px-4 py-3 rounded-lg border transition-colors cursor-pointer',
                        checked
                          ? 'bg-blue-50 border-blue-200'
                          : 'bg-white border-gray-200 hover:bg-gray-50',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleDoc(analysis.documentId)}
                        className="mt-0.5 rounded border-gray-300 text-blue-700 focus:ring-blue-500"
                      />
                      <FileText size={16} className="text-gray-400 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-800">{analysis.formCode}</span>
                          <span className="text-xs text-gray-500">{analysis.formName}</span>
                        </div>
                        <p className="text-xs text-gray-600 mt-0.5">{buildMissingSummary(analysis)}</p>
                      </div>
                      <span className={cn(
                        'text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0',
                        config.bg, config.color, config.border,
                      )}>
                        <Icon size={10} className="inline mr-1" />
                        {config.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            {/* Status summary */}
            {documentAnalyses.length > 0 && (
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-400">Documents</span>
                    <p className="text-gray-900 font-semibold">
                      {selectedDocIds.size} of {documentAnalyses.length} selected
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-400">Missing Fields</span>
                    <p className={cn('font-semibold', totalMissingRequired > 0 ? 'text-red-700' : 'text-green-700')}>
                      {totalMissingRequired > 0 ? `${totalMissingRequired} required` : 'None'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={handleNext}
                disabled={selectedDocIds.size === 0 || loadingAnalysis}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-800 disabled:opacity-50 transition-colors"
              >
                Next
                <ChevronRight size={14} />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Review Recipients */}
        {step === 'review' && (
          <div className="p-6 space-y-4">
            {/* Selected documents summary */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Documents to Send ({selectedDocIds.size})</label>
              <div className="space-y-1.5">
                {selectedAnalyses.map((analysis) => {
                  const config = statusConfig(analysis.status);
                  return (
                    <div
                      key={analysis.documentId}
                      className={cn('flex items-center justify-between px-3 py-2 rounded-lg border', config.border, config.bg)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText size={14} className="text-gray-400 shrink-0" />
                        <span className="text-sm font-medium text-gray-800">{analysis.formCode}</span>
                      </div>
                      <span className={cn('text-[10px] font-medium', config.color)}>{config.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recipients */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Recipients
                <span className="text-xs font-normal text-gray-400 ml-1">— auto-assigned from transaction parties</span>
              </label>

              {recipients.length === 0 ? (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
                  <p className="text-sm text-amber-800">No recipients found.</p>
                  <p className="text-xs text-amber-600 mt-1">
                    Please add buyers, sellers, or agents to this transaction before sending.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {recipients.map((r) => {
                    const recipientFields = selectedAnalyses.reduce((sum, analysis) => {
                      const fields = analysis.fields.filter((f) => {
                        const role = r.partyRole || r.role;
                        return f.recommendedRecipientRole === role
                          || f.recommendedRecipientRole
                            .replace('_agent', '')
                            .replace('buyer', 'buyer')
                            .replace('seller', 'seller') === role;
                      });
                      return sum + fields.length;
                    }, 0);

                    const match = selectedAnalyses.some((a) =>
                      a.fields.some((f) => f.recommendedRecipientRole === (r.partyRole || r.role)),
                    );

                    return (
                      <div
                        key={r.recipientId || r.email}
                        className={cn(
                          'flex items-center justify-between px-3 py-2.5 rounded-lg border',
                          match ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200',
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <User size={14} className={match ? 'text-blue-600' : 'text-gray-400'} />
                          <div>
                            <p className="text-sm font-medium text-gray-800">{r.name}</p>
                            <p className="text-[11px] text-gray-500">{r.email}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={cn(
                            'text-[10px] font-semibold px-2 py-0.5 rounded-full',
                            match ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500',
                          )}>
                            {ROLE_LABELS[r.partyRole || r.role] || r.role || 'Signer'}
                          </span>
                          {match && (
                            <p className="text-[10px] text-blue-600 mt-0.5">
                              {recipientFields} field{recipientFields !== 1 ? 's' : ''} to complete
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Email subject preview */}
            <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1">Email Subject</p>
              <p className="text-sm text-gray-700">{emailSubject}</p>
            </div>

            {/* Send error */}
            {sendError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 flex items-start gap-2">
                <AlertCircle size={16} className="text-red-600 mt-0.5 shrink-0" />
                <p className="text-sm text-red-800">{sendError}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setStep('select')}
                disabled={sending}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                <ArrowLeft size={14} className="inline mr-1" />
                Back
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || recipients.length === 0}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-800 disabled:opacity-50 transition-colors"
              >
                {sending ? (
                  <><Loader2 size={14} className="animate-spin" /> Sending...</>
                ) : (
                  <><Send size={14} /> Send for Signature</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Sent */}
        {step === 'sent' && (
          <div className="p-6 space-y-5">
            <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-4 flex items-start gap-3">
              <CheckCircle size={20} className="text-green-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-800">Documents sent for signature!</p>
                <p className="text-xs text-green-600 mt-1">
                  {totalMissingRequired > 0
                    ? `Recipients will be guided through ${totalMissingRequired} field${totalMissingRequired > 1 ? 's' : ''} that need${totalMissingRequired === 1 ? 's' : ''} to be completed across ${selectedDocIds.size} document${selectedDocIds.size !== 1 ? 's' : ''}.`
                    : `Recipients will receive an email to review and sign ${selectedDocIds.size} document${selectedDocIds.size !== 1 ? 's' : ''}.`
                  }
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-full inline-flex items-center justify-center rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-800 transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
