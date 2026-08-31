'use client';

import { useState } from 'react';
import { Clock, RotateCcw, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ApiTransaction, ApiClockSettings } from '@/lib/api';

interface Row {
  transaction: ApiTransaction;
  clockSettings: ApiClockSettings | null;
}

interface Props {
  rows: Row[];
}

// All US-state IANA timezones offered in the picker
const TIMEZONE_OPTIONS = [
  { label: 'Pacific (CA, OR, WA, NV)',          value: 'America/Los_Angeles' },
  { label: 'Mountain (CO, MT, UT, WY)',          value: 'America/Denver' },
  { label: 'Mountain – no DST (AZ)',             value: 'America/Phoenix' },
  { label: 'Central (TX, IL, MN, MO)',           value: 'America/Chicago' },
  { label: 'Eastern (NY, FL, GA, PA)',           value: 'America/New_York' },
  { label: 'Eastern – no DST (IN)',              value: 'America/Indiana/Indianapolis' },
  { label: 'Alaska (AK)',                        value: 'America/Anchorage' },
  { label: 'Hawaii (HI)',                        value: 'Pacific/Honolulu' },
];

function formatEffectiveNow(offsetMs: string | null, timezone: string): string {
  const now = Date.now() + (offsetMs ? Number(offsetMs) : 0);
  return new Date(now).toLocaleString('en-US', {
    timeZone: timezone,
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function localIsoNow(): string {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function humanize(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ClockPageClient({ rows }: Props) {
  const [selectedId, setSelectedId]           = useState<string | null>(null);
  const [clockMap, setClockMap]               = useState<Record<string, ApiClockSettings | null>>(
    Object.fromEntries(rows.map((r) => [r.transaction.id, r.clockSettings])),
  );
  const [virtualNow, setVirtualNow]           = useState(localIsoNow);
  const [timezone, setTimezone]               = useState(TIMEZONE_OPTIONS[0].value);
  const [saving, setSaving]                   = useState(false);
  const [error, setError]                     = useState<string | null>(null);

  const selected = selectedId ? rows.find((r) => r.transaction.id === selectedId) ?? null : null;

  function handleSelect(row: Row) {
    setSelectedId(row.transaction.id);
    setError(null);
    // Pre-fill controls from this row's current settings
    const cs = clockMap[row.transaction.id];
    setTimezone(cs?.timezone ?? TIMEZONE_OPTIONS[0].value);
    setVirtualNow(localIsoNow());
  }

  async function patch(id: string, body: object) {
    setSaving(true);
    setError(null);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
      const res = await fetch(`${apiBase}/api/v1/transactions/${id}/clock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated: ApiClockSettings = await res.json();
      setClockMap((prev) => ({ ...prev, [id]: updated }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function applyClock() {
    if (!selectedId) return;
    await patch(selectedId, {
      virtualNow: new Date(virtualNow).toISOString(),
      timezone,
    });
  }

  async function resetClock() {
    if (!selectedId) return;
    await patch(selectedId, { virtualNow: null });
  }

  return (
    <div className="space-y-4">
      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs font-medium text-gray-500">
              <th className="text-left px-4 py-3">Transaction</th>
              <th className="text-left px-4 py-3">Address</th>
              <th className="text-left px-4 py-3">Stage</th>
              <th className="text-left px-4 py-3">Timezone</th>
              <th className="text-left px-4 py-3">Effective time</th>
              <th className="text-left px-4 py-3">Clock</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map(({ transaction: tx }) => {
              const cs        = clockMap[tx.id];
              const isVirtual = !!cs?.virtualClockOffsetMs;
              const tz        = cs?.timezone ?? 'America/Los_Angeles';
              const isSelected = selectedId === tx.id;
              const address   = [tx.propertyAddressLine1, tx.propertyCity, tx.propertyState]
                .filter(Boolean).join(', ') || 'Address TBD';

              return (
                <tr
                  key={tx.id}
                  onClick={() => handleSelect({ transaction: tx, clockSettings: cs ?? null })}
                  className={cn(
                    'cursor-pointer transition-colors',
                    isSelected
                      ? 'bg-blue-50'
                      : isVirtual
                        ? 'bg-amber-50/60 hover:bg-amber-50'
                        : 'hover:bg-gray-50',
                  )}
                >
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    #{tx.transactionNumber}
                  </td>
                  <td className="px-4 py-3 text-gray-800 max-w-[180px] truncate">
                    {address}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
                      {humanize(tx.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{tz}</td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-700">
                    {formatEffectiveNow(cs?.virtualClockOffsetMs ?? null, tz)}
                  </td>
                  <td className="px-4 py-3">
                    {isVirtual ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        <Clock size={9} /> virtual
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-400">real</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-gray-300">
                    <ChevronRight size={14} className={isSelected ? 'text-blue-500' : ''} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Settings panel — shown when a row is selected */}
      {selected && (
        <div className="rounded-xl border border-blue-200 bg-white p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              {[selected.transaction.propertyAddressLine1, selected.transaction.propertyCity, selected.transaction.propertyState]
                .filter(Boolean).join(', ') || 'Address TBD'}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">#{selected.transaction.transactionNumber}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Virtual date/time */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600">Set virtual date & time</label>
              <input
                type="datetime-local"
                value={virtualNow}
                onChange={(e) => setVirtualNow(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-blue-400"
              />
            </div>

            {/* Timezone */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600">Timezone</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-blue-400 bg-white"
              >
                {TIMEZONE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={applyClock}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Applying…' : 'Apply'}
            </button>
            {clockMap[selected.transaction.id]?.virtualClockOffsetMs && (
              <button
                onClick={resetClock}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                <RotateCcw size={13} />
                Reset to real time
              </button>
            )}
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
