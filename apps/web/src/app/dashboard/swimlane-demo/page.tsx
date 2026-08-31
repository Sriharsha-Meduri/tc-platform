'use client';

import { useState } from 'react';
import { CheckCircle, Lock } from 'lucide-react';

// ── Stage definitions ─────────────────────────────────────────────────────────

const ALL_STAGES = [
  { key: 'intake',      label: 'Qualification' },
  { key: 'contract',    label: 'Contract' },
  { key: 'disclosures', label: 'Disclosures' },
  { key: 'inspection',  label: 'Inspection' },
  { key: 'appraisal',   label: 'Appraisal' },
  { key: 'loan',        label: 'Loan' },
  { key: 'escrow',      label: 'Escrow' },
  { key: 'closing',     label: 'Closing' },
  { key: 'post_close',  label: 'Post-Close' },
];

// Buyer agent skips INTAKE — contract upload is their starting point
const BUYER_STAGES  = ALL_STAGES.filter((s) => s.key !== 'intake');
const SELLER_STAGES = ALL_STAGES;

// ── Fake per-stage messages ───────────────────────────────────────────────────

const ALL_EVENTS = [
  { id: 'i1', seq: 1, row: 0, dir: 'inbound',  subject: 'Listing package submitted',   from: 'david@broker.com',    date: 'Apr 10', unresponded: false, stage: 'intake' },
  { id: 'i2', seq: 2, row: 2, dir: 'outbound', subject: 'Qualification acknowledged',          from: 'tc@txn.mytcapp.net',  date: 'Apr 10', unresponded: false, stage: 'intake' },
  { id: 'c1', seq: 1, row: 0, dir: 'inbound',  subject: 'Purchase agreement attached',  from: 'alice@broker.com',    date: 'Apr 14', unresponded: false, stage: 'contract' },
  { id: 'c2', seq: 2, row: 2, dir: 'outbound', subject: 'Welcome — TXN-2026-WC2V0A',   from: 'tc@txn.mytcapp.net',  date: 'Apr 14', unresponded: false, stage: 'contract' },
  { id: 'c3', seq: 3, row: 1, dir: 'inbound',  subject: 'Counter-offer submitted',      from: 'david@broker.com',    date: 'Apr 15', unresponded: true,  stage: 'contract' },
  { id: 'd1', seq: 1, row: 1, dir: 'inbound',  subject: 'TDS completed by seller',      from: 'david@broker.com',    date: 'Apr 18', unresponded: false, stage: 'disclosures' },
  { id: 'd2', seq: 2, row: 2, dir: 'outbound', subject: 'Disclosures forwarded',        from: 'tc@txn.mytcapp.net',  date: 'Apr 18', unresponded: false, stage: 'disclosures' },
  { id: 'n1', seq: 1, row: 0, dir: 'inbound',  subject: 'Inspection report ready',      from: 'alice@broker.com',    date: 'Apr 22', unresponded: false, stage: 'inspection' },
];

const STAGE_EVENTS: Record<string, typeof ALL_EVENTS> = {};
ALL_STAGES.forEach((s) => {
  STAGE_EVENTS[s.key] = ALL_EVENTS.filter((e) => e.stage === s.key);
});

// ── Layout constants ──────────────────────────────────────────────────────────

const LABEL_WIDTH = 220;
const ROW_HEIGHT  = 130;
const CARD_W      = 190;
const CARD_H      = 86;
const CARD_STEP   = 230;
const PAD_TOP     = (ROW_HEIGHT - CARD_H) / 2;

const PARTIES = [
  { id: '1', name: 'Alice Torres',  role: 'Buyer Agent' },
  { id: '2', name: 'David Kim',     role: 'Seller Agent' },
  { id: '3', name: 'Sarah Johnson', role: 'Transaction Coordinator' },
];

// ── Stage tabs ────────────────────────────────────────────────────────────────

