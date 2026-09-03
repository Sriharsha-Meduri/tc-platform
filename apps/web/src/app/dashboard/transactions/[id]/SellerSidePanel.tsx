'use client';

import { useEffect, useState } from 'react';
import { Loader2, Mail, FileCheck2, Send, Save, CheckCircle2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiGet, apiPatch, apiPost } from '@/lib/client-api';

interface SellerSideInfo {
  preferredEscrowCompany: string | null;
  preferredTitleCompany: string | null;
  titleContactName: string | null;
  titleContactEmail: string | null;
  titleContactPhone: string | null;
  sellerAgentCommission: number | null;
  homeWarrantyCompany: string | null;
  sellerPaysHomeWarranty: boolean | null;
  nhdCompany: string | null;
}

type PacketStatus = 'sent_to_seller' | 'seller_completed' | 'tc_reviewed' | 'sent_to_buyer';

interface Packet {
  status: PacketStatus;
  sellerCompletedAt: string | null;
  reviewedAt: string | null;
  forwardedAt: string | null;
}

const EMPTY: SellerSideInfo = {
  preferredEscrowCompany: '', preferredTitleCompany: '', titleContactName: '',
  titleContactEmail: '', titleContactPhone: '', sellerAgentCommission: null,
  homeWarrantyCompany: '', sellerPaysHomeWarranty: null, nhdCompany: '',
};

const PACKET_STEPS: { key: PacketStatus; label: string }[] = [
  { key: 'sent_to_seller', label: 'Sent to seller' },
  { key: 'seller_completed', label: 'Seller completed' },
  { key: 'tc_reviewed', label: 'TC reviewed' },
  { key: 'sent_to_buyer', label: 'Sent to buyer' },
];

function Note({ kind, text }: { kind: 'ok' | 'err'; text: string }) {
  return (
    <div
      role={kind === 'err' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-lg px-3 py-2 text-sm',
        kind === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700',
      )}
    >
      {kind === 'ok' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
      <span>{text}</span>
    </div>
  );
}

