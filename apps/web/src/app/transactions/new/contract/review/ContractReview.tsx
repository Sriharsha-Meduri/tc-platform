'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Users, DollarSign, Clock, FileCheck, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { VoidControls } from './VoidControls';
import { cn } from '@/lib/utils';
import { ComplianceBadge } from './review-shared';
import { apiGet, apiPost } from '@/lib/client-api';
import ContractDocumentTimeline from './ContractDocumentTimeline';
import { Step1Parties } from './steps/Step1Parties';
import { Step2Dates } from './steps/Step2Dates';
import { Step3Contingencies } from './steps/Step3Contingencies';
import { Step4Compliance } from './steps/Step4Compliance';
import { Step5Confirm, type PartyFields, type PartyPerson, type SellerPerson } from './steps/Step5Confirm';
import { validateContractPackage } from './contract-package-validation';
import type { ExtractionResult, ComplianceResult, ContractDocumentExtraction, ExtractionForm } from '../../extraction-result.types';
import type { FinalNegotiatedTerms } from '@tc/shared';

// ── Wizard step definitions ───────────────────────────────────────────────────

const ALL_STEPS = [
  { id: 1, label: 'Parties',       shortLabel: 'Parties',       icon: Users       },
  { id: 2, label: 'Dates & Terms', shortLabel: 'Dates',         icon: DollarSign  },
  { id: 3, label: 'Contingencies', shortLabel: 'Deadlines',     icon: Clock       },
  { id: 4, label: 'Compliance',    shortLabel: 'Compliance',    icon: FileCheck   },
  { id: 5, label: 'Confirm',       shortLabel: 'Confirm',       icon: CheckCircle },
];

// ── Main component ────────────────────────────────────────────────────────────

