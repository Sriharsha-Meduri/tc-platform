'use client';

import { Users, CheckCircle, AlertCircle, Loader2, ArrowLeft, ArrowRight, FileText, ShieldCheck, AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StepCard, StepCardHeader, StepCardBody, SectionDivider, fmtDate } from '../review-shared';
import { VoidControls } from '../VoidControls';
import type { ExtractionResult, ComplianceResult } from '../../../extraction-result.types';

export interface PartyPerson {
  name:  string;
  email: string;
}

export interface SellerPerson {
  name: string;
}

export interface PartyFields {
  buyers:  PartyPerson[];
  sellers: SellerPerson[];
  buyerAgentName:  string;
  buyerAgentEmail: string;
  sellerAgentName:  string;
  sellerAgentEmail: string;
  sellerTcName:  string;
  sellerTcEmail: string;
  titleContactName?: string;
  titleCompanyName?: string;
  titleEmail?: string;
  titlePhone?: string;
  escrowContactName?: string;
  escrowJobTitle?: string;
  escrowCompanyName?: string;
  escrowEmail?: string;
  escrowPhone?: string;
  hwContactName?: string;
  hwJobTitle?: string;
  hwCompanyName?: string;
  hwEmail?: string;
  hwPhone?: string;
}

const inputCls = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white';

