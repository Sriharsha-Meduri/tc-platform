'use client';

import { useEffect, useState } from 'react';
import { Loader2, CheckSquare, Square, ChevronDown, ChevronUp, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Data shapes ──────────────────────────────────────────────────────────────

export interface SelectedForm {
  formCode: string;
  formName: string;
  category: string;
  isRequired: boolean;
}

export interface Step2Data {
  templateId: string | null;
  templateName: string | null;
  selectedForms: SelectedForm[];
}

interface TemplateItem {
  id: string;
  formCode: string;
  formName: string;
  category: string;
  isRequired: boolean;
  sortOrder: number;
  notes: string | null;
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  stateCode: string | null;
  transactionType: string;
  side: string;
  isSystem: boolean;
  items: TemplateItem[];
}

// ── Category display config ───────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  purchase_agreement:       'Purchase Agreement',
  counter_offer:            'Counter Offer',
  listing_agreement:        'Listing Agreement',
  buyer_representation:     'Buyer Representation',
  disclosure:               'Disclosures',
  advisory:                 'Advisories',
  addendum:                 'Addenda',
  contingency_performance:  'Contingencies & Performance',
  inspection_repair:        'Inspection & Repair',
  finance:                  'Finance',
  federal_compliance:       'Federal Compliance',
  commercial:               'Commercial',
  lease_rental:             'Lease / Rental',
  probate_estate:           'Probate & Estate',
  new_construction:         'New Construction',
  property_management:      'Property Management',
};

