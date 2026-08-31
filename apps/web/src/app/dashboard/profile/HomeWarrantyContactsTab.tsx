'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Star, Loader2, Building2, Mail, Phone, Globe, ExternalLink } from 'lucide-react';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/client-api';
import { cn } from '@/lib/utils';
import type { HomeWarrantyContactDto } from '@tc/shared';

const EMPTY_FORM = {
  contactName: '', jobTitle: '', companyName: '', email: '',
  officePhone: '', website: '', orderingPortalUrl: '', isDefault: false,
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
      <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required={required} className={FIELD_CLS} />
    </div>
  );
}

export function HomeWarrantyContactsTab() {
  const [contacts, setContacts] = useState<HomeWarrantyContactDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet('/home-warranty-contacts');
      if (res.ok) setContacts(await res.json() as HomeWarrantyContactDto[]);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  function startAdd() { setForm({ ...EMPTY_FORM }); setEditingId(null); setShowForm(true); setFormError(null); }
  function startEdit(c: HomeWarrantyContactDto) {
    setForm({ contactName: c.contactName, jobTitle: c.jobTitle ?? '', companyName: c.companyName, email: c.email, officePhone: c.officePhone ?? '', website: c.website ?? '', orderingPortalUrl: c.orderingPortalUrl ?? '', isDefault: c.isDefault });
    setEditingId(c.id); setShowForm(true); setFormError(null);
  }
  function cancelForm() { setShowForm(false); setEditingId(null); }

  async function handleSave() {
    if (!form.contactName.trim() || !form.companyName.trim() || !form.email.trim()) {
      setFormError('Contact name, company, and email are required.'); return;
    }
    setSaving(true); setFormError(null);
    try {
      let res;
      if (editingId) res = await apiPatch(`/home-warranty-contacts/${editingId}`, form);
      else res = await apiPost('/home-warranty-contacts', form);
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        setFormError(body.message ?? 'Failed to save.');
      } else { setShowForm(false); setEditingId(null); fetchContacts(); }
    } catch { setFormError('Unable to reach the server.'); }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this home warranty contact?')) return;
    try { await apiDelete(`/home-warranty-contacts/${id}`); fetchContacts(); } catch { /* ignore */ }
  }

  async function handleSetDefault(id: string) {
    try { const res = await apiPatch(`/home-warranty-contacts/${id}/set-default`, {}); if (res.ok) fetchContacts(); } catch { /* ignore */ }
  }

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-gray-400" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">Home Warranty Representatives</h3>
          <p className="text-xs text-gray-400 mt-0.5">Save home warranty contacts for reuse across transactions.</p>
        </div>
        <button type="button" onClick={startAdd} className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 px-2.5 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
          <Plus size={13} /> Add Contact
        </button>
      </div>

      {contacts.length === 0 && !showForm && (
        <div className="text-center py-8 text-sm text-gray-400">
          <Building2 size={32} className="mx-auto mb-2 text-gray-300" />
          No home warranty contacts saved yet.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {contacts.map((c) => (
        <div key={c.id} className={cn('border rounded-lg p-3', c.isDefault ? 'border-blue-200 bg-blue-50/40' : 'border-gray-200')}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-800">{c.contactName}</span>
                {c.jobTitle && <span className="text-xs text-gray-400">{c.jobTitle}</span>}
                {c.isDefault && <span className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded"><Star size={10} /> Preferred</span>}
              </div>
              <div className="space-y-1 text-xs text-gray-500">
                <div className="flex items-center gap-1.5"><Building2 size={11} className="shrink-0" />{c.companyName}</div>
                <div className="flex items-center gap-1.5"><Mail size={11} className="shrink-0" />{c.email}</div>
                {c.officePhone && <div className="flex items-center gap-1.5"><Phone size={11} className="shrink-0" />{c.officePhone}</div>}
                {c.website && <div className="flex items-center gap-1.5"><Globe size={11} className="shrink-0" />{c.website}</div>}
                {c.orderingPortalUrl && <div className="flex items-center gap-1.5"><ExternalLink size={11} className="shrink-0" />{c.orderingPortalUrl}</div>}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {!c.isDefault && <button type="button" onClick={() => handleSetDefault(c.id)} title="Set as preferred" className="p-1.5 text-gray-400 hover:text-blue-600 rounded"><Star size={13} /></button>}
              <button type="button" onClick={() => startEdit(c)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded"><Pencil size={13} /></button>
              <button type="button" onClick={() => handleDelete(c.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded"><Trash2 size={13} /></button>
            </div>
          </div>
        </div>
      ))}
      </div>

      {showForm && (
        <div className="border border-blue-200 rounded-lg p-4 space-y-3 bg-blue-50/30">
          <h4 className="text-sm font-medium text-gray-700">{editingId ? 'Edit Contact' : 'Add Home Warranty Contact'}</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Contact Name" id="hw_name" value={form.contactName} onChange={(v) => setForm({ ...form, contactName: v })} placeholder="e.g. John Doe" required />
            <Field label="Job Title" id="hw_title" value={form.jobTitle} onChange={(v) => setForm({ ...form, jobTitle: v })} placeholder="e.g. Sales Rep" />
            <Field label="Company Name" id="hw_company" value={form.companyName} onChange={(v) => setForm({ ...form, companyName: v })} placeholder="e.g. Fidelity Home Warranty" required />
            <Field label="Email" id="hw_email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" placeholder="john@warranty.com" required />
            <Field label="Office Phone" id="hw_phone" value={form.officePhone} onChange={(v) => setForm({ ...form, officePhone: v })} type="tel" placeholder="+1 (555) 000-0000" />
            <Field label="Website" id="hw_web" value={form.website} onChange={(v) => setForm({ ...form, website: v })} placeholder="https://fidelityhomewarranty.com" />
          </div>
          <Field label="Ordering Portal URL" id="hw_portal" value={form.orderingPortalUrl} onChange={(v) => setForm({ ...form, orderingPortalUrl: v })} placeholder="https://portal.fidelityhomewarranty.com/order" />
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={form.isDefault ?? false} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} className="rounded" />
            Set as preferred home warranty representative
          </label>
          {formError && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{formError}</div>}
          <div className="flex items-center gap-2 pt-1">
            <button type="button" onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50">
              {saving ? <><Loader2 size={12} className="animate-spin" /> Saving...</> : 'Save Contact'}
            </button>
            <button type="button" onClick={cancelForm} className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
