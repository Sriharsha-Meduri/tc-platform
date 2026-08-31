'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, FileText, Building2, X, Pencil, Trash2, Check, Settings, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ApiFormTemplate, ApiFormTemplateItem, ApiCarForm } from '@/lib/api';
import defaultTemplate from '@/lib/default-form-template.json';

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function todayStr(): string {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function DateBadge({ effectiveDate, retiredDate }: { effectiveDate: string | null; retiredDate: string | null }) {
  const today = todayStr();

  if (retiredDate && retiredDate <= today) {
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200 font-medium whitespace-nowrap">Expired</span>;
  }

  if (effectiveDate && effectiveDate > today) {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200 font-medium whitespace-nowrap">
        Starts {formatDate(effectiveDate)}
      </span>
    );
  }

  if (effectiveDate && retiredDate) {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-600 border border-green-200 font-medium whitespace-nowrap">
        {formatDate(effectiveDate)} – {formatDate(retiredDate)}
      </span>
    );
  }

  if (effectiveDate) {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-600 border border-green-200 font-medium whitespace-nowrap">
        Active since {formatDate(effectiveDate)}
      </span>
    );
  }

  if (retiredDate) {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-600 border border-green-200 font-medium whitespace-nowrap">
        Expires {formatDate(retiredDate)}
      </span>
    );
  }

  return null;
}

// ── Types ────────────────────────────────────────────────────────────────────

type RequiredStatus = 'mandatory' | 'optional' | 'conditional';

interface DefaultFormEntry {
  code: string;
  name: string;
  required: RequiredStatus;
  notes?: string;
}

type DefaultStageMap = Record<string, DefaultFormEntry[]>;
type DefaultSideMap  = Record<string, DefaultStageMap>;
type DefaultTypeMap  = Record<string, DefaultSideMap>;
type DefaultJson     = Record<string, DefaultTypeMap>;

const STAGES = ['INTAKE', 'CONTRACT', 'DISCLOSURES', 'INSPECTION', 'APPRAISAL', 'LOAN', 'ESCROW', 'CLOSING', 'POST_CLOSE'];

const REQUIRED_BADGE: Record<RequiredStatus, string> = {
  mandatory:   'bg-red-50 text-red-700 border border-red-200',
  optional:    'bg-gray-50 text-gray-500 border border-gray-200',
  conditional: 'bg-amber-50 text-amber-700 border border-amber-200',
};

const TRANSACTION_TYPES = ['residential'] as const;
const SIDES = ['buyer_side', 'seller_side'] as const;

function sideLabel(side: string) {
  return side === 'buyer_side' ? 'Buyer Side' : side === 'seller_side' ? 'Seller Side' : side === 'dual' ? 'Dual Agency' : 'Listing';
}

// ── Default template viewer ──────────────────────────────────────────────────