function StageTabs({
  stages,
  currentStage,
  selectedStage,
  onSelect,
}: {
  stages: typeof ALL_STAGES;
  currentStage: string;
  selectedStage: string;
  onSelect: (key: string) => void;
}) {
  const currentIdx  = stages.findIndex((s) => s.key === currentStage);
  const selectedIdx = stages.findIndex((s) => s.key === selectedStage);

  return (
    <div className="flex border-b border-gray-200 bg-white overflow-x-auto">
      {stages.map((stage, idx) => {
        const isPast     = idx < currentIdx;
        const isCurrent  = idx === currentIdx;
        const isFuture   = idx > currentIdx;
        const isSelected = idx === selectedIdx;
        const msgCount   = STAGE_EVENTS[stage.key]?.length ?? 0;

        return (
          <button
            key={stage.key}
            onClick={() => onSelect(stage.key)}
            className={[
              'relative flex flex-col items-center gap-1 px-4 py-3 text-xs font-medium whitespace-nowrap',
              'border-b-2 transition-colors focus:outline-none shrink-0',
              isSelected
                ? 'border-blue-700 text-blue-700 bg-blue-50/50'
                : 'border-transparent hover:border-gray-300 hover:bg-gray-50',
              isFuture && !isSelected ? 'text-gray-300' : '',
              isPast   && !isSelected ? 'text-gray-500' : '',
              isCurrent && !isSelected ? 'text-gray-700' : '',
            ].join(' ')}
          >
            <div className="flex items-center gap-1.5">
              {isPast   && <CheckCircle size={12} className="text-green-500 shrink-0" />}
              {isFuture && <Lock size={11} className="text-gray-300 shrink-0" />}
              {isCurrent && <span className="w-2 h-2 rounded-full bg-blue-700 shrink-0" />}
              <span>{stage.label}</span>
            </div>

            {msgCount > 0 && (
              <span className={[
                'text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                isSelected ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500',
              ].join(' ')}>
                {msgCount} msg{msgCount !== 1 ? 's' : ''}
              </span>
            )}

            {isCurrent && (
              <span className="text-[9px] font-bold uppercase tracking-wide text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-full">
                current
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Event card ────────────────────────────────────────────────────────────────

function EventCard({ ev, left, top }: { ev: typeof ALL_EVENTS[0]; left: number; top: number }) {
  const inbound     = ev.dir === 'inbound';
  const borderColor = ev.unresponded
    ? 'border-amber-400 ring-2 ring-amber-200'
    : inbound ? 'border-blue-200' : 'border-emerald-200';
  const headerBg    = inbound ? 'bg-blue-50' : 'bg-emerald-50';
  const seqColor    = inbound ? 'text-blue-600' : 'text-emerald-600';

  return (
    <div
      className={`absolute rounded-lg border ${borderColor} bg-white shadow-sm`}
      style={{ left, top, width: CARD_W, height: CARD_H }}
    >
      <div className={`${headerBg} px-2.5 py-1.5 rounded-t-lg flex items-center justify-between`}>
        <span className={`text-xs font-bold ${seqColor}`}>#{ev.seq}</span>
        <span className="text-xs text-gray-400">{inbound ? '↓ in' : '↑ out'}</span>
      </div>
      <div className="px-2.5 py-2">
        <p className="text-xs font-medium text-gray-800 truncate mb-0.5">{ev.subject}</p>
        <p className="text-xs text-gray-400 truncate">{ev.from}</p>
        <p className="text-xs text-gray-300 mt-1">{ev.date}</p>
      </div>
      {ev.unresponded && (
        <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-400" />
      )}
    </div>
  );
}

// ── Swimlane body ─────────────────────────────────────────────────────────────

function SwimlaneBody({ events }: { events: typeof ALL_EVENTS }) {
  const timelineW = Math.max(events.length * CARD_STEP + 80, 500);
  const totalH    = PARTIES.length * ROW_HEIGHT;

  return (
    <div className="flex overflow-hidden">
      <div className="shrink-0 border-r border-gray-200 bg-gray-50" style={{ width: LABEL_WIDTH }}>
        <div className="border-b border-gray-200 bg-white flex items-center px-4" style={{ height: 44 }}>
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Party</span>
        </div>
        {PARTIES.map((p) => (
          <div key={p.id} className="border-b border-gray-100 flex flex-col justify-center px-4" style={{ height: ROW_HEIGHT }}>
            <p className="text-sm font-medium text-gray-900">{p.name}</p>
            <p className="text-xs text-gray-400">{p.role}</p>
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-x-auto">
        <div className="relative" style={{ width: timelineW, minHeight: totalH + 44 }}>
          <div className="sticky top-0 z-10 border-b border-gray-200 bg-white" style={{ height: 44, width: timelineW }}>
            {events.map((ev) => (
              <div key={ev.id} className="text-xs text-gray-300 font-medium absolute"
                style={{ left: (ev.seq - 1) * CARD_STEP + 20 + CARD_W / 2 - 8, top: 14 }}>
                {ev.seq}
              </div>
            ))}
          </div>

          {PARTIES.map((p, i) => (
            <div key={p.id}
              className={`absolute w-full border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
              style={{ top: 44 + i * ROW_HEIGHT, height: ROW_HEIGHT, width: timelineW }}
            />
          ))}

          <svg className="absolute pointer-events-none" style={{ top: 44, left: 0, width: timelineW, height: totalH }}>
            <defs>
              <marker id="arr" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto">
                <path d="M0,0 L0,8 L8,4 z" fill="#94a3b8" />
              </marker>
            </defs>
            {events.map((ev, i) => {
              if (i === 0) return null;
              const prev = events[i - 1];
              const x1 = (prev.seq - 1) * CARD_STEP + 20 + CARD_W;
              const y1 = prev.row * ROW_HEIGHT + PAD_TOP + CARD_H / 2;
              const x2 = (ev.seq - 1) * CARD_STEP + 20;
              const y2 = ev.row * ROW_HEIGHT + PAD_TOP + CARD_H / 2;
              const mx = Math.round((x1 + x2) / 2);
              const d  = y1 === y2 ? `M ${x1} ${y1} H ${x2}` : `M ${x1} ${y1} H ${mx} V ${y2} H ${x2}`;
              return <path key={ev.id} d={d} fill="none" stroke="#94a3b8" strokeWidth={1.5} markerEnd="url(#arr)" opacity={0.6} />;
            })}
          </svg>

          {events.map((ev) => (
            <EventCard key={ev.id} ev={ev}
              left={(ev.seq - 1) * CARD_STEP + 20}
              top={44 + ev.row * ROW_HEIGHT + PAD_TOP}
            />
          ))}

          {events.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-300">
              No communications in this stage yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Demo page ─────────────────────────────────────────────────────────────────

type Side = 'buyer_side' | 'seller_side';

export default function SwimlaneDemo() {
  const [side,          setSide]          = useState<Side>('buyer_side');
  const [txStage,       setTxStage]       = useState('contract');
  const [selectedStage, setSelectedStage] = useState('contract');

  const stages = side === 'buyer_side' ? BUYER_STAGES : SELLER_STAGES;
  const events  = STAGE_EVENTS[selectedStage] ?? [];

  // When switching side, make sure selectedStage is valid for the new stage list
  function handleSideChange(newSide: Side) {
    setSide(newSide);
    const newStages = newSide === 'buyer_side' ? BUYER_STAGES : SELLER_STAGES;
    if (!newStages.find((s) => s.key === selectedStage)) {
      setSelectedStage(newStages[0].key);
    }
    if (!newStages.find((s) => s.key === txStage)) {
      setTxStage(newStages[0].key);
      setSelectedStage(newStages[0].key);
    }
  }

  function handleTxStageChange(key: string) {
    setTxStage(key);
    setSelectedStage(key);
  }

  return (
    <div className="p-6 space-y-6">

      {/* Demo controls */}
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Swimlane — Tabbed Stage Demo</h1>
          <p className="text-sm text-gray-500 mt-1">
            Switch between Buyer Agent and Seller Agent to see how tabs differ. Move the transaction stage to simulate progress.
          </p>
        </div>

        {/* Side toggle */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-gray-600">Transaction side:</span>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
            <button
              onClick={() => handleSideChange('buyer_side')}
              className={[
                'px-4 py-2 transition-colors',
                side === 'buyer_side' ? 'bg-blue-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50',
              ].join(' ')}
            >
              Buyer Agent
            </button>
            <button
              onClick={() => handleSideChange('seller_side')}
              className={[
                'px-4 py-2 border-l border-gray-200 transition-colors',
                side === 'seller_side' ? 'bg-blue-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50',
              ].join(' ')}
            >
              Seller Agent
            </button>
          </div>

          {side === 'buyer_side' && (
            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
              Qualification tab hidden — buyer flow starts at Contract
            </span>
          )}
        </div>

        {/* Stage mover */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500">Move transaction to stage:</span>
          {stages.map((s) => (
            <button
              key={s.key}
              onClick={() => handleTxStageChange(s.key)}
              className={[
                'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                txStage === s.key
                  ? 'bg-blue-700 text-white border-blue-700'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400',
              ].join(' ')}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Transaction header */}
      <div className="flex items-center gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">123 Maple Street, Los Angeles, CA 90210</h2>
          <p className="text-xs text-gray-500">#TXN-2026-WC2V0A</p>
        </div>
        <span className="text-xs font-medium px-2 py-1 rounded-full bg-green-100 text-green-700">Active</span>
        <span className="text-xs font-medium px-2 py-1 rounded-full bg-blue-100 text-blue-700">
          {ALL_STAGES.find((s) => s.key === txStage)?.label}
        </span>
      </div>

      {/* Swimlane */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        <StageTabs
          stages={stages}
          currentStage={txStage}
          selectedStage={selectedStage}
          onSelect={setSelectedStage}
        />
        <SwimlaneBody events={events} />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-400">
        <span className="flex items-center gap-1.5"><CheckCircle size={12} className="text-green-500" /> Completed stage</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-700 inline-block" /> Current stage</span>
        <span className="flex items-center gap-1.5"><Lock size={11} className="text-gray-300" /> Upcoming stage</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Awaiting response</span>
      </div>
    </div>
  );
}
