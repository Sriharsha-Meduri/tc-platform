import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RenderedPageCache } from '../../src/page-converter/rendered-page-cache';
import type { YesItemSection } from '../../src/validator/stages/disclosures.stage';

const generateContent = vi.fn();

vi.mock('@google/generative-ai', async () => {
  const actual = await vi.importActual<typeof import('@google/generative-ai')>('@google/generative-ai');
  return {
    ...actual,
    GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
      getGenerativeModel: () => ({ generateContent }),
    })),
  };
});

const TEST_SECTIONS: YesItemSection[] = [
  { sectionKey: 'section_7', page: 2, explanationField: 'explanation_7', items: [
    { code: '7D', field: 'painted_recently' },
  ] },
  { sectionKey: 'section_8', page: 2, explanationField: 'explanation_8', items: [
    { code: '8E', field: 'other_structure' },
  ] },
];

function mockGeminiResponse(text: string) {
  generateContent.mockResolvedValueOnce({
    response: { text: () => text, usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } },
  });
}

// Each section now gets its own prompt, and each section is queried by TWO
// concurrent calls (temperature 0 + temperature 0.4, OR-merged) — so a fixed
// FIFO queue of canned responses no longer lines up with which call belongs
// to which section. Inspecting the actual prompt text (which names its item
// codes explicitly, e.g. "Item 7D") lets one mock correctly answer every
// call for a given section regardless of call count or ordering.
function mockResponseByItemCode(responsesByItemCode: Record<string, Record<string, unknown>>) {
  generateContent.mockImplementation((request: { contents: { parts: { text?: string }[] }[] }) => {
    const parts = request.contents[0].parts;
    const userText = parts[parts.length - 1].text ?? '';
    for (const [code, payload] of Object.entries(responsesByItemCode)) {
      if (userText.includes(`Item ${code} `)) {
        return Promise.resolve({
          response: { text: () => JSON.stringify(payload), usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } },
        });
      }
    }
    return Promise.reject(new Error(`no mock configured for prompt: ${userText.slice(0, 200)}`));
  });
}

function fakeBitmap() {
  return { width: 2, height: 2, data: new Uint8ClampedArray(2 * 2 * 4).fill(255), dpi: 150, pdfWidthPts: 10, pdfHeightPts: 10 };
}

