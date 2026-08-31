'use client';

import React, { useEffect, useState } from 'react';
import { Settings, ChevronDown, ChevronRight } from 'lucide-react';

interface NotificationMessage {
  id: string;
  stage?: string | null;
  direction?: string;
  metadataJson?: Record<string, unknown> | null;
}

interface Props {
  transactionId: string;
  messages?: NotificationMessage[];
}

export default function ContingencyNotificationView({ transactionId }: Props) {
  const [reminderConfig, setReminderConfig] = useState({ inspection: true, appraisal: true, loan: true, startDays: 3 });
  const [showReminderConfig, setShowReminderConfig] = useState(true);

  useEffect(() => {
    fetch(`/api/v1/transactions/${encodeURIComponent(transactionId)}/reminder-config`, { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((c) => { if (c) setReminderConfig(c); })
      .catch(() => {});
  }, [transactionId]);

  const saveReminderConfig = async (patch: Partial<typeof reminderConfig>) => {
    const next = { ...reminderConfig, ...patch };
    setReminderConfig(next);
    await fetch(`/api/v1/transactions/${encodeURIComponent(transactionId)}/reminder-config`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify(next),
    }).catch(() => {});
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/50 overflow-hidden">
      <button type="button" onClick={() => setShowReminderConfig(!showReminderConfig)}
        className="w-full flex items-center gap-2 px-4 py-2 text-xs font-medium text-gray-600 hover:text-gray-800 transition-colors">
        <Settings size={12} />
        Automatic Reminders
        <span className="text-[10px] text-gray-400 ml-auto mr-2">
          {reminderConfig.startDays}d before deadline, {[reminderConfig.inspection, reminderConfig.appraisal, reminderConfig.loan].filter(Boolean).length}/3 enabled
        </span>
        {showReminderConfig ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {showReminderConfig && (
        <div className="px-4 pb-3 space-y-2.5">
          <p className="text-[10px] text-gray-500 leading-relaxed">
            The system automatically emails the Buyer Agent when required contingency documents are missing before the negotiated contingency deadline.
          </p>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-gray-500 w-14 shrink-0">Start</span>
            <select value={reminderConfig.startDays}
              onChange={(e) => saveReminderConfig({ startDays: parseInt(e.target.value) })}
              className="text-xs border border-gray-300 rounded px-2 py-1 bg-white">
              <option value={1}>1 day before</option>
              <option value={3}>3 days before</option>
              <option value={5}>5 days before</option>
              <option value={7}>7 days before</option>
            </select>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-gray-500 w-14 shrink-0">Frequency</span>
            <span className="text-gray-700">Once per day</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-gray-500 w-14 shrink-0">Enabled</span>
            {(['inspection', 'appraisal', 'loan'] as const).map((key) => (
              <label key={key} className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input type="checkbox" checked={reminderConfig[key]}
                  onChange={(e) => saveReminderConfig({ [key]: e.target.checked })}
                  className="rounded border-gray-300" />
                {key.charAt(0).toUpperCase() + key.slice(1)}
              </label>
            ))}
          </div>
          <p className="text-[10px] text-gray-400">
            Reminders stop automatically when the required document is uploaded for the contingency.
          </p>
        </div>
      )}
    </div>
  );
}
