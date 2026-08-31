'use client';

import { useEffect, useState } from 'react';
import { X, Loader2, AlertCircle, Bell, Clock, CheckCircle, Ban, Plus, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReminderItem {
  id: string;
  transactionEventId: string;
  eventType: string;
  eventLabel: string;
  eventDate: string | null;
  transactionStage: string | null;
  offsetLabel: string;
  offsetDisplay: string;
  scheduledFireAt: string;
  status: string;
  sentAt: string | null;
  cancelledAt: string | null;
  isCancellable: boolean;
}

interface PastEventItem {
  transactionEventId: string;
  eventType: string;
  eventLabel: string;
  eventDate: string;
  transactionStage: string | null;
}

interface CustomReminderItem {
  id: string;
  subject: string;
  message: string | null;
  fireAt: string;
  status: string;
  sentAt: string | null;
  cancelledAt: string | null;
  isCancellable: boolean;
  recipients: string[] | null;
}

interface ReminderListResponse {
  cutoffMinutes: number;
  reminders: ReminderItem[];
  pastEvents: PastEventItem[];
  customReminders: CustomReminderItem[];
}

interface EventGroup {
  transactionEventId: string;
  eventLabel: string;
  eventDate: string | null;
  reminders: ReminderItem[];
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function humanizeOffset(offsetDisplay: string): string {
  if (offsetDisplay === 'day-of') return 'Day of event';
  return `${offsetDisplay} before`;
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'sent') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
        <CheckCircle size={10} /> Sent
      </span>
    );
  }
  if (status === 'cancelled') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">
        <Ban size={10} /> Cancelled
      </span>
    );
  }
  if (status === 'skipped') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">
        Skipped
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
      <Clock size={10} /> Scheduled
    </span>
  );
}

interface Props {
  transactionId: string;
  stage: string;
  stageLabel: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function ReminderScheduleDialog({
  transactionId,
  stage,
  stageLabel,
  isOpen,
  onClose,
}: Props) {
  const [data, setData] = useState<ReminderListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidError, setVoidError] = useState<string | null>(null);

