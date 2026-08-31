'use client';

import { useState } from 'react';
import { CheckCircle, Lock, FileText, Users, Folder, Bell, Upload, UserCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildSwimlaneData } from '@/lib/swimlane-data';
import TransactionSwimlane from './TransactionSwimlane';
import ContractDetailsView from './ContractDetailsView';
import DisclosuresDetailView from './DisclosuresDetailView';
import ContingenciesView from './ContingenciesView';
import ContingencyNotificationView from './ContingencyNotificationView';
import EscrowDetailsView from './EscrowDetailsView';
import VerificationOfPropertyView from './VerificationOfPropertyView';
import IntakeDetailsView from './IntakeDetailsView';
import AllDocumentsView from './AllDocumentsView';
import StageDocumentsTab from './StageDocumentsTab';
import PartyManagement from './PartyManagement';
import ReminderScheduleDialog from './ReminderScheduleDialog';
import type { ApiParty, ApiMessage, ApiWorkflowStep, ApiStageInstance, ApiFormTemplateItem, ApiDocument } from '@/lib/api';
import type { ExtractionResult, ComplianceResult } from '@/app/transactions/new/extraction-result.types';
import type { TransactionContext } from './SendViaDocuSignModal';
import type { FinalNegotiatedTerms } from '@tc/shared';

// ── Stage definitions ─────────────────────────────────────────────────────────

const ALL_STAGES = [
  { key: 'DOCUMENTS',    label: 'Documents' },
  { key: 'PARTIES',     label: 'Parties' },
  { key: 'INTAKE',      label: 'Qualification' },
  { key: 'CONTRACT',    label: 'Contract' },
  { key: 'DISCLOSURES', label: 'Disclosures' },
  { key: 'CONTINGENCIES',  label: 'Contingencies' },
  { key: 'ESCROW',      label: 'Escrow' },
  { key: 'CLOSING',     label: 'Closing' },
  { key: 'POST_CLOSE',  label: 'Post-Close' },
];

// ── Per-stage sub-tab config ──────────────────────────────────────────────────

type SubTabId = 'info' | 'swimlane' | 'documents';

interface SubTabDef {
  id: SubTabId;
  label: string;
  icon: React.ElementType;
}

const STAGE_SUB_TABS: Record<string, SubTabDef[]> = {
  INTAKE: [
    { id: 'info',      label: 'Qualification',                    icon: FileText },
    { id: 'swimlane',  label: 'Qualification Notification Status', icon: Users    },
    { id: 'documents', label: 'Qualification Documents',           icon: Folder   },
  ],
  CONTRACT: [
    { id: 'info',      label: 'Contract Detail',                icon: FileText },
    { id: 'swimlane',  label: 'Contact Notifications Status',   icon: Users    },
    { id: 'documents', label: 'Contract Documents',             icon: Folder   },
  ],
  DISCLOSURES: [
    { id: 'info',      label: 'Disclosures Detail',            icon: FileText },
    { id: 'swimlane',  label: 'Disclosure Notification Status', icon: Users    },
    { id: 'documents', label: 'Disclosure Documents',           icon: Folder   },
  ],
  CONTINGENCIES: [
    { id: 'info',      label: 'Contingency Details',               icon: FileText },
    { id: 'swimlane',  label: 'Contingency Notification Status',   icon: Users    },
    { id: 'documents', label: 'Contingency Documents',             icon: Folder   },
  ],
  ESCROW: [
    { id: 'info',      label: 'Escrow Detail',              icon: FileText },
    { id: 'swimlane',  label: 'Escrow Notification Status', icon: Users    },
    { id: 'documents', label: 'Escrow Documents',           icon: Folder   },
  ],
  CLOSING: [
    { id: 'info',      label: 'Closing Detail',              icon: FileText },
    { id: 'swimlane',  label: 'Closing Notification Status', icon: Users    },
    { id: 'documents', label: 'Closing Documents',           icon: Folder   },
  ],
  POST_CLOSE: [
    { id: 'info',      label: 'Post-Close Detail',              icon: FileText },
    { id: 'swimlane',  label: 'Post-Close Notification Status', icon: Users    },
    { id: 'documents', label: 'Post-Close Documents',           icon: Folder   },
  ],
};

