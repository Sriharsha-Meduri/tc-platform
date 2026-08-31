'use client';

import { useRef, useState, useCallback, useMemo } from 'react';
import type { SwimlaneData, SwimlaneEvent } from '@/lib/swimlane-data';
import { TA_PARTY_ID } from '@/lib/swimlane-data';

// ── Layout constants ──────────────────────────────────────────────────────────

const LABEL_WIDTH  = 220;  // px — left column for party names
const ROW_HEIGHT   = 140;  // px — height per party row
const CARD_WIDTH   = 200;  // px
const CARD_HEIGHT  = 92;   // px
const CARD_STEP    = 240;  // px between card left edges
const CARD_PAD_TOP = (ROW_HEIGHT - CARD_HEIGHT) / 2;

// Role display labels
function formatRole(role: string) {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(str: string | null | undefined) {
  if (!str) return null;
  return new Date(str).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function Tooltip({ event, onClose, parties }: { event: SwimlaneEvent; onClose: () => void; parties: SwimlaneData['parties'] }) {
  const isSystem = event.type === 'system';
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl border border-gray-200 shadow-xl p-5 max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">
              {isSystem ? (
                <><span className="text-gray-400">{event.sequenceLabel}</span> · <span className="text-gray-400">Transaction Assistant</span></>
              ) : (
                <><span>#{event.sequenceLabel}</span> · {event.direction === 'inbound' ? 'Received' : 'Sent'}</>
              )}
            </p>
            <h3 className={`text-sm font-semibold ${isSystem ? 'text-gray-600' : 'text-gray-900'}`}>
              {event.subject ?? '(no subject)'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            ×
          </button>
        </div>

        {event.senderEmail && !isSystem && (
          <p className="text-xs text-gray-500 mb-2">From: {event.senderEmail}</p>
        )}

        {isSystem && (
          <p className="text-xs text-gray-400 mb-2">
            {event.recipientPartyIds?.length
              ? `→ ${event.recipientPartyIds.map(id => parties.find(p => p.id === id)?.displayName ?? id).join(', ')}`
              : '⚙ Automated system alert'}
          </p>
        )}

        {formatDate(event.receivedAt ?? event.createdAt) && (
          <p className="text-xs text-gray-500 mb-3">
            {formatDate(event.receivedAt ?? event.createdAt)}
          </p>
        )}

        {event.bodyText && (
          <p className={`text-xs rounded-lg p-3 max-h-40 overflow-y-auto whitespace-pre-wrap ${isSystem ? 'text-gray-600 bg-gray-50' : 'text-gray-700 bg-gray-50'}`}>
            {event.bodyText}
          </p>
        )}

        {event.isUnresponded && !isSystem && (
          <div className="mt-3 flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-xs text-amber-700 font-medium">Awaiting response</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Event card ────────────────────────────────────────────────────────────────

function EventCard({
  event,
  left,
  top,
  onClick,
}: {
  event: SwimlaneEvent;
  left: number;
  top: number;
  onClick: () => void;
}) {
  const isInbound = event.direction === 'inbound';
  const borderColor = event.isUnresponded
    ? 'border-amber-400 ring-2 ring-amber-200'
    : isInbound
    ? 'border-blue-200'
    : 'border-emerald-200';
  const headerBg = isInbound ? 'bg-blue-50' : 'bg-emerald-50';
  const seqColor = isInbound ? 'text-blue-600' : 'text-emerald-600';

  return (
    <button
      onClick={onClick}
      className={`absolute rounded-lg border ${borderColor} bg-white shadow-sm
                  hover:shadow-md hover:-translate-y-0.5 transition-all text-left`}
      style={{ left, top, width: CARD_WIDTH, height: CARD_HEIGHT }}
    >
      {/* Header */}
      <div className={`${headerBg} px-2.5 py-1.5 rounded-t-lg flex items-center justify-between`}>
        <span className={`text-xs font-bold ${seqColor}`}>#{event.sequence}</span>
        <span className="text-xs text-gray-400">
          {isInbound ? '↓ in' : '↑ out'}
        </span>
      </div>

      {/* Body */}
      <div className="px-2.5 py-2">
        <p className="text-xs font-medium text-gray-800 truncate leading-tight mb-0.5">
          {event.subject ?? '(no subject)'}
        </p>
        <p className="text-xs text-gray-400 truncate">
          {event.senderEmail ?? '—'}
        </p>
        {formatDate(event.receivedAt ?? event.createdAt) && (
          <p className="text-xs text-gray-300 mt-1">
            {formatDate(event.receivedAt ?? event.createdAt)}
          </p>
        )}
      </div>

      {event.isUnresponded && (
        <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-400" />
      )}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TransactionSwimlane({ data }: { data: SwimlaneData }) {
  const { parties, events, edges, systemEvents } = data;
  const svgRef = useRef<SVGSVGElement>(null);
  const [selected, setSelected] = useState<SwimlaneEvent | null>(null);

  const numRows    = Math.max(parties.length, 1);
  const numEvents  = Math.max(events.length, systemEvents?.length ?? 0);
  const timelineW  = numEvents > 0 ? numEvents * CARD_STEP + 60 : 400;
  const totalH     = numRows * ROW_HEIGHT;

  // Map party ID to row index for TA connector rendering
  const partyIdToRow = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of parties) {
      map.set(p.id, p.rowIndex);
    }
    return map;
  }, [parties]);

  // ── SVG edge paths ────────────────────────────────────────────────────────

  const getCardPoints = useCallback(
    (seq: number): { exit: { x: number; y: number }; entry: { x: number; y: number } } | null => {
      const ev = events.find((e) => e.sequence === seq);
      if (!ev) return null;
      const cardLeft = (seq - 1) * CARD_STEP + 20;
      const rowTop   = ev.rowIndex >= 0 ? ev.rowIndex * ROW_HEIGHT : 0;
      const midY     = rowTop + CARD_PAD_TOP + CARD_HEIGHT / 2;
      return {
        exit:  { x: cardLeft + CARD_WIDTH, y: midY }, // right edge
        entry: { x: cardLeft,              y: midY }, // left edge
      };
    },
    [events],
  );

  function edgePath(fromSeq: number, toSeq: number): string | null {
    const from = getCardPoints(fromSeq);
    const to   = getCardPoints(toSeq);
    if (!from || !to) return null;

    const x1 = from.exit.x;
    const y1 = from.exit.y;
    const x2 = to.entry.x;
    const y2 = to.entry.y;

    // Midpoint x for the vertical jog
    const mx = Math.round((x1 + x2) / 2);

    if (y1 === y2) {
      // Same row — straight horizontal line
      return `M ${x1} ${y1} H ${x2}`;
    }
    // Different rows — elbow: horizontal → vertical → horizontal
    return `M ${x1} ${y1} H ${mx} V ${y2} H ${x2}`;
  }

  if (parties.length === 0 && events.length === 0 && (!systemEvents || systemEvents.length === 0)) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-gray-400">
        No communications yet for this transaction.
      </div>
    );
  }

  return (
    <div className="h-full min-h-[300px] overflow-auto">
      {/* ── Inner wrapper — full content dimensions, party labels + timeline side-by-side ── */}
      <div style={{ display: 'flex', width: LABEL_WIDTH + timelineW, minHeight: totalH + 48 }}>

        {/* ── Party labels (sticky left) ──────────────────────────────── */}
        <div
          className="shrink-0 border-r border-gray-200 bg-gray-50 z-20"
          style={{ width: LABEL_WIDTH, position: 'sticky', left: 0 }}
        >
          {/* Header — sticky top so it stays visible while scrolling down */}
          <div
            className="border-b border-gray-200 bg-white flex items-center px-4 sticky top-0 z-10"
            style={{ height: 48 }}
          >
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Party
            </span>
          </div>

          {parties.map((party) => {
            const isTA = party.id === TA_PARTY_ID;
            return (
              <div
                key={party.id}
                className={`border-b flex flex-col justify-center px-4 ${isTA ? 'border-t-2 border-t-gray-300 border-dashed bg-gray-50/80' : 'border-gray-100'}`}
                style={{ height: ROW_HEIGHT }}
              >
                <p className={`text-sm font-medium truncate ${isTA ? 'text-gray-500 italic' : 'text-gray-900'}`}>
                  {isTA ? '⚙ ' : ''}{party.displayName}
                </p>
                <p className={`text-xs truncate ${isTA ? 'text-gray-400 italic' : 'text-gray-400'}`}>
                  {isTA ? 'Automated system' : formatRole(party.partyRole)}
                </p>
                {party.email && !isTA && (
                  <p className="text-xs text-gray-300 truncate mt-0.5">{party.email}</p>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Timeline ────────────────────────────────────────────────── */}
        <div className="relative shrink-0" style={{ width: timelineW, minHeight: totalH + 48 }}>

          {/* Sequence header — sticky top */}
          <div
            className="sticky top-0 z-10 border-b border-gray-200 bg-white flex items-center px-5 gap-0"
            style={{ height: 48, width: timelineW }}
          >
            {events.map((ev) => (
              <div
                key={ev.id}
                className="text-xs text-gray-300 font-medium absolute"
                style={{ left: (ev.sequence - 1) * CARD_STEP + 20 + CARD_WIDTH / 2 - 8, top: 14 }}
              >
                {ev.sequenceLabel}
              </div>
            ))}
            {systemEvents?.map((ev) => (
              <div
                key={ev.id}
                className="text-xs text-gray-400 font-medium absolute"
                style={{ left: (ev.sequence - 1) * CARD_STEP + 20 + CARD_WIDTH / 2 - 8, top: 14 }}
              >
                {ev.sequenceLabel}
              </div>
            ))}
          </div>

          {/* Row stripes */}
          {parties.map((party, i) => (
            <div
              key={party.id}
              className={`absolute border-b border-gray-100 ${
                i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
              }`}
              style={{ top: 48 + i * ROW_HEIGHT, height: ROW_HEIGHT, width: timelineW }}
            />
          ))}

          {/* Event cards — human conversation */}
          {events.map((ev) => {
            const cardLeft = (ev.sequence - 1) * CARD_STEP + 20;
            const rowTop   = 48 + (ev.rowIndex >= 0 ? ev.rowIndex : 0) * ROW_HEIGHT + CARD_PAD_TOP;
            return (
              <EventCard
                key={ev.id}
                event={ev}
                left={cardLeft}
                top={rowTop}
                onClick={() => setSelected(ev)}
              />
            );
          })}

          {/* Event cards — Transaction Assistant track */}
          {systemEvents?.map((ev) => {
            const cardLeft = (ev.sequence - 1) * CARD_STEP + 20;
            const rowTop   = 48 + ev.rowIndex * ROW_HEIGHT + CARD_PAD_TOP;
            return (
              <button
                key={ev.id}
                onClick={() => setSelected(ev)}
                className="absolute rounded-lg border border-dashed border-gray-300 bg-gray-50/60 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-left"
                style={{ left: cardLeft, top: rowTop, width: CARD_WIDTH, height: CARD_HEIGHT }}
              >
                <div className="bg-gray-100/80 px-2.5 py-1.5 rounded-t-lg flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-500">{ev.sequenceLabel}</span>
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide bg-gray-200/60 px-1.5 py-0.5 rounded">TA</span>
                </div>
                <div className="px-2.5 py-2">
                  <p className="text-xs font-medium text-gray-600 truncate leading-tight mb-0.5">
                    {ev.subject ?? '(no subject)'}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {ev.recipientPartyIds?.length
                      ? `→ ${ev.recipientPartyIds.map(id => parties.find(p => p.id === id)?.displayName ?? '?').join(', ')}`
                      : '⚙ Automated'}
                  </p>
                  {formatDate(ev.receivedAt ?? ev.createdAt) && (
                    <p className="text-xs text-gray-300 mt-1">
                      {formatDate(ev.receivedAt ?? ev.createdAt)}
                    </p>
                  )}
                </div>
              </button>
            );
          })}

          {/* SVG overlay for edges — after cards so arrows render on top */}
          <svg
            ref={svgRef}
            className="absolute pointer-events-none z-10"
            style={{ top: 48, left: 0, width: timelineW, height: totalH }}
          >
            <defs>
              <marker
                id="arrow"
                markerWidth="8"
                markerHeight="8"
                refX="8"
                refY="4"
                orient="auto"
              >
                <path d="M0,0 L0,8 L8,4 z" fill="#64748b" />
              </marker>
            </defs>
            {edges.map((edge) => {
              if (edge.type === 'ta_connector') {
                // Connector from TA card top → recipient card
                const sysEv = systemEvents?.find(e => e.sequence === edge.fromSequence);
                if (!sysEv) return null;
                const toRowIdx = partyIdToRow.get(edge.toPartyId ?? '');
                if (toRowIdx === undefined) return null;
                const cx = (sysEv.sequence - 1) * CARD_STEP + 20 + CARD_WIDTH / 2;
                const offset = edge.connectorOffset ?? 0;
                const startX = cx + offset;
                const taRowIdx = parties.find(p => p.id === TA_PARTY_ID)?.rowIndex ?? 0;
                const y1 = taRowIdx * ROW_HEIGHT + CARD_PAD_TOP; // TA card TOP
                // Find the target event in the recipient's lane
                const toEv = events.find(e => e.sequence === edge.toSequence);
                const cardLeft = toEv
                  ? (toEv.sequence - 1) * CARD_STEP + 20
                  : 0;
                const cardRight = cardLeft + CARD_WIDTH;
                const cardBottom = toRowIdx * ROW_HEIGHT + CARD_PAD_TOP + CARD_HEIGHT;
                const midY = toRowIdx * ROW_HEIGHT + CARD_PAD_TOP + CARD_HEIGHT / 2;
                // If start is within card bounds, go straight up to the bottom edge
                const isAligned = startX >= cardLeft && startX <= cardRight;
                if (isAligned) {
                  const targetY = cardBottom + 6;
                  const d = `M ${startX} ${y1} V ${targetY}`;
                  return (
                    <g key={`ta-${edge.fromSequence}-${edge.toPartyId}`}>
                      <path d={d} fill="none" stroke="#64748b" strokeWidth={1.5} opacity={0.65} />
                      {edge.subLabel && (
                        <text x={startX + 6} y={midY - 4} fontSize={9} fill="#64748b" fontWeight={600}>
                          {edge.subLabel}
                        </text>
                      )}
                      <path
                        d={`M ${startX - 3.5} ${targetY} L ${startX} ${targetY - 6} L ${startX + 3.5} ${targetY} z`}
                        fill="#64748b" fillOpacity={0.65} stroke="none"
                      />
                    </g>
                  );
                }
                // L-shape to the nearest card side
                const cardCenterX = cardLeft + CARD_WIDTH / 2;
                const fromLeft = cardCenterX > startX;
                const targetX = fromLeft ? cardLeft : cardRight;
                const d = `M ${startX} ${y1} V ${midY} H ${targetX}`;
                return (
                  <g key={`ta-${edge.fromSequence}-${edge.toPartyId}`}>
                    <path d={d} fill="none" stroke="#64748b" strokeWidth={1.5} opacity={0.65} />
                    {edge.subLabel && (
                      <text x={Math.min(startX, targetX) + 4} y={midY - 4} fontSize={9} fill="#64748b" fontWeight={600}>
                        {edge.subLabel}
                      </text>
                    )}
                    <path
                      d={
                        fromLeft
                          ? `M ${targetX - 6} ${midY - 3.5} L ${targetX - 6} ${midY + 3.5} L ${targetX} ${midY} z`
                          : `M ${targetX + 6} ${midY - 3.5} L ${targetX + 6} ${midY + 3.5} L ${targetX} ${midY} z`
                      }
                      fill="#64748b" fillOpacity={0.65} stroke="none"
                    />
                  </g>
                );
              }
              const d = edgePath(edge.fromSequence, edge.toSequence);
              if (!d) return null;
              return (
                <path
                  key={`${edge.fromSequence}-${edge.toSequence}`}
                  d={d}
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                  markerEnd="url(#arrow)"
                  opacity={0.75}
                />
              );
            })}
          </svg>
        </div>
      </div>

      {/* Tooltip overlay */}
      {selected && (
        <Tooltip event={selected} onClose={() => setSelected(null)} parties={parties} />
      )}
    </div>
  );
}
