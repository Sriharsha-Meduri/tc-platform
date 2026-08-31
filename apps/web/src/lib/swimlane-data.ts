import type { ApiParty, ApiMessage } from './api';

// ── Party role ordering ───────────────────────────────────────────────────────

const ROLE_ORDER: Record<string, number> = {
  buyer: 0,
  seller: 1,
  buyer_agent: 2,
  seller_agent: 3,
  transaction_coordinator: 4,
  lender: 5,
  escrow_officer: 6,
  title_officer: 7,
  inspector: 8,
  appraiser: 9,
  attorney: 10,
};

function roleOrder(role: string): number {
  return ROLE_ORDER[role] ?? 99;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SwimlaneParty {
  id: string;
  displayName: string;
  partyRole: string;
  email: string | null;
  rowIndex: number;
}

export const TA_PARTY_ID = '__transaction_assistant__';

export interface SwimlaneEvent {
  id: string;
  messageId: string;
  sequence: number;
  subject: string | null;
  bodyText: string | null;
  direction: string;
  senderEmail: string | null;
  receivedAt: string | null;
  createdAt: string;
  providerMessageId: string | null;
  providerThreadId: string | null;
  /** rowIndex of the party this event belongs to (-1 = unknown) */
  rowIndex: number;
  /** sequence number of the parent event this replies to, or null */
  replyToSequence: number | null;
  /** true when this is the last event in its thread (ball in court) */
  isUnresponded: boolean;
  /** 'human' (conversation) or 'system' (Transaction Assistant) */
  type: 'human' | 'system';
  /** Display label (e.g. "1", "2", "A", "B") */
  sequenceLabel: string;
  /** For system events: the recipient party ID (for connector rendering) */
  recipientPartyId?: string;
  /** For grouped system events: all recipient party IDs */
  recipientPartyIds?: string[];
}

export interface SwimlaneEdge {
  fromSequence: number;
  toSequence: number;
  /** 'conversation' for human-human edges, 'ta_connector' for TA→recipient */
  type?: 'conversation' | 'ta_connector';
  /** For ta_connector edges: the recipient party ID */
  toPartyId?: string;
  /** Sub-label like "1.1", "1.2" for TA connector edges */
  subLabel?: string;
  /** Horizontal pixel offset from card center for fan-out (TA connectors only) */
  connectorOffset?: number;
}

export interface SwimlaneData {
  parties: SwimlaneParty[];
  events: SwimlaneEvent[];
  edges: SwimlaneEdge[];
  /** Transaction Assistant system events */
  systemEvents: SwimlaneEvent[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isSystemMessage(msg: ApiMessage): boolean {
  return msg.direction === 'internal' || (msg.direction === 'outbound' && msg.senderPartyId === null);
}

function toSequenceLabel(seq: number, type: 'human' | 'system'): string {
  if (type === 'system') {
    return String.fromCharCode(64 + seq); // A, B, C...
  }
  return String(seq);
}

function groupSystemMessages(msgs: ApiMessage[]): ApiMessage[][] {
  const groups: ApiMessage[][] = [];
  const SAME_SUBJECT_WINDOW_MS = 60_000;

  for (const msg of msgs) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.length > 0) {
      const lastMsg = lastGroup[lastGroup.length - 1];
      const lastTime = new Date(lastMsg.receivedAt ?? lastMsg.createdAt).getTime();
      const curTime = new Date(msg.receivedAt ?? msg.createdAt).getTime();

      if (
        (msg.subject ?? '') === (lastMsg.subject ?? '') &&
        (curTime - lastTime) < SAME_SUBJECT_WINDOW_MS
      ) {
        lastGroup.push(msg);
        continue;
      }
    }
    groups.push([msg]);
  }

  return groups;
}

// ── Builder ───────────────────────────────────────────────────────────────────

export function buildSwimlaneData(
  parties: ApiParty[],
  messages: ApiMessage[],
): SwimlaneData {
  // 1. Sort and index human parties
  const sorted = [...parties].sort((a, b) => {
    const diff = roleOrder(a.partyRole) - roleOrder(b.partyRole);
    if (diff !== 0) return diff;
    return a.displayName.localeCompare(b.displayName);
  });

  const swimlaneParties: SwimlaneParty[] = sorted.map((p, i) => ({
    id: p.id,
    displayName: p.displayName,
    partyRole: p.partyRole,
    email: p.email,
    rowIndex: i,
  }));

  // Add synthetic Transaction Assistant party
  const taRowIndex = swimlaneParties.length;
  swimlaneParties.push({
    id: TA_PARTY_ID,
    displayName: 'Transaction Assistant',
    partyRole: 'system',
    email: null,
    rowIndex: taRowIndex,
  });

  // Build lookup maps for row resolution
  const partyIdToRow = new Map<string, number>();
  const emailToRow   = new Map<string, number>();
  for (const sp of swimlaneParties) {
    partyIdToRow.set(sp.id, sp.rowIndex);
    if (sp.email) emailToRow.set(sp.email.toLowerCase(), sp.rowIndex);
  }

  // 2. Split messages into human and system
  // System outbound messages (welcome emails, alerts) also render on the recipient's
  // party lane — they appear in BOTH tracks.
  const humanMsgs: ApiMessage[] = [];
  const systemMsgs: ApiMessage[] = [];
  for (const msg of messages) {
    if (isSystemMessage(msg)) {
      systemMsgs.push(msg);
      if (msg.direction === 'outbound' && msg.recipientPartyId) {
        humanMsgs.push(msg);
      }
    } else {
      humanMsgs.push(msg);
    }
  }

  // 3. Sort each group chronologically
  const sortByTime = (a: ApiMessage, b: ApiMessage) => {
    const ta = a.receivedAt ?? a.createdAt;
    const tb = b.receivedAt ?? b.createdAt;
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  };
  const sortedHumanMsgs = [...humanMsgs].sort(sortByTime);
  const sortedSystemMsgs = [...systemMsgs].sort(sortByTime);

  // 4. Build providerMessageId → sequence for reply edges (human only)
  const msgIdToSeq = new Map<string, number>();

  // 5. Build human conversation events
  const events: SwimlaneEvent[] = sortedHumanMsgs.map((msg, i) => {
    const seq = i + 1;
    if (msg.providerMessageId) msgIdToSeq.set(msg.providerMessageId, seq);

    const isOutbound = msg.direction === 'outbound';

    // Row placement
    const partyId = isOutbound ? msg.recipientPartyId : msg.senderPartyId;
    let rowIndex = partyId ? (partyIdToRow.get(partyId) ?? -1) : -1;

    // Email fallback for inbound
    const meta = msg.metadataJson as Record<string, unknown> | null;
    let senderEmail: string | null = null;
    if (rowIndex === -1) {
      const rawEmail = isOutbound
        ? null
        : ((typeof meta?.sender === 'string' ? meta.sender : null) ??
           (typeof meta?.from   === 'string' ? meta.from   : null));
      const bareEmail = rawEmail
        ? (rawEmail.match(/<([^>]+)>$/)?.[1] ?? rawEmail).trim().toLowerCase()
        : null;
      if (bareEmail) {
        rowIndex   = emailToRow.get(bareEmail) ?? -1;
        senderEmail = bareEmail;
      }
    }

    return {
      id: `${msg.id}-${seq}`,
      messageId: msg.id,
      sequence: seq,
      subject: msg.subject,
      bodyText: msg.bodyText,
      direction: msg.direction,
      senderEmail,
      receivedAt: msg.receivedAt,
      createdAt: msg.createdAt,
      providerMessageId: msg.providerMessageId,
      providerThreadId: msg.providerThreadId,
      rowIndex,
      replyToSequence: null,
      isUnresponded: false,
      type: 'human' as const,
      sequenceLabel: toSequenceLabel(seq, 'human'),
    };
  });

  // Resolve replyToSequence for human events
  for (const ev of events) {
    if (ev.providerThreadId) {
      const parent = msgIdToSeq.get(ev.providerThreadId);
      if (parent !== undefined) ev.replyToSequence = parent;
    }
  }

  // Determine unresponded for human events
  const threadLastSeq = new Map<string, number>();
  for (const ev of events) {
    const threadId = ev.providerThreadId ?? ev.providerMessageId ?? ev.id;
    const cur = threadLastSeq.get(threadId) ?? 0;
    if (ev.sequence > cur) threadLastSeq.set(threadId, ev.sequence);
  }
  const unrespondedSeqs = new Set(threadLastSeq.values());
  for (const ev of events) {
    ev.isUnresponded = unrespondedSeqs.has(ev.sequence);
  }

  // 6. Build system events (Transaction Assistant track) — grouped by subject + time
  const groupedSystemMsgs = groupSystemMessages(sortedSystemMsgs);
  const systemEvents: SwimlaneEvent[] = groupedSystemMsgs.map((group, i) => {
    const seq = i + 1;
    const firstMsg = group[0];
    const recipientIds = group
      .map(m => m.recipientPartyId)
      .filter((id): id is string => id !== null);
    const uniqueRecipientIds = [...new Set(recipientIds)];

    let bodyText = firstMsg.bodyText;
    if (uniqueRecipientIds.length > 1) {
      bodyText = `Sent to: ${uniqueRecipientIds.length} parties\n\n${firstMsg.bodyText ?? ''}`;
    } else if (uniqueRecipientIds.length === 1) {
      bodyText = `Sent to: 1 party\n\n${firstMsg.bodyText ?? ''}`;
    }

    return {
      id: `sys-${group.map(m => m.id).join('-')}-${seq}`,
      messageId: firstMsg.id,
      sequence: seq,
      subject: firstMsg.subject,
      bodyText,
      direction: firstMsg.direction,
      senderEmail: null,
      receivedAt: firstMsg.receivedAt,
      createdAt: firstMsg.createdAt,
      providerMessageId: firstMsg.providerMessageId,
      providerThreadId: firstMsg.providerThreadId,
      rowIndex: taRowIndex,
      replyToSequence: null,
      isUnresponded: false,
      type: 'system' as const,
      sequenceLabel: toSequenceLabel(seq, 'system'),
      recipientPartyId: uniqueRecipientIds[0] ?? undefined,
      recipientPartyIds: uniqueRecipientIds.length > 0 ? uniqueRecipientIds : undefined,
    };
  });

  // 7. Build edges — human conversation only
  // Skip sequential edges between events on different rows that aren't in the same
  // thread — these are independent system notifications, not a conversation chain.
  const hasExplicitEdges = events.some((ev) => ev.replyToSequence !== null);

  const edges: SwimlaneEdge[] = hasExplicitEdges
    ? events
        .filter((ev) => ev.replyToSequence !== null)
        .map((ev) => ({ fromSequence: ev.replyToSequence as number, toSequence: ev.sequence, type: 'conversation' }))
    : (() => {
        const result: SwimlaneEdge[] = [];
        for (let i = 1; i < events.length; i++) {
          const prev = events[i - 1];
          const curr = events[i];
          if (prev.rowIndex !== curr.rowIndex &&
              !(prev.providerThreadId && prev.providerThreadId === curr.providerThreadId)) {
            continue;
          }
          result.push({ fromSequence: prev.sequence, toSequence: curr.sequence, type: 'conversation' });
        }
        return result;
      })();

  // 8. Build TA connectors (edges to recipient parties)
  // Build lookup: messageId → human event sequence for dual-track messages
  const sysMsgIdToHumanSeq = new Map<string, number>();
  for (const ev of events) {
    if (ev.messageId && ev.type === 'human') {
      sysMsgIdToHumanSeq.set(ev.messageId, ev.sequence);
    }
  }
  // Iterate over the original groups so we can match each recipient
  // to its specific message instead of using only firstMsg.id.
  for (let gi = 0; gi < groupedSystemMsgs.length; gi++) {
    const group = groupedSystemMsgs[gi];
    const seq = gi + 1; // system event sequence
    const firstMsg = group[0];
    if (firstMsg.direction !== 'outbound') continue;
    // Build per-recipient messageId map from the group
    const rpToMsgId = new Map<string, string>();
    for (const msg of group) {
      if (msg.recipientPartyId) rpToMsgId.set(msg.recipientPartyId, msg.id);
    }
    const validIds = [...rpToMsgId.entries()].filter(([rpId]) => partyIdToRow.has(rpId));
    const total = validIds.length;
    const SPREAD = Math.min(total * 12, 60);
    validIds.forEach(([rpId, msgId], idx) => {
      const offset = total > 1
        ? -SPREAD / 2 + (SPREAD / (total - 1)) * idx
        : 0;
      const humanSeq = sysMsgIdToHumanSeq.get(msgId) ?? null;
      edges.push({
        fromSequence: seq,
        toSequence: humanSeq ?? seq,
        type: 'ta_connector',
        toPartyId: rpId,
        subLabel: `${seq}.${idx + 1}`,
        connectorOffset: Math.round(offset),
      });
    });
  }

  return { parties: swimlaneParties, events, edges, systemEvents };
}