const CATEGORY_ORDER = [
  'purchase_agreement', 'listing_agreement', 'buyer_representation',
  'counter_offer', 'contingency_performance', 'disclosure', 'advisory',
  'addendum', 'inspection_repair', 'finance', 'federal_compliance',
  'lease_rental', 'commercial', 'new_construction', 'probate_estate', 'property_management',
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  stateCode: string;
  transactionType: string;
  side: string;
  data: Step2Data;
  onChange: (patch: Partial<Step2Data>) => void;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Step2FormChecklist({ stateCode, transactionType, side, data, onChange }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

  // ── Load all matching templates ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      transactionType,
      side,
      ...(stateCode ? { stateCode } : {}),
    });

    fetch(`${apiUrl}/api/v1/form-templates?${params}`)
      .then((r) => r.ok ? r.json() as Promise<Template[]> : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((list) => {
        if (cancelled) return;
        setTemplates(list);

        // Auto-select first (best) template if none chosen yet or template changed
        const best = list[0];
        if (best && (!data.templateId || !list.find((t) => t.id === data.templateId))) {
          applyTemplate(best);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load form templates');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateCode, transactionType, side]);

  // ── Apply a template (pre-check all its items) ────────────────────────────
  function applyTemplate(template: Template) {
    onChange({
      templateId: template.id,
      templateName: template.name,
      selectedForms: template.items.map((item) => ({
        formCode: item.formCode,
        formName: item.formName,
        category: item.category,
        isRequired: item.isRequired,
      })),
    });
  }

  // ── Current template items (from selected template) ───────────────────────
  const activeTemplate = templates.find((t) => t.id === data.templateId) ?? templates[0];
  const items = activeTemplate?.items ?? [];

  // ── Form check/uncheck ────────────────────────────────────────────────────
  function isChecked(formCode: string): boolean {
    return data.selectedForms.some((f) => f.formCode === formCode);
  }

  function toggleForm(item: TemplateItem) {
    if (isChecked(item.formCode)) {
      onChange({ selectedForms: data.selectedForms.filter((f) => f.formCode !== item.formCode) });
    } else {
      onChange({
        selectedForms: [
          ...data.selectedForms,
          { formCode: item.formCode, formName: item.formName, category: item.category, isRequired: item.isRequired },
        ],
      });
    }
  }

  function selectAll() {
    onChange({
      selectedForms: items.map((item) => ({
        formCode: item.formCode, formName: item.formName,
        category: item.category, isRequired: item.isRequired,
      })),
    });
  }

  function clearOptional() {
    onChange({ selectedForms: data.selectedForms.filter((f) => f.isRequired) });
  }

  // ── Group items by category ───────────────────────────────────────────────
  const grouped = items.reduce<Record<string, TemplateItem[]>>((acc, item) => {
    (acc[item.category] ??= []).push(item);
    return acc;
  }, {});

  const sortedCategories = CATEGORY_ORDER.filter((c) => grouped[c]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const selectedRequired = data.selectedForms.filter((f) => f.isRequired).length;
  const totalRequired    = items.filter((i) => i.isRequired).length;
  const selectedOptional = data.selectedForms.filter((f) => !f.isRequired).length;

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center p-16 text-gray-400">
        <Loader2 size={24} className="animate-spin mr-3" />
        <span className="text-sm">Loading form templates…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <AlertCircle size={32} className="mx-auto mb-3 text-red-400" />
        <p className="text-sm text-red-600 mb-4">{error}</p>
        <button type="button" onClick={() => window.location.reload()} className="flex items-center gap-2 mx-auto px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
          <RefreshCw size={14} />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {/* Template picker + stats */}
      <div className="px-6 py-4 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Form Package</p>
            <select
              value={data.templateId ?? ''}
              onChange={(e) => {
                const tpl = templates.find((t) => t.id === e.target.value);
                if (tpl) applyTemplate(tpl);
              }}
              className="h-9 pl-3 pr-8 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 appearance-none cursor-pointer"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}{t.isSystem ? '' : ' (Custom)'}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={selectAll}
              className="text-xs font-medium text-blue-700 hover:text-blue-800 border border-blue-200 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={clearOptional}
              className="text-xs font-medium text-gray-600 hover:text-gray-800 border border-gray-200 bg-gray-50 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Required Only
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>
            <span className="font-semibold text-gray-800">{selectedRequired}/{totalRequired}</span> required forms
          </span>
          <span className="text-gray-300">|</span>
          <span>
            <span className="font-semibold text-gray-800">{selectedOptional}</span> optional added
          </span>
          <span className="text-gray-300">|</span>
          <span>
            <span className="font-semibold text-gray-800">{data.selectedForms.length}</span> total selected
          </span>
        </div>
      </div>

      {/* Category sections */}
      {sortedCategories.map((category) => {
        const categoryItems = grouped[category];
        const checkedCount = categoryItems.filter((i) => isChecked(i.formCode)).length;
        const isCollapsed = collapsedCategories.has(category);

        return (
          <div key={category}>
            <button
              type="button"
              onClick={() => {
                setCollapsedCategories((prev) => {
                  const next = new Set(prev);
                  if (next.has(category)) next.delete(category);
                  else next.add(category);
                  return next;
                });
              }}
              className="w-full flex items-center justify-between px-6 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                  {CATEGORY_LABELS[category] ?? category}
                </span>
                <span className={cn(
                  'text-xs px-1.5 py-0.5 rounded font-medium',
                  checkedCount === categoryItems.length
                    ? 'bg-blue-100 text-blue-700'
                    : checkedCount > 0
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-gray-200 text-gray-500',
                )}>
                  {checkedCount}/{categoryItems.length}
                </span>
              </div>
              {isCollapsed
                ? <ChevronDown size={14} className="text-gray-400" />
                : <ChevronUp size={14} className="text-gray-400" />}
            </button>

            {!isCollapsed && (
              <div className="divide-y divide-gray-50">
                {categoryItems.map((item) => {
                  const checked = isChecked(item.formCode);
                  return (
                    <button
                      key={item.formCode}
                      type="button"
                      onClick={() => toggleForm(item)}
                      className={cn(
                        'w-full flex items-center gap-3 px-6 py-3 text-left transition-colors',
                        checked ? 'bg-blue-50 hover:bg-blue-100' : 'bg-white hover:bg-gray-50',
                      )}
                    >
                      <span className={cn('shrink-0', checked ? 'text-blue-600' : 'text-gray-300')}>
                        {checked
                          ? <CheckSquare size={18} />
                          : <Square size={18} />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn(
                            'text-xs font-mono font-semibold px-1.5 py-0.5 rounded',
                            checked ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600',
                          )}>
                            {item.formCode}
                          </span>
                          <span className={cn(
                            'text-sm font-medium',
                            checked ? 'text-blue-900' : 'text-gray-800',
                          )}>
                            {item.formName}
                          </span>
                          {item.isRequired && (
                            <span className="text-xs font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-100">
                              Required
                            </span>
                          )}
                        </div>
                        {item.notes && (
                          <p className="text-xs text-gray-400 mt-0.5">{item.notes}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {items.length === 0 && (
        <div className="px-6 py-12 text-center text-sm text-gray-400">
          No forms found for the selected template.
        </div>
      )}
    </div>
  );
}