export function Step5Confirm({ result, fields, onChange, onBuyerChange, onAddBuyer, onRemoveBuyer, onSellerChange, onAddSeller, onRemoveSeller, onSubmit, isSubmitting, loadingCompliance, error, onBack, transactionId, compliance, onVoided, canSendEmails = true, isAgent, blockerOverridden, onOverrideBlockers, overridingBlockers }: {
  result: ExtractionResult;
  fields: PartyFields;
  onChange: (key: keyof Omit<PartyFields, 'buyers' | 'sellers'>, value: string) => void;
  onBuyerChange: (index: number, field: keyof PartyPerson, value: string) => void;
  onAddBuyer: () => void;
  onRemoveBuyer: (index: number) => void;
  onSellerChange: (index: number, field: keyof SellerPerson, value: string) => void;
  onAddSeller: () => void;
  onRemoveSeller: (index: number) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  loadingCompliance?: boolean;
  error: string | null;
  onBack: () => void;
  transactionId: string | null;
  compliance: ComplianceResult | null;
  onVoided: () => void;
  canSendEmails?: boolean;
  isAgent?: boolean;
  blockerOverridden?: boolean;
  onOverrideBlockers?: () => void;
  overridingBlockers?: boolean;
}) {
  const tx = result.transaction;
  const prop = result.property;

  const blockerCount = compliance?.blockers?.length ?? 0;
  const hasBlockers = blockerCount > 0;

  const propertyLine = [prop.streetAddress, prop.city, prop.state, prop.postalCode]
    .filter(Boolean).join(', ');

  return (
    <StepCard>
      <StepCardHeader
        title="Confirm & Submit"
        description="Verify agent contact details, then submit. A welcome email will be sent to each party from the transaction address."
      />

      {/* Transaction summary */}
      <SectionDivider title="Transaction Summary" icon={Users} />
      <StepCardBody className="border-b border-gray-100">
        <dl className="space-y-2">
          {[
            ['Property',       propertyLine],
            ['Purchase Price', tx.purchasePrice != null ? `$${tx.purchasePrice.toLocaleString()}` : null],
            ['Closing Date',   fmtDate(tx.closingDate)],
            ['Acceptance Date',fmtDate(tx.acceptanceDate)],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center gap-4 py-1.5">
              <dt className="w-36 shrink-0 text-xs font-medium text-gray-500">{label}</dt>
              <dd className={cn('text-sm flex-1', value ? 'text-gray-900' : 'text-gray-300 italic')}>
                {value ?? '—'}
              </dd>
            </div>
          ))}
        </dl>
      </StepCardBody>

      {/* Buyer Agent */}
      {/* ── Principal Participants ── */}
      <SectionDivider title="Buyer(s)" icon={Users} />
      <StepCardBody className="border-b border-gray-100 space-y-4">
        {fields.buyers.map((buyer, i) => (
          <PersonRow
            key={i}
            index={i}
            person={buyer}
            namePlaceholder="e.g. John Smith"
            emailPlaceholder="john.smith@email.com"
            onChange={(field, value) => onBuyerChange(i, field, value)}
            onRemove={fields.buyers.length > 1 ? () => onRemoveBuyer(i) : undefined}
          />
        ))}
        <button type="button" onClick={onAddBuyer}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-800">
          <Plus size={13} /> Add another buyer
        </button>
      </StepCardBody>

      <SectionDivider title="Seller(s)" icon={Users} />
      <StepCardBody className="border-b border-gray-100 space-y-4">
        {fields.sellers.map((seller, i) => (
          <PersonRow
            key={i}
            index={i}
            person={seller}
            namePlaceholder="e.g. Jane Doe"
            showEmail={false}
            onChange={(field, value) => onSellerChange(i, field, value)}
            onRemove={fields.sellers.length > 1 ? () => onRemoveSeller(i) : undefined}
          />
        ))}
        <button type="button" onClick={onAddSeller}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-800">
          <Plus size={13} /> Add another seller
        </button>
      </StepCardBody>

      {/* ── Transaction Professionals ── */}
      <div className="px-6 pt-4 pb-1">
        <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Transaction Professionals</p>
        <p className="text-xs text-gray-400 mt-0.5">Agents and coordinator contact information</p>
      </div>

      <SectionDivider title="Buyer Agent" icon={Users} />
      {isAgent ? (
        <StepCardBody className="border-b border-gray-100">
          <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
            <ShieldCheck size={16} className="text-blue-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-blue-800">You are assigned as Buyer Agent</p>
              <p className="text-xs text-blue-600 mt-0.5">
                {fields.buyerAgentName} — {fields.buyerAgentEmail}
              </p>
              <p className="text-xs text-blue-500 mt-1">
                As the agent creating this transaction, you are automatically assigned and do not need to request buyer agent approval.
              </p>
            </div>
          </div>
        </StepCardBody>
      ) : (
        <StepCardBody className="border-b border-gray-100 space-y-3">
          <FormRow label="Full name" required>
            <input type="text" value={fields.buyerAgentName}
              onChange={(e) => onChange('buyerAgentName', e.target.value)}
              placeholder="e.g. Alice Torres" className={inputCls} />
          </FormRow>
          <FormRow label="Email address" required>
            <input type="email" value={fields.buyerAgentEmail}
              onChange={(e) => onChange('buyerAgentEmail', e.target.value)}
              placeholder="alice@brokerage.com" className={inputCls} />
          </FormRow>
        </StepCardBody>
      )}

      {/* Seller Agent */}
      <SectionDivider title="Seller Agent" icon={Users} />
      <StepCardBody className="border-b border-gray-100 space-y-3">
        <FormRow label="Full name" required>
          <input type="text" value={fields.sellerAgentName}
            onChange={(e) => onChange('sellerAgentName', e.target.value)}
            placeholder="e.g. David Kim" className={inputCls} />
        </FormRow>
        <FormRow label="Email address" required>
          <input type="email" value={fields.sellerAgentEmail}
            onChange={(e) => onChange('sellerAgentEmail', e.target.value)}
            placeholder="david@brokerage.com" className={inputCls} />
        </FormRow>
      </StepCardBody>

      {/* Seller TC (optional) */}
      <SectionDivider title="Seller's Transaction Coordinator" icon={Users} />
      <StepCardBody className="border-b border-gray-100 space-y-3">
        <p className="text-xs text-gray-400 -mt-1 mb-1">Optional — leave blank if no seller-side TC is involved.</p>
        <FormRow label="Full name">
          <input type="text" value={fields.sellerTcName}
            onChange={(e) => onChange('sellerTcName', e.target.value)}
            placeholder="e.g. Maria Lopez" className={inputCls} />
        </FormRow>
        <FormRow label="Email address">
          <input type="email" value={fields.sellerTcEmail}
            onChange={(e) => onChange('sellerTcEmail', e.target.value)}
            placeholder="maria@sellertc.com" className={inputCls} />
        </FormRow>
      </StepCardBody>

      {/* Email-disabled banner */}
      {!canSendEmails && (
        <div className="px-6 pt-2">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-2.5">
              <AlertCircle size={16} className="text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  Email sending is disabled
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  The contract package is incomplete or has unresolved issues (e.g., duplicate or missing documents).
                  Email sending is blocked until the package is valid.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Blocker banner */}
      {hasBlockers && (
        <div className="px-6 pt-2">
          <div className={cn(
            'rounded-xl border p-4 space-y-3',
            blockerOverridden ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50',
          )}>
            <div className="flex items-start gap-2.5">
              {blockerOverridden
                ? <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                : <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />}
              <div>
                <p className={cn('text-sm font-semibold', blockerOverridden ? 'text-amber-800' : 'text-red-800')}>
                  {blockerOverridden
                    ? `${blockerCount} blocker${blockerCount !== 1 ? 's' : ''} overridden — submission allowed`
                    : `${blockerCount} compliance blocker${blockerCount !== 1 ? 's' : ''} must be resolved before submitting`}
                </p>
              </div>
            </div>
            <div className="space-y-1">
              {(compliance?.blockers ?? []).map((b, i) => (
                <div key={`${b.compositeId}-${i}`} className={cn(
                  'flex items-start gap-2 text-xs',
                  blockerOverridden ? 'text-amber-700' : 'text-red-700',
                )}>
                  <FileText size={12} className="shrink-0 mt-0.5" />
                  <span><span className="font-mono font-semibold">{b.compositeId ?? b.code}</span> — {b.message}</span>
                </div>
              ))}
            </div>
            {!blockerOverridden ? (
              <button
                type="button"
                onClick={onOverrideBlockers}
                disabled={overridingBlockers}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
              >
                {overridingBlockers ? <><Loader2 size={14} className="animate-spin" /> Overriding…</> : 'Override & Continue'}
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-1 rounded-full w-fit">
                <AlertTriangle size={11} />
                Blockers Overridden
              </span>
            )}
          </div>
        </div>
      )}

      {/* Submit footer */}
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
        {error && (
          <div className="flex items-start gap-2.5 p-3 mb-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            {error}
          </div>
        )}
        <div className="flex items-center justify-between gap-4">
          {/* Left — Back + Void */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              <ArrowLeft size={14} />
              Back
            </button>
            <VoidControls
              transactionId={transactionId}
              result={result}
              compliance={compliance}
              onVoided={onVoided}
            />
          </div>

          {/* Right — note + Submit */}
          <div className="flex items-center gap-3">
            <p className="text-xs text-gray-400 flex items-center gap-1.5">
              <CheckCircle size={12} className="text-green-500 shrink-0" />
              Welcome emails sent from transaction address on submit
            </p>
            <button
              type="button"
              onClick={onSubmit}
              disabled={isSubmitting || (hasBlockers && !blockerOverridden) || loadingCompliance || !canSendEmails}
              className={cn(
                'flex items-center gap-2 px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium rounded-lg transition-colors shrink-0',
                'disabled:opacity-40 disabled:cursor-not-allowed',
              )}
              title={
                loadingCompliance ? 'Checking compliance…' :
                hasBlockers ? 'Resolve compliance blockers before submitting' :
                !canSendEmails ? 'Resolve contract package issues before submitting' :
                undefined
              }
            >
              {isSubmitting
                ? <><Loader2 size={14} className="animate-spin" /> Submitting…</>
                : 'Submit & Send Emails'}
            </button>
          </div>
        </div>
      </div>
    </StepCard>
  );
}

function FormRow({ label, required = false, children }: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4">
      <label className="w-32 shrink-0 text-xs font-medium text-gray-500">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function PersonRow<T extends { name: string }>({ index, person, namePlaceholder, emailPlaceholder, onChange, onRemove, showEmail = true }: {
  index: number;
  person: T;
  namePlaceholder: string;
  emailPlaceholder?: string;
  onChange: (field: keyof T, value: string) => void;
  onRemove?: () => void;
  showEmail?: boolean;
}) {
  const emailValue = showEmail ? ((person as unknown as { email?: string }).email ?? '') : '';
  return (
    <div className="space-y-2">
      {index > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-400">Person {index + 1}</span>
          {onRemove && (
            <button type="button" onClick={onRemove}
              className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
              <Trash2 size={12} /> Remove
            </button>
          )}
        </div>
      )}
      <FormRow label="Full name" required>
        <input type="text" value={person.name}
          onChange={(e) => onChange('name' as keyof T, e.target.value)}
          placeholder={namePlaceholder} className={inputCls} />
      </FormRow>
      {showEmail && (
        <FormRow label="Email address" required>
          <input type="email" value={emailValue}
            onChange={(e) => onChange('email' as keyof T, e.target.value)}
            placeholder={emailPlaceholder} className={inputCls} />
        </FormRow>
      )}
    </div>
  );
}