const DEFAULT_SUB_TABS: SubTabDef[] = [
  { id: 'info',      label: 'Details',   icon: FileText },
  { id: 'swimlane',  label: 'Swimlane',  icon: Users    },
  { id: 'documents', label: 'Documents', icon: Folder   },
];

const STAGE_UPLOAD_ENABLED: Record<string, boolean> = {
  INTAKE:      true,
  CONTRACT:    true,
  DISCLOSURES: true,
  CONTINGENCIES: true,
  ESCROW:      true,
  CLOSING:     true,
  POST_CLOSE:  true,
};

function getSubTabs(stageKey: string): SubTabDef[] {
  return STAGE_SUB_TABS[stageKey.toUpperCase()] ?? DEFAULT_SUB_TABS;
}

// ── Stage tabs ────────────────────────────────────────────────────────────────

function StageTabs({
  stageInstances,
  selectedStage,
  messageCounts,
  contingencyDocCount,
  onSelect,
}: {
  stageInstances: ApiStageInstance[];
  selectedStage: string;
  messageCounts: Record<string, number>;
  contingencyDocCount: number;
  onSelect: (key: string) => void;
}) {
  const instanceMap = Object.fromEntries(
    stageInstances.map((s) => [s.stage.toUpperCase(), s]),
  );

  // Map CONTINGENCIES to the 3 underlying stages
  const CONTINGENCY_STAGES = ['INSPECTION', 'APPRAISAL', 'LOAN'];

  function getStageStatus(stageKey: string): string | null {
    if (stageKey === 'DOCUMENTS') return 'active';
    if (stageKey === 'CONTINGENCIES') {
      const instances = CONTINGENCY_STAGES.map((k) => instanceMap[k]).filter(Boolean);
      if (instances.length === 0 && contingencyDocCount === 0) return null;
      const allCompleted = instances.length >= 1
        && instances.every((s) => s!.status === 'completed')
        && contingencyDocCount > 0;
      return allCompleted ? 'completed' : 'active';
    }
    return instanceMap[stageKey]?.status ?? null;
  }

  return (
    <div className="flex border-b border-gray-200 bg-white overflow-x-auto shrink-0">
      {ALL_STAGES.map((stage) => {
        const status = getStageStatus(stage.key);
        const isActive   = status === 'active';
        const isCompleted = status === 'completed';
        const isWaived   = status === 'waived';
        const isStarted  = isActive || isCompleted || isWaived;
        const isSelected = stage.key === selectedStage;
        const count      = messageCounts[stage.key] ?? 0;

        return (
          <button
            key={stage.key}
            type="button"
            onClick={() => onSelect(stage.key)}
            className={cn(
              'relative flex flex-col items-center gap-1 px-4 py-3 text-xs font-medium whitespace-nowrap cursor-pointer',
              'border-b-2 transition-colors focus:outline-none shrink-0',
              isSelected   ? 'border-blue-700 text-blue-700 bg-blue-50/50' : 'border-transparent',
              !isSelected && !isStarted   ? 'text-gray-300 hover:text-gray-400 hover:border-gray-200 hover:bg-gray-50/50' : '',
              !isSelected && isCompleted  ? 'text-gray-500 hover:border-gray-300 hover:bg-gray-50' : '',
              !isSelected && isActive     ? 'text-gray-700 hover:border-gray-300 hover:bg-gray-50' : '',
              !isSelected && isWaived     ? 'text-gray-400 hover:border-gray-300 hover:bg-gray-50' : '',
            )}
          >
            <div className="flex items-center gap-1.5">
              {isCompleted && <CheckCircle size={12} className="text-green-500 shrink-0" />}
              {!isStarted  && <span className="w-2 h-2 rounded-full bg-gray-300 shrink-0" />}
              {isActive    && <span className="w-2 h-2 rounded-full bg-blue-700 shrink-0" />}
              {isWaived    && (
                <span className="text-[9px] font-bold uppercase tracking-wide text-gray-500 bg-gray-100 border border-gray-300 px-1.5 py-0.5 rounded-full shrink-0">
                  Waived
                </span>
              )}
              <span>{stage.label}</span>
            </div>

            {count > 0 && (
              <span className={cn(
                'text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                isSelected ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500',
              )}>
                {count} msg{count !== 1 ? 's' : ''}
              </span>
            )}

            {isActive && (
              <span className="text-[9px] font-bold uppercase tracking-wide text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-full">
                active
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Sub-tabs bar ──────────────────────────────────────────────────────────────

function SubTabBar({
  tabs,
  selected,
  onSelect,
}: {
  tabs: SubTabDef[];
  selected: SubTabId;
  onSelect: (t: SubTabId) => void;
}) {
  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-100 bg-gray-50/60">
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onSelect(id)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
            selected === id
              ? 'bg-white border border-gray-200 text-blue-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700 hover:bg-white/60',
          )}
        >
          <Icon size={12} />
          {label}
        </button>
      ))}
    </div>
  );
}

// ── Info tab placeholder ──────────────────────────────────────────────────────

function StageInfoPlaceholder({ stage, isUnstarted }: { stage: string; isUnstarted: boolean }) {
  const label = ALL_STAGES.find((s) => s.key === stage.toUpperCase())?.label ?? stage;
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {isUnstarted ? (
        <>
          <Lock className="w-8 h-8 text-gray-300 mb-3" />
          <p className="text-sm text-gray-500">{label} stage not yet started.</p>
          <p className="text-xs text-gray-400 mt-1">This stage can be activated independently from other stages.</p>
        </>
      ) : (
        <>
          <FileText className="w-8 h-8 text-gray-300 mb-3" />
          <p className="text-sm text-gray-500">{label} details coming soon.</p>
          <p className="text-xs text-gray-400 mt-1">This section will show stage-specific information.</p>
        </>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  transactionId: string;
  stageInstances: ApiStageInstance[];
  parties: ApiParty[];
  messages: ApiMessage[];
  workflowSteps: ApiWorkflowStep[];
  extractionResult: ExtractionResult | null;
  compliance: ComplianceResult | null;
  contingencyFinalTerms?: FinalNegotiatedTerms | null;
  disclosureCompliance: ComplianceResult | null;
  disclosureDocuments: ApiDocument[];
  inspectionCompliance: ComplianceResult | null;
  inspectionDocuments: ApiDocument[];
  appraisalDocuments?: ApiDocument[];
  intakeDocuments?: ApiDocument[];
  loanDocuments?: ApiDocument[];
  escrowDocuments?: ApiDocument[];
  closingDocuments?: ApiDocument[];
  allDocuments?: ApiDocument[];
  templateItems?: ApiFormTemplateItem[];
  txContext?: TransactionContext;
  userEmail?: string;
}

function resolveInitialStage(instances: ApiStageInstance[]): string {
  const stageOrder = ALL_STAGES.map((s) => s.key);
  const active = instances
    .filter((s) => s.status === 'active')
    .sort((a, b) => {
      const ai = stageOrder.indexOf(a.stage.toUpperCase());
      const bi = stageOrder.indexOf(b.stage.toUpperCase());
      if (a.stage.toUpperCase() === 'INSPECTION' || a.stage.toUpperCase() === 'APPRAISAL' || a.stage.toUpperCase() === 'LOAN') return -1;
      if (b.stage.toUpperCase() === 'INSPECTION' || b.stage.toUpperCase() === 'APPRAISAL' || b.stage.toUpperCase() === 'LOAN') return 1;
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  const first = active[0];
  if (first && ['INSPECTION','APPRAISAL','LOAN'].includes(first.stage.toUpperCase())) return 'CONTINGENCIES';
  return first?.stage.toUpperCase() ?? 'CONTRACT';
}

export default function StagedSwimlane({
  transactionId,
  stageInstances,
  parties,
  messages,
  workflowSteps: _workflowSteps,
  extractionResult,
  compliance,
  contingencyFinalTerms,
  disclosureCompliance,
  disclosureDocuments,
  inspectionCompliance,
  inspectionDocuments,
  appraisalDocuments,
  intakeDocuments,
  loanDocuments,
  escrowDocuments,
  closingDocuments,
  allDocuments,
  templateItems,
  txContext,
  userEmail,
}: Props) {
  const [selectedStage, setSelectedStage] = useState(() => resolveInitialStage(stageInstances));
  const [subTab, setSubTab] = useState<SubTabId>('documents');
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [uploadTrigger, setUploadTrigger] = useState(0);

  // Reset sub-tab and close dialog when stage changes
  function handleStageSelect(key: string) {
    setSelectedStage(key);
    setSubTab('info');
    setScheduleDialogOpen(false);
  }

  const subTabs = getSubTabs(selectedStage);

  // Count messages per stage
  const messageCounts: Record<string, number> = {};
  for (const msg of messages) {
    const s = msg.stage?.toUpperCase() ?? 'UNKNOWN';
    messageCounts[s] = (messageCounts[s] ?? 0) + 1;
  }

  // Messages filtered to selected stage (for swimlane)
  // CONTINGENCIES aggregates from inspection + appraisal + loan
  const filtered = selectedStage === 'CONTINGENCIES'
    ? messages.filter((m) => {
        const s = (m.stage?.toUpperCase() ?? '');
        return s === 'INSPECTION' || s === 'APPRAISAL' || s === 'LOAN';
      })
    : messages.filter((m) => (m.stage?.toUpperCase() ?? '') === selectedStage);

  const swimlaneData = buildSwimlaneData(parties, filtered);

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Stage tabs */}
      <StageTabs
        stageInstances={stageInstances}
        selectedStage={selectedStage}
        messageCounts={messageCounts}
        contingencyDocCount={(inspectionDocuments?.length ?? 0) + (appraisalDocuments?.length ?? 0) + (loanDocuments?.length ?? 0)}
        onSelect={handleStageSelect}
      />

      {/* Sub-tabs — stage-specific labels (hidden for Documents and Parties tabs) */}
      {selectedStage !== 'DOCUMENTS' && selectedStage !== 'PARTIES' && (
      <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/60">
        <SubTabBar tabs={subTabs} selected={subTab} onSelect={setSubTab} />
        {STAGE_UPLOAD_ENABLED[selectedStage] && (
          <div className="pr-3">
            <button
              type="button"
              onClick={() => { setSubTab('documents'); setUploadTrigger((p) => p + 1); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 text-white text-xs font-medium rounded-lg hover:bg-blue-800 transition-colors"
            >
              <Upload size={12} />
              Upload
            </button>
          </div>
        )}
      </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto">

        {selectedStage === 'DOCUMENTS' && (
          <AllDocumentsView documents={allDocuments ?? []} />
        )}

        {selectedStage === 'PARTIES' && (
          <div className="px-4 max-w-5xl mx-auto py-4">
            <PartyManagement
              parties={parties}
              transactionId={transactionId}
              canEdit
            />
          </div>
        )}

        {selectedStage !== 'DOCUMENTS' && selectedStage !== 'PARTIES' && subTab === 'info' && (
          <div className="px-4 max-w-5xl mx-auto">
            {selectedStage === 'INTAKE'
              ? <IntakeDetailsView
                  transactionId={transactionId}
                  extractionResult={extractionResult}
                  intakeDocuments={intakeDocuments ?? []}
                />
              : selectedStage === 'CONTRACT'
              ? <ContractDetailsView extractionResult={extractionResult} compliance={compliance} transactionId={transactionId} finalTerms={contingencyFinalTerms} />
              : selectedStage === 'DISCLOSURES'
              ? <DisclosuresDetailView documents={disclosureDocuments} compliance={disclosureCompliance} templateItems={templateItems} transactionId={transactionId} parties={parties} txContext={txContext} userEmail={userEmail} />
              : selectedStage === 'CONTINGENCIES'
              ? <ContingenciesView
                  extractionResult={extractionResult}
                  finalTerms={contingencyFinalTerms}
                  stageInstances={stageInstances}
                  inspectionDocuments={inspectionDocuments}
                  inspectionCompliance={inspectionCompliance}
                  appraisalDocuments={appraisalDocuments ?? []}
                  loanDocuments={loanDocuments ?? []}
                  parties={parties}
                  txContext={txContext}
                  transactionId={transactionId}
                />
              : selectedStage === 'ESCROW'
              ? <EscrowDetailsView
                  transactionId={transactionId}
                  extractionResult={{ escrowCompanies: extractionResult?.parties?.escrowCompanies }}
                  documents={escrowDocuments ?? []}
                />
              : selectedStage === 'CLOSING'
              ? <VerificationOfPropertyView
                  transactionId={transactionId}
                  closingDocuments={closingDocuments ?? []}
                />
              : <StageInfoPlaceholder stage={selectedStage} isUnstarted={!stageInstances.some((s) => s.stage.toUpperCase() === selectedStage)} />
            }
          </div>
        )}

        {selectedStage !== 'DOCUMENTS' && selectedStage !== 'PARTIES' && subTab === 'swimlane' && (
          selectedStage === 'CONTINGENCIES' ? (
            <div className="flex flex-col h-full min-h-0">
              <div className="px-4 max-w-3xl mx-auto w-full">
                <ContingencyNotificationView transactionId={transactionId} messages={filtered} />
              </div>
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-white shrink-0">
                <span className="text-xs text-gray-400">Notification status for this stage</span>
                <button
                  type="button"
                  onClick={() => setScheduleDialogOpen(true)}
                  className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
                >
                  <Bell size={12} />
                  Manage Schedule
                </button>
              </div>
              <div className="flex flex-wrap gap-4 px-4 py-2.5 border-t border-gray-100 text-xs text-gray-400 shrink-0">
                <span className="flex items-center gap-1.5"><CheckCircle size={12} className="text-green-500" /> Completed</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-700 inline-block" /> Current</span>
                <span className="flex items-center gap-1.5"><Lock size={11} className="text-gray-300" /> Upcoming</span>
                <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-blue-200" /> Inbound</span>
                <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-emerald-200" /> Outbound</span>
                <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-amber-400" /> Awaiting response</span>
              </div>
            </div>
          ) : (
          <div className="flex flex-col h-full min-h-0">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-white shrink-0">
              <span className="text-xs text-gray-400">Notification status for this stage</span>
              <button
                type="button"
                onClick={() => setScheduleDialogOpen(true)}
                className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
              >
                <Bell size={12} />
                Manage Schedule
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <TransactionSwimlane data={swimlaneData} />
            </div>
            <div className="flex flex-wrap gap-4 px-4 py-2.5 border-t border-gray-100 text-xs text-gray-400 shrink-0">
              <span className="flex items-center gap-1.5"><CheckCircle size={12} className="text-green-500" /> Completed</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-700 inline-block" /> Current</span>
              <span className="flex items-center gap-1.5"><Lock size={11} className="text-gray-300" /> Upcoming</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-blue-200" /> Inbound</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-emerald-200" /> Outbound</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-amber-400" /> Awaiting response</span>
            </div>
          </div>
          )
        )}

        {selectedStage !== 'DOCUMENTS' && selectedStage !== 'PARTIES' && subTab === 'documents' && (
          <div className="px-4 max-w-5xl mx-auto">
            <StageDocumentsTab
              key={`docs-${uploadTrigger}`}
              transactionId={transactionId}
              stage={selectedStage === 'CONTINGENCIES' ? 'INSPECTION' : selectedStage}
              defaultOpen={uploadTrigger > 0}
            />
          </div>
        )}

      </div>

      <ReminderScheduleDialog
        transactionId={transactionId}
        stage={selectedStage}
        stageLabel={ALL_STAGES.find((s) => s.key === selectedStage)?.label ?? selectedStage}
        isOpen={scheduleDialogOpen}
        onClose={() => setScheduleDialogOpen(false)}
      />
    </div>
  );
}
