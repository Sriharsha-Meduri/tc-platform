'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Star, Loader2, Building2, Mail, Phone, MapPin } from 'lucide-react';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/client-api';
import { cn } from '@/lib/utils';
import type { TitleContactDto, CreateTitleContactDto } from '@tc/shared';

const EMPTY_FORM: CreateTitleContactDto = {
  contactName: '',
  companyName: '',
  email: '',
  cellPhone: '',
  addressLine1: '',
  city: '',
  state: '',
  zipCode: '',
  isDefault: false,
};

const FIELD_CLS = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400';

function Field({ label, id, value, onChange, type = 'text', placeholder, required = false }: {
  label: string; id: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-gray-600 mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input
        id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} required={required} className={FIELD_CLS}
      />
    </div>
  );
}

export function TitleContactsTab() {
  const [contacts, setContacts] = useState<TitleContactDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateTitleContactDto>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet('/title-contacts');
      if (res.ok) {
        setContacts(await res.json() as TitleContactDto[]);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  function startAdd() {
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
    setShowForm(true);
    setFormError(null);
  }

  function startEdit(c: TitleContactDto) {
    setForm({
      contactName: c.contactName,
      companyName: c.companyName,
      email: c.email,
      cellPhone: c.cellPhone,
      addressLine1: c.addressLine1 ?? '',
      city: c.city ?? '',
      state: c.state ?? '',
      zipCode: c.zipCode ?? '',
      isDefault: c.isDefault,
    });
    setEditingId(c.id);
    setShowForm(true);
    setFormError(null);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
  }

  async function handleSave() {
    if (!form.contactName.trim() || !form.companyName.trim() || !form.email.trim() || !form.cellPhone.trim()) {
      setFormError('Contact name, company, email, and cell phone are required.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      let res;
      if (editingId) {
        res = await apiPatch(`/title-contacts/${editingId}`, form);
      } else {
        res = await apiPost('/title-contacts', form);
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        setFormError(body.message ?? 'Failed to save.');
      } else {
        setShowForm(false);
        setEditingId(null);
        fetchContacts();
      }
    } catch {
      setFormError('Unable to reach the server.');
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this title contact?')) return;
    try {
      await apiDelete(`/title-contacts/${id}`);
      fetchContacts();
    } catch { /* ignore */ }
  }

  async function handleSetDefault(id: string) {
    try {
      const res = await apiPatch(`/title-contacts/${id}/set-default`, {});
      if (res.ok) fetchContacts();
    } catch { /* ignore */ }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">Title Representatives</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Save title company contacts for reuse across transactions.
          </p>
        </div>
        <button
          type="button"
          onClick={startAdd}
          className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 px-2.5 py-1.5 bg-blue-50 border border-blue-200 rounded-lg"
        >
          <Plus size={13} /> Add Contact
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>
      )}

      {contacts.length === 0 && !showForm && (
        <div className="text-center py-8 text-sm text-gray-400">
          <Building2 size={32} className="mx-auto mb-2 text-gray-300" />
          No title contacts saved yet. Add your first one to use across transactions.
        </div>
      )}

      {/* Contact list */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {contacts.map((c) => (
        <div key={c.id} className={cn(
          'border rounded-lg p-3',
          c.isDefault ? 'border-blue-200 bg-blue-50/40' : 'border-gray-200',
        )}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-800">{c.contactName}</span>
                {c.isDefault && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">
                    <Star size={10} /> Default
                  </span>
                )}
              </div>
              <div className="space-y-1 text-xs text-gray-500">
                <div className="flex items-center gap-1.5">
                  <Building2 size={11} className="shrink-0" />
                  {c.companyName}
                </div>
                <div className="flex items-center gap-1.5">
                  <Mail size={11} className="shrink-0" />
                  {c.email}
                </div>
                <div className="flex items-center gap-1.5">
                  <Phone size={11} className="shrink-0" />
                  {c.cellPhone}
                </div>
                {(c.addressLine1 || c.city || c.state) && (
                  <div className="flex items-center gap-1.5">
                    <MapPin size={11} className="shrink-0" />
                    {[c.addressLine1, c.city, c.state, c.zipCode].filter(Boolean).join(', ')}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {!c.isDefault && (
                <button
                  type="button"
                  onClick={() => handleSetDefault(c.id)}
                  title="Set as default"
                  className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                >
                  <Star size={13} />
                </button>
              )}
              <button
                type="button"
                onClick={() => startEdit(c)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
              >
                <Pencil size={13} />
              </button>
              <button
                type="button"
                onClick={() => handleDelete(c.id)}
                className="p-1.5 text-gray-400 hover:text-red-500 rounded"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        </div>
      ))}
      </div>

      {/* Add/Edit form */}
      {showForm && (
        <div className="border border-blue-200 rounded-lg p-4 space-y-3 bg-blue-50/30">
          <h4 className="text-sm font-medium text-gray-700">
            {editingId ? 'Edit Contact' : 'Add Title Contact'}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Contact Name" id="tc_name" value={form.contactName} onChange={(v) => setForm({ ...form, contactName: v })} placeholder="e.g. Jane Smith" required />
            <Field label="Company Name" id="tc_company" value={form.companyName} onChange={(v) => setForm({ ...form, companyName: v })} placeholder="e.g. Fidelity Title" required />
            <Field label="Email" id="tc_email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" placeholder="jane@title.com" required />
            <Field label="Cell Phone" id="tc_phone" value={form.cellPhone} onChange={(v) => setForm({ ...form, cellPhone: v })} type="tel" placeholder="+1 (555) 000-0000" required />
            <Field label="Street Address" id="tc_addr" value={form.addressLine1!} onChange={(v) => setForm({ ...form, addressLine1: v })} placeholder="123 Main St" />
            <Field label="City" id="tc_city" value={form.city!} onChange={(v) => setForm({ ...form, city: v })} placeholder="Los Angeles" />
            <Field label="State" id="tc_state" value={form.state!} onChange={(v) => setForm({ ...form, state: v })} placeholder="CA" />
            <Field label="ZIP Code" id="tc_zip" value={form.zipCode!} onChange={(v) => setForm({ ...form, zipCode: v })} placeholder="90001" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={form.isDefault ?? false}
              onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
              className="rounded"
            />
            Set as default title representative
          </label>
          {formError && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{formError}</div>
          )}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50"
            >
              {saving ? <><Loader2 size={12} className="animate-spin" /> Saving...</> : 'Save Contact'}
            </button>
            <button
              type="button"
              onClick={cancelForm}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