export default function ContractReview({ isDuplicate, isAgent, agentAccount }: { isDuplicate?: boolean; isAgent?: boolean; agentAccount?: { displayName: string; firstName: string | null; lastName: string | null; email: string } | null }) {
  const router = useRouter();
  // Draft sessions (seeded via /transactions/draft/[id]) hide the
  // Contingencies & Deadlines step — the draft has no counter-offer terms to
  // review. Read synchronously so the step bar is correct on first render.
  const [isDraftSession] = useState(() => {
    try {
      const stored = sessionStorage.getItem('tc_draft_session');
      if (!stored) return false;
      const parsed = JSON.parse(stored) as { fromDraft?: boolean };
      return parsed.fromDraft === true;
    } catch {
      return false;
    }
  });
  const steps = useMemo(
    () => (isDraftSession ? ALL_STEPS.filter((s) => s.id !== 3) : ALL_STEPS),
    [isDraftSession],
  );
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [compliance, setCompliance] = useState<ComplianceResult | null>(null);
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [reminderSchedule, setReminderSchedule] = useState<string[] | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingCompliance, setLoadingCompliance] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reuploadedExtraction, setReuploadedExtraction] = useState<ExtractionResult | null>(null);
  const [isReplacing, setIsReplacing] = useState(false);
  const [replaceError, setReplaceError] = useState<string | null>(null);
  const [contractDocuments, setContractDocuments] = useState<ContractDocumentExtraction[]>([]);
  const [contingencyFinalTerms, setContingencyFinalTerms] = useState<FinalNegotiatedTerms | null>(null);
  const [allDisclosureForms, setAllDisclosureForms] = useState<ExtractionForm[]>([]);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [dismissDuplicate, setDismissDuplicate] = useState(false);
  const [blockerOverridden, setBlockerOverridden] = useState(false);
  const [overridingBlockers, setOverridingBlockers] = useState(false);

  const packageValidation = useMemo(
    () => validateContractPackage(contractDocuments),
    [contractDocuments],
  );
  const canCalculateFinalTerms = packageValidation?.canCalculateFinalTerms ?? true;
  const canSendEmails = packageValidation?.canSendEmails ?? true;

  const [partyFields, setPartyFields] = useState<PartyFields>({
    buyers: [{ name: '', email: '' }],
    sellers: [{ name: '' }],
    buyerAgentName: '', buyerAgentEmail: '',
    sellerAgentName: '', sellerAgentEmail: '',
    sellerTcName: '', sellerTcEmail: '',
    titleContactName: '', titleCompanyName: '',
    titleEmail: '', titlePhone: '',
    escrowContactName: '', escrowJobTitle: '',
    escrowCompanyName: '', escrowEmail: '',
    escrowPhone: '',
    hwContactName: '', hwJobTitle: '',
    hwCompanyName: '', hwEmail: '',
    hwPhone: '',
  });

  useEffect(() => {
    apiGet('/reminders/schedule')
      .then((res) => res.ok ? res.json() : null)
      .then((data: { display: string[] } | null) => {
        if (data?.display?.length) setReminderSchedule(data.display);
      })
      .catch(() => {});
  }, []);

  // Load tc_draft_session from sessionStorage (set by ContractUpload or DraftLoaderPage)
  useEffect(() => {
    const stored = sessionStorage.getItem('tc_draft_session');
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as {
        transactionId: string;
        extractionResult: ExtractionResult;
        partiesCreated: number;
        compliance?: ComplianceResult;
        contractDocuments?: ContractDocumentExtraction[];
      };
      setTransactionId(parsed.transactionId);
      setResult(parsed.extractionResult);
      if (parsed.compliance) setCompliance(parsed.compliance);
      if (parsed.contractDocuments) setContractDocuments(parsed.contractDocuments);
      // Pre-populate step 5 fields from extraction
      const e = parsed.extractionResult;

      // Check for buyer agent info from the new transaction page
      let baName = e.parties.buyerAgents[0]?.fullName ?? '';
      let baEmail = e.parties.buyerAgents[0]?.email ?? '';

      if (isAgent && agentAccount) {
        baName = agentAccount.displayName;
        baEmail = agentAccount.email;
      } else {
        try {
          const baInfo = sessionStorage.getItem('tc_buyer_agent_info');
          if (baInfo) {
            const parsedBa = JSON.parse(baInfo) as { name: string; email: string };
            if (parsedBa.name) baName = parsedBa.name;
            if (parsedBa.email) baEmail = parsedBa.email;
          }
        } catch { /* ignore */ }
      }

      const extractedBuyers: PartyPerson[] = e.parties.buyers
        .filter((p) => p.fullName?.trim())
        .map((p) => ({ name: p.fullName ?? '', email: p.email ?? '' }));
      const extractedSellers: SellerPerson[] = e.parties.sellers
        .filter((p) => p.fullName?.trim())
        .map((p) => ({ name: p.fullName ?? '' }));

      setPartyFields({
        buyers:  extractedBuyers.length  ? extractedBuyers  : [{ name: '', email: '' }],
        sellers: extractedSellers.length ? extractedSellers : [{ name: '' }],
        buyerAgentName:  baName,
        buyerAgentEmail: baEmail,
        sellerAgentName:  e.parties.listingAgents[0]?.fullName  ?? '',
        sellerAgentEmail: e.parties.listingAgents[0]?.email     ?? '',
        sellerTcName: '',
        sellerTcEmail: '',
      });
    } catch {
      // malformed — stay on empty state
    }
  }, []);

  // Fallback: if sessionStorage had no compliance (e.g. pre-fix draft loader
  // cached in session), fetch it from the document's metadataJson.
  useEffect(() => {
    if (!transactionId || compliance) return;
    setLoadingCompliance(true);
    apiGet(`/transaction-documents/transaction/${transactionId}/active`)
      .then((res) => res.ok ? res.json() : null)
      .then((docs: unknown[] | null) => {
        if (!docs || docs.length === 0) return;
        const meta = (docs[0] as Record<string, unknown>)?.metadataJson as Record<string, unknown> | undefined;
        const stored = meta?.compliance as ComplianceResult | undefined;
        if (stored) setCompliance(stored);
      })
      .catch(() => {})
      .finally(() => setLoadingCompliance(false));
  }, [transactionId, compliance]);

  // Final Negotiated Terms (Contingencies & Disclosures) — the single
  // server-resolved source of truth for every contingency/disclosures/EMD
  // deadline, kept in sync with event seeding and the welcome/timeline
  // email. Re-fetched whenever a re-upload may have changed it.
  useEffect(() => {
    if (!transactionId) return;
    apiGet(`/transaction-documents/transaction/${transactionId}/active`)
      .then((res) => res.ok ? res.json() : null)
      .then((docs: unknown[] | null) => {
        if (!docs || docs.length === 0) return;
        for (const doc of docs) {
          const meta = (doc as Record<string, unknown>)?.metadataJson as Record<string, unknown> | undefined;
          const stored = meta?.contingencyFinalTerms as FinalNegotiatedTerms | undefined;
          if (stored) {
            setContingencyFinalTerms(stored);
            return;
          }
        }
      })
      .catch(() => {});
  }, [transactionId, reuploadedExtraction]);

  // Fallback: fetch contractDocuments from metadataJson when not in session
  // (e.g. page refresh, or draft loaded before contractDocuments existed).
  // Exclude SUPERSEDED documents to avoid picking stale extraction data.
  useEffect(() => {
    if (!transactionId || contractDocuments.length > 0) return;
    apiGet(`/transaction-documents/transaction/${transactionId}/active`)
      .then((res) => res.ok ? res.json() : null)
      .then((docs: unknown[] | null) => {
        if (!docs || docs.length === 0) return;
        const meta = (docs[0] as Record<string, unknown>)?.metadataJson as Record<string, unknown> | undefined;
        const stored = meta?.contractDocuments as ContractDocumentExtraction[] | undefined;
        if (stored && stored.length > 0) setContractDocuments(stored);
      })
      .catch(() => {});
  }, [transactionId, contractDocuments.length]);

  // Auto-fill default title/escrow/home-warranty contacts in background
  useEffect(() => {
    const fillDefaults = async () => {
      try {
        const [titleRes, escrowRes, hwRes] = await Promise.all([
          apiGet('/title-contacts'),
          apiGet('/escrow-contacts'),
          apiGet('/home-warranty-contacts'),
        ]);

        if (titleRes.ok) {
          const list = await titleRes.json() as Array<{ contactName: string; companyName: string; email: string; cellPhone: string; isDefault: boolean }>;
          const def = list.find((c) => c.isDefault);
          if (def) {
            setPartyFields((p) => ({
              ...p,
              titleContactName: p.titleContactName || def.contactName,
              titleCompanyName: p.titleCompanyName || def.companyName,
              titleEmail: p.titleEmail || def.email,
              titlePhone: p.titlePhone || def.cellPhone,
            }));
          }
        }

        if (escrowRes.ok) {
          const list = await escrowRes.json() as Array<{ contactName: string; jobTitle: string | null; companyName: string; email: string; cellPhone: string; isDefault: boolean }>;
          const def = list.find((c) => c.isDefault);
          if (def) {
            setPartyFields((p) => ({
              ...p,
              escrowContactName: p.escrowContactName || def.contactName,
              escrowJobTitle: p.escrowJobTitle || (def.jobTitle ?? ''),
              escrowCompanyName: p.escrowCompanyName || def.companyName,
              escrowEmail: p.escrowEmail || def.email,
              escrowPhone: p.escrowPhone || def.cellPhone,
            }));
          }
        }

        if (hwRes.ok) {
          const list = await hwRes.json() as Array<{ contactName: string; companyName: string; email: string; officePhone: string | null; isDefault: boolean }>;
          const def = list.find((c) => c.isDefault);
          if (def) {
            setPartyFields((p) => ({
              ...p,
              hwContactName: p.hwContactName || def.contactName,
              hwCompanyName: p.hwCompanyName || def.companyName,
              hwEmail: p.hwEmail || def.email,
              hwPhone: p.hwPhone || (def.officePhone ?? ''),
            }));
          }
        }
      } catch {
        // silently ignore — contacts are optional
      }
    };
    fillDefaults();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Merge formsAndDisclosures across all uploaded documents (unique by formCode)
  function mergeFormsFromDocuments(docs: unknown[]): ExtractionForm[] {
    const byCode = new Map<string, ExtractionForm>();
    const STATUS_RANK: Record<string, number> = { attached: 0, referenced: 1, missing: 2 };
    for (const doc of docs) {
      const meta = (doc as Record<string, unknown>)?.metadataJson as Record<string, unknown> | undefined;
      if (!meta) continue;
      // Prefer full extraction formsAndDisclosures if available
      const extraction = meta.extraction as Record<string, unknown> | undefined;
      const forms = extraction?.formsAndDisclosures as ExtractionForm[] | undefined;
      if (forms) {
        for (const f of forms) {
          if (!f.formCode) continue;
          const existing = byCode.get(f.formCode);
          const currentRank = STATUS_RANK[f.status] ?? 3;
          const existingRank = existing ? (STATUS_RANK[existing.status] ?? 3) : 99;
          if (!existing || currentRank < existingRank) {
            byCode.set(f.formCode, f);
          }
        }
      }
      // Fallback: create synthetic entry from detectedFormCode
      const detectedCode = meta.detectedFormCode as string | undefined;
      if (detectedCode && !byCode.has(detectedCode)) {
        byCode.set(detectedCode, { title: detectedCode, formCode: detectedCode, status: 'attached', confidence: null });
      }
    }
    return Array.from(byCode.values());
  }

  const fetchAndMergeForms = useCallback(async () => {
    if (!transactionId) return;
    try {
      const res = await apiGet(`/transaction-documents/transaction/${transactionId}/active`);
      if (!res.ok) return;
      const docs: unknown[] = await res.json() as unknown[];
      if (!docs || docs.length === 0) return;
      setAllDisclosureForms(mergeFormsFromDocuments(docs));
    } catch {
      // silently ignore fetch errors
    }
  }, [transactionId]);

  // Fetch all forms on mount when transactionId is available
  useEffect(() => {
    fetchAndMergeForms();
  }, [fetchAndMergeForms]);

  async function handleReupload(file: File): Promise<{ extraction: ExtractionResult; compliance: ComplianceResult } | null> {
    if (!transactionId) return null;
    const form = new FormData();
    form.append('file', file);
    form.append('transactionId', transactionId);
    form.append('stage', 'contract');

    const res = await apiPost('/document-extraction/upload-and-extract', form);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Re-upload failed' })) as { message?: string };
      throw new Error(err.message ?? 'Re-upload failed');
    }
    const data = await res.json() as {
      extraction: ExtractionResult;
      compliance: ComplianceResult;
    };
    setResult(data.extraction);
    setCompliance(data.compliance);
    setReuploadedExtraction(data.extraction);
    // Re-fetch all forms to include the newly uploaded document
    fetchAndMergeForms();
    return data;
  }

  async function handleReplace() {
    if (!transactionId) return;
    const stored = sessionStorage.getItem('tc_draft_session');
    if (!stored) return;
    const parsed = JSON.parse(stored) as {
      organizationId?: string;
      accountId?: string;
      extractionResult: ExtractionResult;
      compliance?: ComplianceResult;
    };
    if (!parsed.organizationId || !parsed.accountId) return;

    setIsReplacing(true);
    setReplaceError(null);
    try {
      const res = await apiPost(`/document-extraction/replace-draft/${transactionId}`, {
        extractionResult: parsed.extractionResult,
        compliance: parsed.compliance ?? null,
        organizationId: parsed.organizationId,
        createdByAccountId: parsed.accountId,
        contractDocuments,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(body.message ?? `Replace failed — server error ${res.status}`);
      }
      const data = await res.json() as {
        transaction: { id: string };
        extractionResult: ExtractionResult;
        compliance: ComplianceResult;
      };

      // Update session with the new transaction ID — preserve contractDocuments
      sessionStorage.setItem('tc_draft_session', JSON.stringify({
        transactionId: data.transaction.id,
        extractionResult: data.extractionResult,
        partiesCreated: 0,
        compliance: data.compliance,
        contractDocuments,
      }));

      // Reload page — banner disappears, user stays on wizard with fresh draft
      window.location.href = '/transactions/new/contract/review';
    } catch (err) {
      setReplaceError(err instanceof Error ? err.message : 'Replace failed');
      setIsReplacing(false);
    }
  }

  async function handleKeepExisting() {
    if (!transactionId) return;
    setIsLoadingStatus(true);
    try {
      const res = await apiGet(`/transactions/${transactionId}`);
      if (!res.ok) {
        const err = (await res.json().catch(() => ({})) as { message?: string });
        throw new Error(err.message ?? 'Failed to load transaction');
      }
      const tx = (await res.json()) as { status: string };
      if (tx.status === 'draft') {
        setDismissDuplicate(true);
        setStep(steps.length - 1);
      } else {
        // ACTIVE+ — go to dashboard stages view
        router.push(`/dashboard/transactions/${transactionId}?hideMeta=1`);
      }
    } catch (err) {
      setReplaceError(err instanceof Error ? err.message : 'Failed to load transaction');
    } finally {
      setIsLoadingStatus(false);
    }
  }

  async function handleSubmit() {
    if (!transactionId) return;
    if (partyFields.buyers.some((b) => !b.name.trim() || !b.email.trim())) {
      setSubmitError('Every buyer needs a name and email.');
      return;
    }
    if (partyFields.sellers.some((s) => !s.name.trim())) {
      setSubmitError('Every seller needs a name.');
      return;
    }
    if (!isAgent && (!partyFields.buyerAgentName.trim() || !partyFields.buyerAgentEmail.trim())) {
      setSubmitError('Buyer agent name and email are required.');
      return;
    }
    if (!partyFields.sellerAgentName.trim() || !partyFields.sellerAgentEmail.trim()) {
      setSubmitError('Seller agent name and email are required.');
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await apiPost(`/transactions/${transactionId}/submit-contract`, {
        buyers:  partyFields.buyers.map((b) => ({ name: b.name.trim(), email: b.email.trim() })),
        sellers: partyFields.sellers.map((s) => ({ name: s.name.trim() })),
        buyerAgentName:  partyFields.buyerAgentName.trim(),
        buyerAgentEmail: partyFields.buyerAgentEmail.trim(),
        sellerAgentName:  partyFields.sellerAgentName.trim(),
        sellerAgentEmail: partyFields.sellerAgentEmail.trim(),
        sellerTcName:  partyFields.sellerTcName.trim()  || null,
        sellerTcEmail: partyFields.sellerTcEmail.trim() || null,
        titleContactName: partyFields.titleContactName?.trim() || null,
        titleCompanyName: partyFields.titleCompanyName?.trim() || null,
        titleEmail: partyFields.titleEmail?.trim() || null,
        titlePhone: partyFields.titlePhone?.trim() || null,
        escrowContactName: partyFields.escrowContactName?.trim() || null,
        escrowJobTitle: partyFields.escrowJobTitle?.trim() || null,
        escrowCompanyName: partyFields.escrowCompanyName?.trim() || null,
        escrowEmail: partyFields.escrowEmail?.trim() || null,
        escrowPhone: partyFields.escrowPhone?.trim() || null,
        hwContactName: partyFields.hwContactName?.trim() || null,
        hwJobTitle: partyFields.hwJobTitle?.trim() || null,
        hwCompanyName: partyFields.hwCompanyName?.trim() || null,
        hwEmail: partyFields.hwEmail?.trim() || null,
        hwPhone: partyFields.hwPhone?.trim() || null,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string; code?: string };
        const msg = body.message ?? `Server error ${res.status}`;
        if (body.code === 'BUYER_AGENT_NOT_FOUND') {
          setSubmitError(msg);
        } else {
          throw new Error(msg);
        }
        setIsSubmitting(false);
        return;
      }
      sessionStorage.removeItem('tc_draft_session');
      router.push(`/dashboard/transactions/${transactionId}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed — please try again.');
      setIsSubmitting(false);
    }
  }

  async function handleOverrideBlockers() {
    if (!transactionId) return;
    setOverridingBlockers(true);
    try {
      const res = await apiPost(`/transactions/${transactionId}/override-blockers`, {});
      if (!res.ok) throw new Error('Override failed');
      setBlockerOverridden(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Override failed');
    } finally {
      setOverridingBlockers(false);
    }
  }

  function updateBuyer(index: number, field: keyof PartyPerson, value: string) {
    setPartyFields((p) => ({
      ...p,
      buyers: p.buyers.map((b, i) => (i === index ? { ...b, [field]: value } : b)),
    }));
    setSubmitError(null);
  }
  function addBuyer() {
    setPartyFields((p) => ({ ...p, buyers: [...p.buyers, { name: '', email: '' }] }));
  }
  function removeBuyer(index: number) {
    setPartyFields((p) => ({ ...p, buyers: p.buyers.filter((_, i) => i !== index) }));
  }
  function updateSeller(index: number, field: keyof SellerPerson, value: string) {
    setPartyFields((p) => ({
      ...p,
      sellers: p.sellers.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    }));
    setSubmitError(null);
  }
  function addSeller() {
    setPartyFields((p) => ({ ...p, sellers: [...p.sellers, { name: '' }] }));
  }
  function removeSeller(index: number) {
    setPartyFields((p) => ({ ...p, sellers: p.sellers.filter((_, i) => i !== index) }));
  }

  if (!result) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">No extraction data found.</p>
          <Link href="/transactions/new/contract" className="text-blue-700 hover:underline text-sm">
            Go back and upload documents
          </Link>
        </div>
      </div>
    );
  }

  const isAcroForm = compliance?.sourceType === 'acroform';
  const propertyAddress = result.property
    ? [result.property.streetAddress, result.property.city, result.property.state]
        .filter(Boolean).join(', ')
    : '';

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 h-14 flex items-center px-6 gap-4 sticky top-0 z-20">
        <Link
          href="/transactions/new/contract"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft size={15} />
          Back
        </Link>
        <div className="w-px h-5 bg-gray-200" />
        <div className="w-7 h-7 rounded-lg bg-blue-700 flex items-center justify-center shrink-0">
          <span className="text-white text-xs font-bold">TC</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {propertyAddress || 'Review Contract'}
          </p>
        </div>
        {compliance && <ComplianceBadge summary={compliance.summary} />}
      </header>

      {/* ── Duplicate warning banner ─────────────────────────────────────────*/}
      {isDuplicate && !dismissDuplicate && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3">
          <div className="max-w-5xl mx-auto flex items-start gap-3">
            <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-600" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-900">
                A draft for this property already exists
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Do you want to replace it with the newly uploaded contract? The new extraction data is shown below. &ldquo;Replace&rdquo; will void the existing draft and create a new one from this data.
              </p>
              {replaceError && (
                <p className="text-xs text-red-700 mt-2">{replaceError}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleReplace}
                disabled={isReplacing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isReplacing ? (
                  <><Loader2 size={13} className="animate-spin" /> Replacing…</>
                ) : (
                  'Replace'
                )}
              </button>
              <button
                type="button"
                onClick={handleKeepExisting}
                disabled={isLoadingStatus}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-amber-300 text-amber-800 text-xs font-medium rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isLoadingStatus ? (
                  <><Loader2 size={13} className="animate-spin" /> Loading…</>
                ) : (
                  'Keep Existing'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step progress bar ──────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-100 px-6 py-2">
        <div className="max-w-5xl mx-auto flex items-center gap-0">
          {steps.map((s, i) => {
            const Icon = s.icon;
            const isActive    = step === i;
            const isCompleted = step > i;
            const isLast      = i === steps.length - 1;

            return (
              <div key={s.id} className="flex items-center flex-1 last:flex-none">
                <button
                  type="button"
                  onClick={() => isCompleted && setStep(i)}
                  disabled={!isCompleted}
                  className={cn(
                    'flex items-center gap-2 text-xs font-medium px-2 py-1 rounded-lg transition-colors',
                    isActive    ? 'text-blue-700' : '',
                    isCompleted ? 'text-gray-600 hover:text-blue-700 cursor-pointer' : 'text-gray-400 cursor-default',
                  )}
                >
                  <span className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 shrink-0',
                    isActive    ? 'border-blue-700 bg-blue-700 text-white' :
                    isCompleted ? 'border-green-500 bg-green-500 text-white' :
                                  'border-gray-300 text-gray-400',
                  )}>
                    {isCompleted ? <Icon size={11} /> : i + 1}
                  </span>
                  <span className="hidden sm:inline">{s.shortLabel}</span>
                </button>
                {!isLast && (
                  <div className={cn(
                    'flex-1 h-0.5 mx-1',
                    isCompleted ? 'bg-green-400' : 'bg-gray-200',
                  )} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Contract document timeline ───────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-6 pt-3">
        <ContractDocumentTimeline
          contractDocuments={contractDocuments}
          validationIssues={packageValidation?.issues}
          canCalculateFinalTerms={canCalculateFinalTerms}
        />
      </div>

      {/* ── Step content ──────────────────────────────────────────────────── */}
      <main className="max-w-5xl mx-auto px-6 py-4">
        {step === 0 && <Step1Parties result={result} isAcroForm={isAcroForm} />}
        {step === 1 && <Step2Dates result={result} isAcroForm={isAcroForm} />}
        {!isDraftSession && step === 2 && <Step3Contingencies result={result} reminderSchedule={reminderSchedule} finalTerms={contingencyFinalTerms} />}
        {step === (isDraftSession ? 2 : 3) && <Step4Compliance result={reuploadedExtraction ?? result} compliance={compliance} transactionId={transactionId} onReupload={handleReupload} allForms={allDisclosureForms.length > 0 ? allDisclosureForms : undefined} />}
        {step === steps.length - 1 && (
          <Step5Confirm
            result={result}
            fields={partyFields}
            onChange={(key, val) => { setPartyFields((p) => ({ ...p, [key]: val })); setSubmitError(null); }}
            onBuyerChange={updateBuyer}
            onAddBuyer={addBuyer}
            onRemoveBuyer={removeBuyer}
            onSellerChange={updateSeller}
            onAddSeller={addSeller}
            onRemoveSeller={removeSeller}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            loadingCompliance={loadingCompliance}
            error={submitError}
            onBack={() => setStep((s) => Math.max(0, s - 1))}
            transactionId={transactionId}
            compliance={compliance}
            onVoided={() => router.push('/dashboard')}
            canSendEmails={canSendEmails}
            isAgent={isAgent}
            blockerOverridden={blockerOverridden}
            onOverrideBlockers={handleOverrideBlockers}
            overridingBlockers={overridingBlockers}
          />
        )}

        {/* ── Step navigation footer ───────────────────────────────────────── */}
        {step < steps.length - 1 && (
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
                className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ArrowLeft size={14} />
                Back
              </button>
              <VoidControls
                transactionId={transactionId}
                result={result}
                compliance={compliance}
                onVoided={() => router.push('/dashboard')}
              />
            </div>
            <span className="text-xs text-gray-400">Step {step + 1} of {steps.length}</span>
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
              disabled={!transactionId}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
              <ArrowRight size={14} />
            </button>
          </div>
        )}

      </main>
    </div>
  );
}