describe('extractYesExplanationsWithVision', () => {
  beforeEach(() => {
    generateContent.mockReset();
  });

  it('returns the parsed vision override on a successful call', async () => {
    const { extractYesExplanationsWithVision } = await import('../../src/vision/disclosure-yes-explanation-vision');
    mockResponseByItemCode({
      '7D': { painted_recently: true, explanation_7: '7D-Yes painted 3 months back' },
      '8E': { other_structure: false, explanation_8: null },
    });
    const cache = new RenderedPageCache({ dpi: 150 });
    vi.spyOn(cache, 'getPage').mockResolvedValue(fakeBitmap());

    const result = await extractYesExplanationsWithVision([Buffer.from('pdf-page')], 'SPQ', TEST_SECTIONS, cache, 'test-key');
    expect(result?.override).toEqual({
      section_7: { painted_recently: true, explanation_7: '7D-Yes painted 3 months back' },
      section_8: { other_structure: false, explanation_8: null },
    });
    // The bare-boolean mock response falls back to treating the box as
    // exclusively marked (yesChecked = value, noChecked = !value) — see
    // `parseSectionCallResult`'s tolerance for a model that skips the
    // evidence-first { yesChecked, noChecked } shape.
    expect(result?.completion).toEqual({
      section_7: { painted_recently: { yesChecked: true, noChecked: false, bothMarked: false, neitherMarked: false } },
      section_8: { other_structure: { yesChecked: false, noChecked: true, bothMarked: false, neitherMarked: false } },
    });
  });

  it('strips a markdown code fence from the response before parsing', async () => {
    const { extractYesExplanationsWithVision } = await import('../../src/vision/disclosure-yes-explanation-vision');
    generateContent.mockImplementation((request: { contents: { parts: { text?: string }[] }[] }) => {
      const parts = request.contents[0].parts;
      const userText = parts[parts.length - 1].text ?? '';
      if (!userText.includes('Item 7D ')) return Promise.reject(new Error('no mock configured'));
      return Promise.resolve({
        response: {
          text: () => '```json\n{"painted_recently":true,"explanation_7":"7D-Yes painted 3 months back"}\n```',
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
        },
      });
    });
    const cache = new RenderedPageCache({ dpi: 150 });
    vi.spyOn(cache, 'getPage').mockResolvedValue(fakeBitmap());

    const result = await extractYesExplanationsWithVision([Buffer.from('pdf-page')], 'SPQ', TEST_SECTIONS, cache, 'test-key');
    expect(result?.override.section_7).toEqual({ painted_recently: true, explanation_7: '7D-Yes painted 3 months back' });
  });

  it('reports both-marked only when a single call independently observes both boxes, never manufactured from two calls disagreeing on which one', async () => {
    const { extractYesExplanationsWithVision } = await import('../../src/vision/disclosure-yes-explanation-vision');
    let call = 0;
    generateContent.mockImplementation((request: { contents: { parts: { text?: string }[] }[] }) => {
      const parts = request.contents[0].parts;
      const userText = parts[parts.length - 1].text ?? '';
      if (!userText.includes('Item 7D ')) return Promise.reject(new Error('no mock configured'));
      call += 1;
      // Two calls disagree on which single box is marked — must NOT be read as "both marked".
      const payload = call === 1
        ? { painted_recently: { yesChecked: true, noChecked: false }, explanation_7: null }
        : { painted_recently: { yesChecked: false, noChecked: true }, explanation_7: null };
      return Promise.resolve({
        response: { text: () => JSON.stringify(payload), usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } },
      });
    });
    const cache = new RenderedPageCache({ dpi: 150 });
    vi.spyOn(cache, 'getPage').mockResolvedValue(fakeBitmap());

    const result = await extractYesExplanationsWithVision(
      [Buffer.from('pdf-page')], 'SPQ',
      [{ sectionKey: 'section_7', page: 2, explanationField: 'explanation_7', items: [{ code: '7D', field: 'painted_recently' }] }],
      cache, 'test-key',
    );
    const state = result?.completion.section_7.painted_recently;
    expect(state?.bothMarked).toBe(false);
    expect(state?.neitherMarked).toBe(false);
    expect(state?.yesChecked).toBe(true);
    expect(state?.noChecked).toBe(true);
  });

  it('reports both-marked when a single call reports both of its own boxes as marked', async () => {
    const { extractYesExplanationsWithVision } = await import('../../src/vision/disclosure-yes-explanation-vision');
    mockResponseByItemCode({
      '7D': { painted_recently: { yesChecked: true, noChecked: true }, explanation_7: null },
    });
    const cache = new RenderedPageCache({ dpi: 150 });
    vi.spyOn(cache, 'getPage').mockResolvedValue(fakeBitmap());

    const result = await extractYesExplanationsWithVision(
      [Buffer.from('pdf-page')], 'SPQ',
      [{ sectionKey: 'section_7', page: 2, explanationField: 'explanation_7', items: [{ code: '7D', field: 'painted_recently' }] }],
      cache, 'test-key',
    );
    expect(result?.completion.section_7.painted_recently.bothMarked).toBe(true);
  });

  it('reports neither-marked only when both calls agree neither box has any mark', async () => {
    const { extractYesExplanationsWithVision } = await import('../../src/vision/disclosure-yes-explanation-vision');
    mockResponseByItemCode({
      '7D': { painted_recently: { yesChecked: false, noChecked: false }, explanation_7: null },
    });
    const cache = new RenderedPageCache({ dpi: 150 });
    vi.spyOn(cache, 'getPage').mockResolvedValue(fakeBitmap());

    const result = await extractYesExplanationsWithVision(
      [Buffer.from('pdf-page')], 'SPQ',
      [{ sectionKey: 'section_7', page: 2, explanationField: 'explanation_7', items: [{ code: '7D', field: 'painted_recently' }] }],
      cache, 'test-key',
    );
    expect(result?.completion.section_7.painted_recently.neitherMarked).toBe(true);
  });

  it('returns null (never throws) when the Gemini call fails', async () => {
    const { extractYesExplanationsWithVision } = await import('../../src/vision/disclosure-yes-explanation-vision');
    generateContent.mockRejectedValue(new Error('network down'));
    const cache = new RenderedPageCache({ dpi: 150 });
    vi.spyOn(cache, 'getPage').mockResolvedValue(fakeBitmap());

    const result = await extractYesExplanationsWithVision([Buffer.from('pdf-page')], 'SPQ', TEST_SECTIONS, cache, 'test-key');
    expect(result).toBeNull();
  });

  it('returns null (never throws) when page rendering fails', async () => {
    const { extractYesExplanationsWithVision } = await import('../../src/vision/disclosure-yes-explanation-vision');
    const cache = new RenderedPageCache({ dpi: 150 });
    vi.spyOn(cache, 'getPage').mockRejectedValue(new Error('corrupt pdf'));

    const result = await extractYesExplanationsWithVision([Buffer.from('pdf-page')], 'SPQ', TEST_SECTIONS, cache, 'test-key');
    expect(result).toBeNull();
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('returns null without calling Gemini when there are no pages or no sections to check', async () => {
    const { extractYesExplanationsWithVision } = await import('../../src/vision/disclosure-yes-explanation-vision');
    const cache = new RenderedPageCache({ dpi: 150 });
    expect(await extractYesExplanationsWithVision([], 'SPQ', TEST_SECTIONS, cache, 'test-key')).toBeNull();
    expect(await extractYesExplanationsWithVision([Buffer.from('x')], 'SPQ', [], cache, 'test-key')).toBeNull();
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('returns null when the response is not valid JSON', async () => {
    const { extractYesExplanationsWithVision } = await import('../../src/vision/disclosure-yes-explanation-vision');
    mockGeminiResponse('not json at all');
    const cache = new RenderedPageCache({ dpi: 150 });
    vi.spyOn(cache, 'getPage').mockResolvedValue(fakeBitmap());

    const result = await extractYesExplanationsWithVision([Buffer.from('pdf-page')], 'SPQ', TEST_SECTIONS, cache, 'test-key');
    expect(result).toBeNull();
  });
});

describe('applyDisclosureVisionOverride', () => {
  it('merges the override onto the section object without clobbering unrelated fields', async () => {
    const { applyDisclosureVisionOverride } = await import('../../src/vision/disclosure-yes-explanation-vision');
    const data: Record<string, unknown> = {
      section_7: { painted_recently: false, explanation_7: null, unrelated_field: 'keep me' },
    };
    applyDisclosureVisionOverride(data, { section_7: { painted_recently: true, explanation_7: '7D-Yes painted 3 months back' } }, TEST_SECTIONS);
    expect(data.section_7).toEqual({
      painted_recently: true,
      explanation_7: '7D-Yes painted 3 months back',
      unrelated_field: 'keep me',
    });
  });

  it('creates a section object from scratch when it did not exist in the extraction at all', async () => {
    const { applyDisclosureVisionOverride } = await import('../../src/vision/disclosure-yes-explanation-vision');
    const data: Record<string, unknown> = {};
    applyDisclosureVisionOverride(data, { section_8: { other_structure: true, explanation_8: '8E - detached workshop.' } }, TEST_SECTIONS);
    expect(data.section_8).toEqual({ other_structure: true, explanation_8: '8E - detached workshop.' });
  });

  it('ignores an override entry for a section that is not in the configured sections list', async () => {
    const { applyDisclosureVisionOverride } = await import('../../src/vision/disclosure-yes-explanation-vision');
    const data: Record<string, unknown> = { section_7: { painted_recently: false } };
    applyDisclosureVisionOverride(data, { section_99_unknown: { foo: true } }, TEST_SECTIONS);
    expect(data).toEqual({ section_7: { painted_recently: false } });
  });

  it("never lets one section's explanation land in a different section's field — cross-section leakage is structurally impossible via this API", async () => {
    const { applyDisclosureVisionOverride } = await import('../../src/vision/disclosure-yes-explanation-vision');
    const data: Record<string, unknown> = {
      section_7: { painted_recently: true, explanation_7: null },
      section_8: { other_structure: true, explanation_8: null },
    };
    // Even if the vision text under section_8 happens to mention item 7D, it is only ever
    // written to data.section_8 — never to data.section_7 — because it is keyed by sectionKey.
    applyDisclosureVisionOverride(data, { section_8: { other_structure: true, explanation_8: '7D - painted 3 months back' } }, TEST_SECTIONS);
    expect((data.section_7 as Record<string, unknown>).explanation_7).toBeNull();
    expect((data.section_8 as Record<string, unknown>).explanation_8).toBe('7D - painted 3 months back');
  });
});