function StageSection({ stage, forms }: { stage: string; forms: DefaultFormEntry[] }) {
  const [open, setOpen] = useState(stage === 'INTAKE' || stage === 'CONTRACT');
  if (forms.length === 0) return null;

  const mandatoryCount   = forms.filter((f) => f.required === 'mandatory').length;
  const conditionalCount = forms.filter((f) => f.required === 'conditional').length;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5">
          {open ? <ChevronDown size={14} className="text-gray-400 shrink-0" /> : <ChevronRight size={14} className="text-gray-400 shrink-0" />}
          <span className="text-sm font-semibold text-gray-800">{stage}</span>
          <span className="text-xs text-gray-400">{forms.length} forms</span>
        </div>
        <div className="flex gap-1.5">
          {mandatoryCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200 font-medium">
              {mandatoryCount} required
            </span>
          )}
          {conditionalCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200 font-medium">
              {conditionalCount} conditional
            </span>
          )}
        </div>
      </button>
      {open && (
        <div className="divide-y divide-gray-100">
          {forms.map((form) => (
            <div key={form.code} className="flex items-start gap-3 px-4 py-2.5">
              <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded shrink-0 mt-0.5">
                {form.code}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 leading-snug">{form.name}</p>
                {form.notes && <p className="text-xs text-gray-400 mt-0.5">{form.notes}</p>}
              </div>
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 mt-0.5', REQUIRED_BADGE[form.required])}>
                {form.required}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DefaultTemplateViewer() {
  const [selectedType, setSelectedType] = useState<string>('residential');
  const [selectedSide, setSelectedSide] = useState<string>('buyer_side');

  const data = (defaultTemplate as DefaultJson)['CA']?.[selectedType]?.[selectedSide] as DefaultStageMap | undefined;

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
          {TRANSACTION_TYPES.map((t) => (
            <button key={t} onClick={() => setSelectedType(t)}
              className={cn('px-3 py-1.5 capitalize transition-colors', selectedType === t ? 'bg-blue-700 text-white' : 'text-gray-600 hover:bg-gray-50')}>
              {t.replace('_', ' ')}
            </button>
          ))}
        </div>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
          {SIDES.map((s) => (
            <button key={s} onClick={() => setSelectedSide(s)}
              className={cn('px-3 py-1.5 transition-colors', selectedSide === s ? 'bg-blue-700 text-white' : 'text-gray-600 hover:bg-gray-50')}>
              {sideLabel(s)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3 text-[10px]">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-100 border border-red-200 inline-block" />Mandatory</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-100 border border-amber-200 inline-block" />Conditional</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-gray-100 border border-gray-200 inline-block" />Optional</span>
      </div>

      {data ? (
        <div className="space-y-2">
          {STAGES.map((stage) => (
            <StageSection key={stage} stage={stage} forms={(data[stage] ?? []) as DefaultFormEntry[]} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400 py-4">No default template for this combination yet.</p>
      )}
    </div>
  );
}

// ── Org template stage editor ─────────────────────────────────────────────────

interface StageEditorProps {
  templateId: string;
  transactionType: string;
  side: string;
  stateCode: string | null;
  items: ApiFormTemplateItem[];
  onItemsChange: (items: ApiFormTemplateItem[]) => void;
}

function StageEditor({ templateId, transactionType, side, stateCode, items, onItemsChange }: StageEditorProps) {
  const [activeStage, setActiveStage] = useState(STAGES[0]);
  const [adding, setAdding]           = useState(false);
  const [saving, setSaving]           = useState(false);
  const [removingId, setRemovingId]   = useState<string | null>(null);

  // form add state
  const [catalog, setCatalog]         = useState<ApiCarForm[]>([]);
  const [catalogError, setCatalogError] = useState('');
  const [search, setSearch]           = useState('');
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [isRequired, setIsRequired]     = useState(true);
  const [addError, setAddError]         = useState('');

  // Load the CAR forms catalog scoped to this template's side + transaction type.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const params = new URLSearchParams();
      if (transactionType) params.set('transactionType', transactionType);
      if (side) params.set('side', side);
      try {
        const res = await fetch(`/api/form-templates/car-forms${params.size ? `?${params}` : ''}`);
        if (!res.ok) throw new Error(`catalog ${res.status}`);
        const data: ApiCarForm[] = await res.json();
        if (!cancelled) setCatalog(data);
      } catch {
        if (!cancelled) setCatalogError('Could not load the CAR forms catalog.');
      }
    })();
    return () => { cancelled = true; };
  }, [transactionType, side]);

  // Suggestions for the active stage from the default template
  const stateKey = stateCode ?? 'CA';
  const defaultStage = (defaultTemplate as DefaultJson)[stateKey]?.[transactionType]?.[side]?.[activeStage] as DefaultFormEntry[] | undefined;

  // Dedupe across ALL stages — a form can only appear once per template.
  const existingCodes = useMemo(
    () => new Set(items.map((i) => i.formCode.toUpperCase())),
    [items],
  );

  const suggestions = (defaultStage ?? []).filter((f) => !existingCodes.has(f.code.toUpperCase()));

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.filter((f) => {
      if (existingCodes.has(f.code.toUpperCase())) return false;
      if (!q) return true;
      return f.code.toLowerCase().includes(q) || f.name.toLowerCase().includes(q);
    });
  }, [catalog, search, existingCodes]);

  function toggleSelect(code: string) {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  }

  function resetAddForm() {
    setSelectedCodes(new Set());
    setSearch('');
    setIsRequired(true);
    setAddError('');
    setAdding(false);
  }

  async function handleAdd() {
    if (selectedCodes.size === 0) return;
    setSaving(true);
    setAddError('');
    try {
      const added: ApiFormTemplateItem[] = [];
      const failed: string[] = [];
      for (const code of selectedCodes) {
        const meta = catalog.find((f) => f.code.toUpperCase() === code.toUpperCase());
        const res = await fetch(`/api/form-templates/${templateId}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            formCode: code,
            formName: meta?.name ?? code,
            category: meta?.category ?? 'addendum',
            isRequired,
            stage: activeStage,
          }),
        });
        if (res.ok) {
          added.push(await res.json());
        } else {
          let message = `Could not add ${code} (${res.status})`;
          try {
            const body = await res.json();
            if (Array.isArray(body.message)) message = body.message.join(' ');
            else if (typeof body.message === 'string') message = body.message;
          } catch { /* keep default message */ }
          failed.push(message);
        }
      }
      if (added.length > 0) {
        onItemsChange([...items, ...added]);
        setSelectedCodes(new Set());
        setSearch('');
      }
      if (failed.length > 0) {
        setAddError(failed.join(' · '));
      } else {
        setAddError('');
        setSaving(false);
        setAdding(false);
        return;
      }
    } catch {
      setAddError('Unexpected error while saving forms.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(item: ApiFormTemplateItem) {
    setRemovingId(item.id);
    try {
      await fetch(`/api/form-templates/${templateId}/items/${item.id}`, { method: 'DELETE' });
      onItemsChange(items.filter((i) => i.id !== item.id));
    } finally {
      setRemovingId(null);
    }
  }

  async function handleUpdateItemTemplateId(item: ApiFormTemplateItem, docusignTemplateId: string | null) {
    try {
      const res = await fetch(`/api/form-templates/${templateId}/items/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docusignTemplateId }),
      });
      if (res.ok) {
        const updated: ApiFormTemplateItem = await res.json();
        onItemsChange(items.map((i) => i.id === item.id ? updated : i));
      }
    } catch { /* ignore save errors */ }
  }

  const stageItems = items.filter((i) => i.stage === activeStage);

  return (
    <div className="space-y-3">
      {/* Stage tabs */}
      <div className="flex flex-wrap gap-1">
        {STAGES.map((stage) => {
          const count = items.filter((i) => i.stage === stage).length;
          return (
            <button
              key={stage}
              onClick={() => { setActiveStage(stage); setAdding(false); resetAddForm(); }}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded-md transition-colors border',
                activeStage === stage
                  ? 'bg-blue-700 text-white border-blue-700'
                  : 'text-gray-600 border-gray-200 hover:bg-gray-50',
              )}
            >
              {stage}
              {count > 0 && (
                <span className={cn('ml-1.5 text-[10px] font-semibold', activeStage === stage ? 'text-blue-200' : 'text-gray-400')}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Current forms for this stage */}
      <div className="space-y-1 min-h-[2rem]">
        {stageItems.length === 0 && !adding && (
          <p className="text-xs text-gray-400 py-2">No forms added for {activeStage} yet.</p>
        )}
        {stageItems.map((item) => (
          <div key={item.id} className="flex items-center gap-2.5 px-3 py-2 bg-gray-50 rounded-lg">
            <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded shrink-0">
              {item.formCode}
            </span>
            <p className="text-xs text-gray-700 flex-1 min-w-0 truncate">{item.formName}</p>
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0', item.isRequired ? REQUIRED_BADGE.mandatory : REQUIRED_BADGE.optional)}>
              {item.isRequired ? 'required' : 'optional'}
            </span>
            {item.docusignTemplateId ? (
              <span className="text-[10px] text-purple-600 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded-full font-medium shrink-0" title={item.docusignTemplateId}>
                DS
              </span>
            ) : (
              <input
                type="text"
                placeholder="+ DS template"
                className="w-28 text-[10px] font-mono border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white shrink-0"
                onBlur={(e) => {
                  const val = e.target.value.trim() || null;
                  if (val !== (item.docusignTemplateId ?? null)) {
                    handleUpdateItemTemplateId(item, val);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
              />
            )}
            <button
              onClick={() => handleRemove(item)}
              disabled={removingId === item.id}
              className="text-gray-300 hover:text-red-500 transition-colors shrink-0 disabled:opacity-50"
            >
              {removingId === item.id
                ? <span className="text-[10px] text-gray-400">…</span>
                : <Trash2 size={12} />
              }
            </button>
          </div>
        ))}
      </div>

      {/* Add form panel */}
      {adding ? (
        <div className="border border-blue-200 rounded-lg p-3 space-y-2.5 bg-blue-50/30">
          <p className="text-xs font-semibold text-gray-700">Add forms to {activeStage}</p>

          {catalogError ? (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">{catalogError}</p>
          ) : catalog.length === 0 ? (
            <p className="text-xs text-gray-400">Loading CAR forms catalog…</p>
          ) : (
            <>
              {/* Search */}
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Search ${catalog.length} forms…`}
                  className="w-full border border-gray-300 rounded-lg pl-8 pr-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>

              {/* Suggestions chip row from default template */}
              {suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {suggestions.map((f) => (
                    <button
                      key={f.code}
                      onClick={() => toggleSelect(f.code)}
                      className={cn(
                        'px-1.5 py-0.5 text-[10px] font-medium rounded-full border transition-colors',
                        selectedCodes.has(f.code)
                          ? 'bg-blue-700 text-white border-blue-700'
                          : 'text-gray-600 border-gray-300 bg-white hover:bg-blue-50',
                      )}
                    >
                      {f.code}
                    </button>
                  ))}
                </div>
              )}

              {/* Searchable multi-select list */}
              {filteredCatalog.length > 0 ? (
                <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg bg-white divide-y divide-gray-100">
                  {filteredCatalog.map((f) => (
                    <label key={f.code} className="flex items-center gap-2.5 px-2.5 py-1.5 cursor-pointer hover:bg-blue-50/50">
                      <input
                        type="checkbox"
                        checked={selectedCodes.has(f.code)}
                        onChange={() => toggleSelect(f.code)}
                        className="accent-blue-700 shrink-0"
                      />
                      <span className="font-mono text-[10px] font-semibold text-blue-700 bg-blue-50 px-1 py-0.5 rounded shrink-0">{f.code}</span>
                      <span className="text-xs text-gray-700 min-w-0 flex-1 truncate">{f.name}</span>
                      {f.required === 'conditional' && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200 font-medium shrink-0">conditional</span>
                      )}
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">No forms match “{search}”.</p>
              )}
            </>
          )}

          {/* Required toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsRequired((p) => !p)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors',
                isRequired
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : 'bg-gray-50 text-gray-500 border-gray-200',
              )}
            >
              {isRequired ? <Check size={11} /> : null}
              {isRequired ? 'Required' : 'Optional'}
            </button>
            <span className="text-[10px] text-gray-400">applies to all selected forms</span>
          </div>

          {/* Error display */}
          {addError && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">{addError}</p>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-0.5">
            <button
              onClick={handleAdd}
              disabled={saving || selectedCodes.size === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50"
            >
              {saving ? 'Adding…' : `Add ${selectedCodes.size} selected form${selectedCodes.size === 1 ? '' : 's'}`}
            </button>
            <button onClick={resetAddForm} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
        >
          <Plus size={12} />
          Add form to {activeStage}
        </button>
      )}
    </div>
  );
}

// ── Org template card ─────────────────────────────────────────────────────────

interface OrgTemplateCardProps {
  template: ApiFormTemplate;
  onUpdate: (updated: ApiFormTemplate) => void;
  canManage: boolean;
}

function OrgTemplateCard({ template, onUpdate, canManage }: OrgTemplateCardProps) {
  const [open, setOpen]               = useState(false);
  const [editing, setEditing]         = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [savingMeta, setSavingMeta]   = useState(false);
  const [metaDraft, setMetaDraft]     = useState<{ isActive: boolean; effectiveDate: string; retiredDate: string; docusignTemplateId: string } | null>(null);
  const [items, setItems]             = useState<ApiFormTemplateItem[]>(template.items ?? []);

  function handleItemsChange(next: ApiFormTemplateItem[]) {
    setItems(next);
    onUpdate({ ...template, items: next });
  }

  const byStage: Record<string, ApiFormTemplateItem[]> = {};
  for (const item of items) {
    const key = item.stage ?? 'General';
    if (!byStage[key]) byStage[key] = [];
    byStage[key].push(item);
  }
  const stageOrder    = [...STAGES, 'General'];
  const displayStages = stageOrder.filter((s) => byStage[s]?.length);

  async function handleSaveMeta() {
    if (!metaDraft) return;
    setSavingMeta(true);
    try {
      const res = await fetch(`/api/form-templates/${template.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isActive: metaDraft.isActive,
          effectiveDate: metaDraft.effectiveDate || null,
          retiredDate: metaDraft.retiredDate || null,
          docusignTemplateId: metaDraft.docusignTemplateId.trim() || null,
        }),
      });
      if (res.ok) {
        const updated: ApiFormTemplate = await res.json();
        onUpdate(updated);
        setShowSettings(false);
        setMetaDraft(null);
      }
    } finally {
      setSavingMeta(false);
    }
  }

  function openSettings() {
    setShowSettings(true);
    setMetaDraft({
      isActive: template.isActive,
      effectiveDate: template.effectiveDate ?? '',
      retiredDate: template.retiredDate ?? '',
      docusignTemplateId: template.docusignTemplateId ?? '',
    });
  }

  function closeSettings() {
    setShowSettings(false);
    setMetaDraft(null);
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white">
        <button
          onClick={() => { setOpen((p) => !p); if (editing) setEditing(false); setShowSettings(false); setMetaDraft(null); }}
          className="flex items-center gap-3 text-left flex-1 min-w-0"
        >
          {open ? <ChevronDown size={14} className="text-gray-400 shrink-0" /> : <ChevronRight size={14} className="text-gray-400 shrink-0" />}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-gray-800">{template.name}</p>
              {!template.organizationId && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200 font-medium">System</span>
              )}
              {!template.isActive && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-200 font-medium">Disabled</span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {template.transactionType.replace('_', ' ')} · {sideLabel(template.side)}
              {template.stateCode ? ` · ${template.stateCode}` : ''}
              {template.docusignTemplateId && (
                <span className="ml-2 text-[10px] text-purple-600 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded-full font-medium">DocuSign</span>
              )}
            </p>
          </div>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <DateBadge effectiveDate={template.effectiveDate} retiredDate={template.retiredDate} />
          <span className="text-xs text-gray-400">{items.length} forms</span>
          {canManage && (
            <>
              <button
                onClick={() => { setOpen(true); setEditing((p) => !p); if (showSettings) closeSettings(); }}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border transition-colors',
                  editing
                    ? 'bg-blue-700 text-white border-blue-700'
                    : 'text-gray-500 border-gray-200 hover:bg-gray-50',
                )}
              >
                <Pencil size={11} />
                {editing ? 'Done' : 'Edit forms'}
              </button>
              <button
                onClick={() => { if (showSettings) closeSettings(); else openSettings(); if (editing) setEditing(false); }}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border transition-colors',
                  showSettings
                    ? 'bg-blue-700 text-white border-blue-700'
                    : 'text-gray-500 border-gray-200 hover:bg-gray-50',
                )}
              >
                <Settings size={11} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Body */}
      {open && (
        <div className="border-t border-gray-100 px-4 py-3 bg-white">
          {template.description && !showSettings && (
            <p className="text-xs text-gray-500 mb-3">{template.description}</p>
          )}

          {/* Settings panel */}
          {showSettings && metaDraft && (
            <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-700">Template Settings</p>
                <button
                  onClick={closeSettings}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={12} />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMetaDraft((p) => p ? { ...p, isActive: !p.isActive } : p)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors',
                    metaDraft.isActive
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : 'bg-gray-50 text-gray-500 border-gray-200',
                  )}
                >
                  {metaDraft.isActive ? 'Active' : 'Disabled'}
                </button>
                <span className="text-[10px] text-gray-400">
                  {metaDraft.isActive ? 'Template is visible to agents' : 'Temporarily hidden from agents'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-1">Effective date</label>
                  <input
                    type="date"
                    value={metaDraft.effectiveDate}
                    onChange={(e) => setMetaDraft((p) => p ? { ...p, effectiveDate: e.target.value } : p)}
                    className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">Empty = immediately active</p>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-1">Retired date</label>
                  <input
                    type="date"
                    value={metaDraft.retiredDate}
                    onChange={(e) => setMetaDraft((p) => p ? { ...p, retiredDate: e.target.value } : p)}
                    className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">Empty = never expires</p>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-medium text-gray-500 mb-1">DocuSign Template ID</label>
                <input
                  type="text"
                  value={metaDraft.docusignTemplateId}
                  onChange={(e) => setMetaDraft((p) => p ? { ...p, docusignTemplateId: e.target.value } : p)}
                  placeholder="Paste your DocuSign template ID (UUID)"
                  className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
                <p className="text-[10px] text-gray-400 mt-0.5">Enables automatic template application when sending envelopes</p>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={closeSettings}
                  className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveMeta}
                  disabled={savingMeta}
                  className="px-3 py-1.5 text-xs font-medium bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50"
                >
                  {savingMeta ? 'Saving…' : 'Save settings'}
                </button>
              </div>
            </div>
          )}

          {editing ? (
            <StageEditor
              templateId={template.id}
              transactionType={template.transactionType}
              side={template.side}
              stateCode={template.stateCode}
              items={items}
              onItemsChange={handleItemsChange}
            />
          ) : (
            <>
              {displayStages.length === 0 ? (
                <div className="py-4 flex flex-col items-center gap-2 text-center">
                  <p className="text-xs text-gray-400">No forms added yet.</p>
                  {canManage && (
                    <button
                      onClick={() => setEditing(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50"
                    >
                      <Plus size={12} /> Add forms by stage
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {displayStages.map((stage) => (
                    <div key={stage}>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">{stage}</p>
                      <div className="space-y-1">
                        {byStage[stage].map((item) => (
                          <div key={item.id} className="flex items-start gap-2.5">
                            <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded shrink-0">
                              {item.formCode}
                            </span>
                            <p className="text-xs text-gray-700 leading-snug flex-1 min-w-0">{item.formName}</p>
                            <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0', item.isRequired ? REQUIRED_BADGE.mandatory : REQUIRED_BADGE.optional)}>
                              {item.isRequired ? 'required' : 'optional'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Create template modal ─────────────────────────────────────────────────────

interface CreateModalProps {
  onClose: () => void;
  onCreated: (t: ApiFormTemplate) => void;
  organizationId: string | null;
}

function CreateTemplateModal({ onClose, onCreated, organizationId }: CreateModalProps) {
  const [name, setName]               = useState('');
  const [description, setDescription] = useState('');
  const [txType, setTxType]           = useState('residential');
  const [side, setSide]               = useState('buyer_side');
  const [stateCode, setStateCode]     = useState('CA');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [retiredDate, setRetiredDate]     = useState('');
  const [docusignTemplateId, setDocusignTemplateId] = useState('');
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/form-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          organizationId: organizationId ?? undefined,
          transactionType: txType,
          side,
          stateCode: stateCode.trim() || undefined,
          effectiveDate: effectiveDate || undefined,
          retiredDate: retiredDate || undefined,
          docusignTemplateId: docusignTemplateId.trim() || undefined,
        }),
      });
      if (!res.ok) {
        let message = 'Failed to create template';
        try {
          const body = await res.json();
          if (Array.isArray(body.message)) message = body.message.join(' ');
          else if (typeof body.message === 'string') message = body.message;
        } catch { /* keep default message */ }
        setError(message);
        return;
      }
      const created: ApiFormTemplate = await res.json();
      onCreated(created);
    } catch {
      setError('Unexpected error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-900">New Organization Template</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Template name <span className="text-red-500">*</span></label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CA-Brea-Residential-Buyer"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              placeholder="Optional notes about when to use this template"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Transaction type</label>
              <select value={txType} onChange={(e) => setTxType(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="residential">Residential</option>
                <option value="income_property">Income Property</option>
                <option value="commercial">Commercial</option>
                <option value="land">Land</option>
                <option value="manufactured_home">Manufactured Home</option>
                <option value="new_construction">New Construction</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Side</label>
              <select value={side} onChange={(e) => setSide(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="buyer_side">Buyer Side</option>
                <option value="seller_side">Seller Side</option>
                <option value="dual">Dual Agency</option>
                <option value="listing">Listing</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">State</label>
            <input value={stateCode} onChange={(e) => setStateCode(e.target.value.toUpperCase())} maxLength={2} placeholder="CA"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Effective date</label>
              <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-[10px] text-gray-400 mt-0.5">Leave empty for immediate</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Retired date</label>
              <input type="date" value={retiredDate} onChange={(e) => setRetiredDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-[10px] text-gray-400 mt-0.5">Leave empty for no expiry</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">DocuSign Template ID</label>
            <input value={docusignTemplateId} onChange={(e) => setDocusignTemplateId(e.target.value)}
              placeholder="Paste your DocuSign template ID (UUID)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <p className="text-[10px] text-gray-400 mt-0.5">Enables automatic template application when sending envelopes</p>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg border border-gray-200 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm font-medium bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50">
              {saving ? 'Creating…' : 'Create template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface Props {
  orgTemplates: ApiFormTemplate[];
  canManageTemplates: boolean;
  organizationId: string | null;
  isSupportAdmin: boolean;
}

export default function FormTemplatesPageClient({ orgTemplates: initial, canManageTemplates, organizationId, isSupportAdmin }: Props) {
  const [orgTemplates, setOrgTemplates] = useState<ApiFormTemplate[]>(initial);
  const [showCreate, setShowCreate]     = useState(false);
  const [activeTab, setActiveTab]       = useState<'default' | 'org'>('default');

  // A template is editable when the caller is authorized for THAT template:
  // broker admin of the template's org, or support admin for system templates.
  function canManage(t: ApiFormTemplate): boolean {
    if (t.organizationId) return canManageTemplates && t.organizationId === organizationId;
    return isSupportAdmin;
  }

  function handleCreated(t: ApiFormTemplate) {
    setOrgTemplates((prev) => [t, ...prev]);
    setShowCreate(false);
    setActiveTab('org');
  }

  function handleUpdate(updated: ApiFormTemplate) {
    setOrgTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Form Templates</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Default template shows the CA CAR form checklist by stage. Create org-specific templates and select forms per stage.
          </p>
        </div>
        {canManageTemplates && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-blue-700 text-white rounded-lg hover:bg-blue-800 shrink-0">
            <Plus size={14} /> New template
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          ['default', 'Default (CA)', FileText],
          ['org',     `Brokerage Templates (${orgTemplates.length})`, Building2],
        ] as [string, string, React.ElementType][]).map(([tab, label, Icon]) => (
          <button key={tab} onClick={() => setActiveTab(tab as 'default' | 'org')}
            title={tab === 'org' ? 'Brokerage Transaction Templates' : undefined}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab ? 'border-blue-700 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700',
            )}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {activeTab === 'default' && (
        <div>
          <p className="text-xs text-gray-400 mb-3">
            Read-only. Sourced from <code className="bg-gray-100 px-1 rounded">src/lib/default-form-template.json</code>.
          </p>
          <DefaultTemplateViewer />
        </div>
      )}

      {activeTab === 'org' && (
        <div className="space-y-2">
          {orgTemplates.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Building2 size={32} className="text-gray-300" />
              <div>
                <p className="text-sm font-medium text-gray-500">No organization templates yet</p>
                <p className="text-xs text-gray-400 mt-0.5">Create a template to customise the form checklist for your brokerage.</p>
              </div>
              {canManageTemplates && (
                <button onClick={() => setShowCreate(true)}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-blue-700 text-white rounded-lg hover:bg-blue-800">
                  <Plus size={14} /> New template
                </button>
              )}
            </div>
          ) : (
            orgTemplates.map((t) => (
              <OrgTemplateCard key={t.id} template={t} onUpdate={handleUpdate} canManage={canManage(t)} />
            ))
          )}
        </div>
      )}

      {showCreate && (
        <CreateTemplateModal onClose={() => setShowCreate(false)} onCreated={handleCreated} organizationId={organizationId} />
      )}
    </div>
  );
}
