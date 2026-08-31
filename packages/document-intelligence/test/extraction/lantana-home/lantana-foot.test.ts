import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { DocumentIntelligencePipeline } from '../../../src/pipeline/document-intelligence';

describe('lantana', () => {
  it('does not generate false missing-initials blockers on the real lantana RPA', async () => {
    const pipeline = new DocumentIntelligencePipeline({
      identifier: { apiKey: process.env.GEMINI_API_KEY!, provider: 'gemini' },
      extractor: { provider: 'gemini', apiKey: process.env.GEMINI_API_KEY! },
    });
    const pdf = readFileSync('test/extraction/lantana-home/lantana-home-rpa.pdf');
    const result = await pipeline.process(pdf, { stage: 'contract' });
    const rpa = result.extractions.find(e => e.formCode === 'RPA');
    if (!rpa?.output?.data) { console.log('No RPA data'); return; }
    const d = rpa.output.data as Record<string, unknown>;
    console.log('revision:', (d['form_metadata'] as any)?.['form_revision']);
    for (let p = 4; p <= 14; p++) {
      const pf = d[`page_${p}_footer_initials`] as any;
      if (!pf) { console.log(`P${p}: NO_DATA`); continue; }
      const parts = [`P${p}:`];
      for (const role of ['buyer', 'seller']) {
        const g = pf[`${role}_initials`];
        if (!g) continue;
        for (let s = 1; s <= 2; s++) {
          const slot = g[`slot_${s}`];
          if (slot) parts.push(`${role[0]}${s}=${slot['initials_present']}_${slot['mark_type']}`);
        }
      }
      console.log(parts.join(' '));
    }

    const initialsBlockers = (result.validation?.blockers ?? []).filter(
      (b) => b.code === 'BLOCKER_RPA_BUYER_INITIALS_MISSING' || b.code === 'BLOCKER_RPA_SELLER_INITIALS_MISSING',
    );
    for (const b of initialsBlockers) {
      console.log(`BLOCKER ${b.code} @ ${b.location}: ${b.fields?.join(', ')}`);
    }
    expect(initialsBlockers).toHaveLength(0);
  }, 600000);
});