export default function SellerSidePanel({ transactionId }: { transactionId: string }) {
  const [info, setInfo] = useState<SellerSideInfo>(EMPTY);
  const [packet, setPacket] = useState<Packet | null>(null);
  const [saving, setSaving] = useState(false);
  const [sendingEscrow, setSendingEscrow] = useState(false);
  const [packetBusy, setPacketBusy] = useState(false);
  const [escrowNote, setEscrowNote] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [packetNote, setPacketNote] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [saveNote, setSaveNote] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const [infoRes, packetRes] = await Promise.all([
        apiGet(`/transactions/${transactionId}/seller-side-information`),
        apiGet(`/transactions/${transactionId}/disclosure-packet`),
      ]);
      if (!active) return;
      if (infoRes.ok) {
        const data = await infoRes.json();
        if (data) setInfo({ ...EMPTY, ...data });
      }
      if (packetRes.ok) {
        const data = await packetRes.json();
        if (data) setPacket(data);
      }
    })();
    return () => { active = false; };
  }, [transactionId]);

  function set<K extends keyof SellerSideInfo>(key: K, value: SellerSideInfo[K]) {
    setInfo((prev) => ({ ...prev, [key]: value }));
  }

  async function saveInfo() {
    setSaving(true);
    setSaveNote(null);
    try {
      const res = await apiPatch(`/transactions/${transactionId}/seller-side-information`, {
        ...info,
        sellerAgentCommission:
          info.sellerAgentCommission === null || (info.sellerAgentCommission as unknown) === ''
            ? null
            : Number(info.sellerAgentCommission),
      });
      setSaveNote(res.ok ? { kind: 'ok', text: 'Saved.' } : { kind: 'err', text: 'Could not save the seller-side details.' });
    } finally {
      setSaving(false);
    }
  }

  async function sendEscrowEmail() {
    setSendingEscrow(true);
    setEscrowNote(null);
    try {
      const res = await apiPost(`/transactions/${transactionId}/escrow-opening-email`, {});
      const data = await res.json().catch(() => null);
      if (res.ok && data?.sent) {
        setEscrowNote({ kind: 'ok', text: `Escrow opening email sent to ${data.recipients?.join(', ')}.` });
      } else if (res.ok && !data?.sent) {
        setEscrowNote({ kind: 'ok', text: 'Already sent for this transaction.' });
      } else {
        setEscrowNote({ kind: 'err', text: data?.message ?? 'Could not send the escrow opening email.' });
      }
    } finally {
      setSendingEscrow(false);
    }
  }

  async function packetAction(path: string, okText: string) {
    setPacketBusy(true);
    setPacketNote(null);
    try {
      const res = await apiPost(`/transactions/${transactionId}/disclosure-packet/${path}`, {});
      const data = await res.json().catch(() => null);
      if (res.ok && data?.status) {
        setPacket(data);
        setPacketNote({ kind: 'ok', text: okText });
      } else {
        setPacketNote({ kind: 'err', text: data?.message ?? 'That step could not be completed.' });
      }
    } finally {
      setPacketBusy(false);
    }
  }

  const status = packet?.status ?? 'sent_to_seller';
  const activeIndex = PACKET_STEPS.findIndex((s) => s.key === status);

  const inputCls =
    'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500';
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1';

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/40">
      <div className="border-b border-emerald-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-emerald-800">Seller Side Coordination</h2>
        <p className="text-xs text-emerald-700/80">Escrow opening and the seller disclosure packet for this listing.</p>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-2">
        {/* Escrow opening */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <Mail className="h-4 w-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-gray-900">Escrow opening</h3>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>Preferred escrow company</label>
              <input className={inputCls} value={info.preferredEscrowCompany ?? ''} onChange={(e) => set('preferredEscrowCompany', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Preferred title company</label>
              <input className={inputCls} value={info.preferredTitleCompany ?? ''} onChange={(e) => set('preferredTitleCompany', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Title contact name</label>
              <input className={inputCls} value={info.titleContactName ?? ''} onChange={(e) => set('titleContactName', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Title contact email</label>
              <input className={inputCls} value={info.titleContactEmail ?? ''} onChange={(e) => set('titleContactEmail', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Seller agent commission</label>
              <input type="number" className={inputCls} value={info.sellerAgentCommission ?? ''} onChange={(e) => set('sellerAgentCommission', e.target.value === '' ? null : Number(e.target.value))} />
            </div>
            <div>
              <label className={labelCls}>Home warranty company</label>
              <input className={inputCls} value={info.homeWarrantyCompany ?? ''} onChange={(e) => set('homeWarrantyCompany', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>NHD company</label>
              <input className={inputCls} value={info.nhdCompany ?? ''} onChange={(e) => set('nhdCompany', e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  checked={info.sellerPaysHomeWarranty === true}
                  onChange={(e) => set('sellerPaysHomeWarranty', e.target.checked)}
                />
                Seller pays for the home warranty
              </label>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={saveInfo}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save details
            </button>
            <button
              onClick={sendEscrowEmail}
              disabled={sendingEscrow}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {sendingEscrow ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Send escrow opening email
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {saveNote && <Note kind={saveNote.kind} text={saveNote.text} />}
            {escrowNote && <Note kind={escrowNote.kind} text={escrowNote.text} />}
          </div>
        </div>

        {/* Disclosure packet */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <FileCheck2 className="h-4 w-4 text-emerald-600" />
            <h3 className="text-sm font-semibold text-gray-900">Disclosure packet</h3>
          </div>

          {/* Progress */}
          <ol className="mb-4 space-y-2">
            {PACKET_STEPS.map((step, i) => {
              const done = i <= activeIndex;
              return (
                <li key={step.key} className="flex items-center gap-2 text-sm">
                  <span
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold',
                      done ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-500',
                    )}
                  >
                    {done ? '✓' : i + 1}
                  </span>
                  <span className={cn(done ? 'text-gray-900' : 'text-gray-500')}>{step.label}</span>
                </li>
              );
            })}
          </ol>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => packetAction('seller-completed', 'Marked as completed by the seller.')}
              disabled={packetBusy || activeIndex >= 1}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Mark seller completed
            </button>
            <button
              onClick={() => packetAction('review', 'Marked reviewed by the TC.')}
              disabled={packetBusy || activeIndex < 1 || activeIndex >= 2}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Mark reviewed
            </button>
            <button
              onClick={() => packetAction('forward', 'Forwarded to the buyer side.')}
              disabled={packetBusy || activeIndex < 2 || activeIndex >= 3}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {packetBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Forward to buyer
            </button>
          </div>
          {packetNote && <div className="mt-3"><Note kind={packetNote.kind} text={packetNote.text} /></div>}
        </div>
      </div>
    </div>
  );
}
