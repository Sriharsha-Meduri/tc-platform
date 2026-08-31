import { FORM_FAMILIES } from './form-families';
import type { FormFamily, FormFamilyId } from './sequence.types';

export function getFamilyById(id: FormFamilyId): FormFamily | undefined {
  return FORM_FAMILIES.find((f) => f.id === id);
}

export function getFamilyForFormCode(code: string): FormFamily | null {
  const upper = code.toUpperCase();
  for (const family of FORM_FAMILIES) {
    if (family.formCodes.some((c) => c.toUpperCase() === upper)) {
      return family;
    }
  }
  return null;
}

export function isInSameFamily(code1: string, code2: string): boolean {
  const upper1 = code1.toUpperCase();
  const upper2 = code2.toUpperCase();
  for (const family of FORM_FAMILIES) {
    const has1 = family.formCodes.some((c) => c.toUpperCase() === upper1);
    const has2 = family.formCodes.some((c) => c.toUpperCase() === upper2);
    if (has1 && has2) return true;
  }
  return false;
}

export interface FamilyMatch {
  index: number;
  isCrossMember: boolean;
}

function parseSeqNum(doc: { metadataJson: Record<string, unknown> | null }): number {
  const raw = doc.metadataJson?.counterOfferNumber;
  if (typeof raw === 'string') {
    const n = parseInt(raw, 10);
    if (!isNaN(n)) return n;
  }
  return 0;
}

export function findLatestInFamily(
  docs: { metadataJson: Record<string, unknown> | null }[],
  detectedFormCode: string,
): FamilyMatch | null {
  const family = getFamilyForFormCode(detectedFormCode);
  if (!family) return null;

  const upper = detectedFormCode.toUpperCase();
  let bestIndex = -1;
  let bestSeq = -1;

  for (let i = 0; i < docs.length; i++) {
    const docCode = docs[i].metadataJson?.detectedFormCode as string | undefined;
    if (docCode && family.formCodes.some((c) => c.toUpperCase() === docCode.toUpperCase())) {
      const seq = parseSeqNum(docs[i]);
      if (seq > bestSeq) {
        bestIndex = i;
        bestSeq = seq;
      }
    }
  }

  if (bestIndex < 0) return null;

  const matchedCode = docs[bestIndex].metadataJson?.detectedFormCode as string | undefined;
  return {
    index: bestIndex,
    isCrossMember: (matchedCode ?? '').toUpperCase() !== upper,
  };
}