  // Add notification form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [addFireAt, setAddFireAt] = useState('');
  const [addSubject, setAddSubject] = useState('');
  const [addMessage, setAddMessage] = useState('');
  const [addRecipients, setAddRecipients] = useState<string[]>([]);
  const [showRecipientDropdown, setShowRecipientDropdown] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  async function fetchReminders() {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`/api/v1/transactions/${transactionId}/reminders`);
      if (!res.ok) throw new Error(`Failed to load reminders (${res.status})`);
      setData(await res.json() as ReminderListResponse);
    } catch (err) {
      setFetchError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isOpen) return;
    setVoidError(null);
    setShowAddForm(false);
    setShowRecipientDropdown(false);
    setAddRecipients([]);
    setAddError(null);
    void fetchReminders();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, transactionId]);

  async function handleVoid(reminderId: string) {
    setVoidingId(reminderId);
    setVoidError(null);
    try {
      const res = await fetch(
        `/api/v1/transactions/${transactionId}/reminders/${reminderId}`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'Voided by user' }),
        },
      );
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(body.message ?? `Failed to void reminder (${res.status})`);
      }
      await fetchReminders();
    } catch (err) {
      setVoidError((err as Error).message);
    } finally {
      setVoidingId(null);
    }
  }

  async function handleCancelCustom(reminderId: string) {
    setVoidingId(reminderId);
    setVoidError(null);
    try {
      const res = await fetch(
        `/api/v1/transactions/${transactionId}/custom-reminders/${reminderId}`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'Voided by user' }),
        },
      );
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(body.message ?? `Failed to cancel custom reminder (${res.status})`);
      }
      await fetchReminders();
    } catch (err) {
      setVoidError((err as Error).message);
    } finally {
      setVoidingId(null);
    }
  }

  function toggleRecipient(role: string) {
    setAddRecipients((prev) =>
      prev.includes(role)
        ? prev.filter((r) => r !== role)
        : [...prev, role],
    );
  }

  async function handleAddReminder() {
    if (!addFireAt || !addSubject.trim()) return;
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch(
        `/api/v1/transactions/${transactionId}/custom-reminders`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fireAt: new Date(addFireAt).toISOString(),
            subject: addSubject.trim(),
            message: addMessage.trim() || undefined,
            recipients: addRecipients.length > 0 ? addRecipients : undefined,
          }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(body.message ?? `Failed to create reminder (${res.status})`);
      }
      setShowAddForm(false);
      setAddFireAt('');
      setAddSubject('');
      setAddMessage('');
      setAddRecipients([]);
      await fetchReminders();
    } catch (err) {
      setAddError((err as Error).message);
    } finally {
      setAdding(false);
    }
  }

  if (!isOpen) return null;

  const stageReminders = (data?.reminders ?? []).filter(
    (r) => r.transactionStage?.toUpperCase() === stage.toUpperCase(),
  );

  const stagePastEvents = (data?.pastEvents ?? []).filter(
    (e) => e.transactionStage?.toUpperCase() === stage.toUpperCase(),
  );

  const groups: EventGroup[] = [];
  for (const r of stageReminders) {
    const existing = groups.find((g) => g.transactionEventId === r.transactionEventId);
    if (existing) {
      existing.reminders.push(r);
    } else {
      groups.push({
        transactionEventId: r.transactionEventId,
        eventLabel: r.eventLabel,
        eventDate: r.eventDate,
        reminders: [r],
      });
    }
  }

  const showPastSection = !loading && !fetchError && stagePastEvents.length > 0;
  const showEmptyState = !loading && !fetchError && groups.length === 0 && stagePastEvents.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative z-10 bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <Bell className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-gray-900">
              {stageLabel} Notification Schedule
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {loading && (
            <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading schedule…</span>
            </div>
          )}

          {fetchError && (
            <div className="flex items-center gap-2 py-12 justify-center text-red-500">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">{fetchError}</span>
            </div>
          )}

          {showEmptyState && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Bell className="w-8 h-8 text-gray-200 mb-3" />
              <p className="text-sm text-gray-500">No reminders scheduled for the {stageLabel} stage.</p>
              <p className="text-xs text-gray-400 mt-1">
                Reminders are created when transaction events are set for this stage.
              </p>
            </div>
          )}

          {showPastSection && groups.length === 0 && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                <span>All deadlines for this stage have already passed — no reminders were scheduled.</span>
              </div>
              <div className="space-y-2">
                {stagePastEvents.map((e) => (
                  <div
                    key={e.transactionEventId}
                    className="flex items-center justify-between px-4 py-3 rounded-xl border border-gray-100 bg-gray-50/60"
                  >
                    <div>
                      <p className="text-xs font-medium text-gray-400">{e.eventLabel}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{fmtDate(e.eventDate)}</p>
                    </div>
                    <span className="text-xs text-gray-400 italic">Deadline passed</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loading && !fetchError && groups.length > 0 && (
            <div className="space-y-6">
              {voidError && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {voidError}
                </div>
              )}

              {groups.map((group) => (
                <div key={group.transactionEventId}>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                      {group.eventLabel}
                    </h3>
                    {group.eventDate && (
                      <span className="text-xs text-gray-400">· {fmtDate(group.eventDate)}</span>
                    )}
                  </div>

                  <div className="rounded-xl border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="text-left text-xs font-medium text-gray-500 px-4 py-2.5">Offset</th>
                          <th className="text-left text-xs font-medium text-gray-500 px-4 py-2.5">Scheduled for</th>
                          <th className="text-left text-xs font-medium text-gray-500 px-4 py-2.5">Status</th>
                          <th className="text-right text-xs font-medium text-gray-500 px-4 py-2.5">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {group.reminders.map((r) => {
                          const isPast =
                            r.status === 'sent' ||
                            r.status === 'cancelled' ||
                            r.status === 'skipped' ||
                            new Date(r.scheduledFireAt) < new Date();

                          return (
                            <tr
                              key={r.id}
                              className={cn(
                                'transition-colors',
                                isPast ? 'bg-gray-50/50' : 'hover:bg-gray-50',
                              )}
                            >
                              <td className={cn(
                                'px-4 py-3 text-xs font-medium',
                                isPast ? 'text-gray-400' : 'text-gray-700',
                              )}>
                                {humanizeOffset(r.offsetDisplay)}
                              </td>
                              <td className={cn(
                                'px-4 py-3 text-xs',
                                isPast ? 'text-gray-400' : 'text-gray-600',
                              )}>
                                {fmtDateTime(r.scheduledFireAt)}
                              </td>
                              <td className="px-4 py-3">
                                <StatusBadge status={r.status} />
                              </td>
                              <td className="px-4 py-3 text-right">
                                {r.isCancellable ? (
                                  <button
                                    type="button"
                                    disabled={voidingId === r.id}
                                    onClick={() => void handleVoid(r.id)}
                                    className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 border border-red-200 hover:border-red-300 hover:bg-red-50 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {voidingId === r.id && (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    )}
                                    Void
                                  </button>
                                ) : (
                                  <span className="text-xs text-gray-300">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}

              {stagePastEvents.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Deadlines already passed</p>
                  <div className="space-y-2">
                    {stagePastEvents.map((e) => (
                      <div
                        key={e.transactionEventId}
                        className="flex items-center justify-between px-4 py-3 rounded-xl border border-gray-100 bg-gray-50/60"
                      >
                        <div>
                          <p className="text-xs font-medium text-gray-400">{e.eventLabel}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{fmtDate(e.eventDate)}</p>
                        </div>
                        <span className="text-xs text-gray-400 italic">No reminders scheduled</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data && (
                <p className="text-xs text-gray-400 text-center">
                  Reminders within {data.cutoffMinutes} minute{data.cutoffMinutes !== 1 ? 's' : ''} of sending cannot be cancelled.
                </p>
              )}
            </div>
          )}

          {/* Custom Reminders Section */}
          {!loading && !fetchError && (data?.customReminders?.length ?? 0) > 0 && (
            <div className="mt-6 space-y-3">
              <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide">
                Custom Notifications
              </p>
              {data!.customReminders.map((r) => {
                const isPast =
                  r.status === 'sent' ||
                  r.status === 'cancelled' ||
                  new Date(r.fireAt) < new Date();

                return (
                  <div
                    key={r.id}
                    className={cn(
                      'flex items-start justify-between px-4 py-3 rounded-xl border',
                      isPast
                        ? 'border-gray-100 bg-gray-50/60'
                        : 'border-purple-100 bg-purple-50/40',
                    )}
                  >
                    <div className="flex-1 min-w-0 mr-4">
                      <p className={cn(
                        'text-xs font-medium truncate',
                        isPast ? 'text-gray-400' : 'text-purple-900',
                      )}>
                        {r.subject}
                      </p>
                      {r.message && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{r.message}</p>
                      )}
                      <p className={cn(
                        'text-xs mt-1',
                        isPast ? 'text-gray-400' : 'text-gray-500',
                      )}>
                        {fmtDateTime(r.fireAt)}
                      </p>
                      {r.recipients && r.recipients.length > 0 && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          To: {r.recipients.map((role) => role.charAt(0).toUpperCase() + role.slice(1)).join(', ')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={r.status} />
                      {r.isCancellable && (
                        <button
                          type="button"
                          disabled={voidingId === r.id}
                          onClick={() => void handleCancelCustom(r.id)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 border border-red-200 hover:border-red-300 hover:bg-red-50 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {voidingId === r.id && (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          )}
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add Custom Notification */}
          {!loading && !fetchError && !showAddForm && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-purple-700 hover:text-purple-800 border border-purple-200 hover:border-purple-300 hover:bg-purple-50 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Plus size={14} />
                Add Notification
              </button>
            </div>
          )}

          {/* Add Form */}
          {!loading && !fetchError && showAddForm && (
            <div className="mt-4 p-4 rounded-xl border border-purple-200 bg-purple-50/40 space-y-3">
              <p className="text-xs font-semibold text-purple-700">New Custom Notification</p>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Date & Time *</label>
                <input
                  type="datetime-local"
                  value={addFireAt}
                  onChange={(e) => setAddFireAt(e.target.value)}
                  className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-300"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Subject *</label>
                <input
                  type="text"
                  value={addSubject}
                  onChange={(e) => setAddSubject(e.target.value)}
                  placeholder="e.g. Follow up with buyer"
                  className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-300"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Message (optional)</label>
                <textarea
                  value={addMessage}
                  onChange={(e) => setAddMessage(e.target.value)}
                  placeholder="Additional details for the notification email…"
                  rows={2}
                  className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-300 resize-none"
                />
              </div>

              <div className="relative">
                <label className="block text-xs text-gray-500 mb-1">Send to</label>
                <button
                  type="button"
                  onClick={() => setShowRecipientDropdown(!showRecipientDropdown)}
                  className="w-full flex items-center justify-between text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white"
                >
                  <span className={addRecipients.length === 0 ? 'text-gray-400' : 'text-gray-700'}>
                    {addRecipients.length === 0
                      ? 'Choose recipients…'
                      : addRecipients
                          .map((r) => r.charAt(0).toUpperCase() + r.slice(1))
                          .join(', ')}
                  </span>
                  <ChevronDown size={14} className="text-gray-400" />
                </button>
                {showRecipientDropdown && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowRecipientDropdown(false)} />
                    <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg py-1">
                    {['buyer', 'seller'].map((role) => (
                      <label
                        key={role}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={addRecipients.includes(role)}
                          onChange={() => toggleRecipient(role)}
                          className="rounded border-gray-300 text-purple-700 focus:ring-purple-300"
                        />
                        {role.charAt(0).toUpperCase() + role.slice(1)}
                      </label>
                    ))}
                    </div>
                  </>
                )}
              </div>

              {addError && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  {addError}
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={adding || !addFireAt || !addSubject.trim()}
                  onClick={() => void handleAddReminder()}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-purple-700 hover:bg-purple-800 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {adding && <Loader2 className="w-3 h-3 animate-spin" />}
                  Schedule
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setShowRecipientDropdown(false);
                    setAddRecipients([]);
                    setAddError(null);
                  }}
                  className="text-xs font-medium text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
