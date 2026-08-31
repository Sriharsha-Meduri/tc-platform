import { rpaStandardV1223 } from './rpa/rpa.standard.v12-23';
import { tdsStandardV0624 } from './tds/tds.standard.v06-24';
import { adStandardV1223 } from './ad/ad.standard.v12-23';
import { avidStandardV1222 } from './avid/avid.standard.v12-22';
import { biaStandardV1222 } from './bia/bia.standard.v12-22';
import { sbsaStandardV1222 } from './sbsa/sbsa.standard.v12-22';
import { prbsStandardV1222 } from './prbs/prbs.standard.v12-22';
import { bcaStandardV0625 } from './bca/bca.standard.v06-25';
import { bhiaStandardV0624 } from './bhia/bhia.standard.v06-24';
import { wfaStandardV0625 } from './wfa/wfa.standard.v06-25';
import { ccpaStandardV1222 } from './ccpa/ccpa.standard.v12-22';
import { diaStandardV1225 } from './dia/dia.standard.v12-25';
import { fhdaStandardV1224 } from './fhda/fhda.standard.v12-24';
import { mcaStandardV0624 } from './mca/mca.standard.v06-24';
import { qsStandardV0625 } from './qs/qs.standard.v06-25';
import { spqStandardV1225 } from './spq/spq.standard.v12-25';
import { rrStandardV1224 } from './rr/rr.standard.v12-24';
import { rrrrStandardV1224 } from './rrrr/rrrr.standard.v12-24';
import { crBStandardV1224 } from './cr-b/cr-b.standard.v12-24';
import { vpStandardV1224 } from './vp/vp.standard.v12-24';
import { saStandardV0625 } from './sa/sa.standard.v06-25';
import { sflsStandardV1224 } from './sfls/sfls.standard.v12-24';
import { wcmdStandardV0624 } from './wcmd/wcmd.standard.v06-24';
import { wfdaStandardV1225 } from './wfda/wfda.standard.v12-25';
import { asStandardV0625 } from './as/as.standard.v06-25';
import { scoStandardV1224 } from './sco/sco.standard.v12-24';
import type { FormDefinition } from './form-definition';

/**
 * Registry mapping form lookup keys to extraction definitions.
 *
 * KEY FORMATS:
 *   'RPA'          → latest standard version (always points to the newest entry below)
 *   'RPA@v12-23'   → pinned to a specific CAR revision date
 *   'SCO'          → latest Seller Counter Offer (shared schema with BCO/SMCO/BMCO)
 *
 * ADDING A NEW FORM:
 *   1. Create src/extractor/forms/<code>/<code>.<variant>.<version>.ts
 *      File name convention: <formcode>.<variant>.<vMM-YY>.ts
 *      E.g. spq/spq.standard.v06-24.ts
 *   2. Export a named const following the pattern: spqStandardV0624
 *   3. Add two entries below: one pinned key and one shorthand (latest) key
 *
 * ADDING A NEW VERSION OF AN EXISTING FORM:
 *   1. Create the new versioned file (e.g. rpa.standard.v08-24.ts)
 *   2. Add its pinned key 'RPA@v08-24'
 *   3. Update the shorthand key 'RPA' to point to the new version
 *   4. Keep the old pinned key so existing fixture files still resolve
 *
 * Forms NOT listed here fall back to the generic extraction schema in FormExtractor.
 */
export const FORM_REGISTRY: Record<string, FormDefinition> = {
  // RPA — Residential Purchase Agreement
  'RPA':         rpaStandardV1223,   // latest standard — update this when a new version is added
  'RPA@v12-23':  rpaStandardV1223,

  // TDS — Transfer Disclosure Statement
  'TDS':         tdsStandardV0624,   // latest standard
  'TDS@v06-24':  tdsStandardV0624,

  // AD — Disclosure Regarding Real Estate Agency Relationships
  'AD':          adStandardV1223,    // latest standard
  'AD@v12-23':   adStandardV1223,

  // AVID — Agent Visual Inspection Disclosure
  'AVID':        avidStandardV1222,  // latest standard
  'AVID@v12-22': avidStandardV1222,

  // BIA — Buyer's Investigation Advisory
  'BIA':         biaStandardV1222,   // latest standard
  'BIA@v12-22':  biaStandardV1222,

  // SBSA — Statewide Buyer and Seller Advisory
  'SBSA':        sbsaStandardV1222,  // latest standard
  'SBSA@v12-22': sbsaStandardV1222,

  // PRBS — Possible Representation of More Than One Buyer or Seller
  'PRBS':        prbsStandardV1222,  // latest standard
  'PRBS@v12-22': prbsStandardV1222,

  // BCA — Broker Compensation Advisory
  'BCA':         bcaStandardV0625,   // latest standard
  'BCA@v06-25':  bcaStandardV0625,

  // BHIA — Buyer Homeowners' Insurance Advisory
  'BHIA':        bhiaStandardV0624,  // latest standard
  'BHIA@v06-24': bhiaStandardV0624,

  // WFA — Wire Fraud and Electronic Funds Transfer Advisory
  'WFA':         wfaStandardV0625,   // latest standard
  'WFA@v06-25':  wfaStandardV0625,

  // CCPA — California Consumer Privacy Act Advisory, Disclosure and Notice
  'CCPA':        ccpaStandardV1222,  // latest standard
  'CCPA@v12-22': ccpaStandardV1222,

  // DIA — Disclosure Information Advisory (for Sellers)
  'DIA':         diaStandardV1225,   // latest standard
  'DIA@v12-25':  diaStandardV1225,

  // FHDA — Fair Housing and Discrimination Advisory
  'FHDA':        fhdaStandardV1224,  // latest standard
  'FHDA@v12-24': fhdaStandardV1224,

  // MCA — Market Conditions Advisory
  'MCA':         mcaStandardV0624,   // latest standard
  'MCA@v06-24':  mcaStandardV0624,

  // QS — Qualified Substitute Declaration / FIRPTA Transferor Affidavit
  'QS':          qsStandardV0625,    // latest standard
  'QS@v06-25':   qsStandardV0625,

  // SPQ — Seller Property Questionnaire
  'SPQ':         spqStandardV1225,   // latest standard
  'SPQ@v12-25':  spqStandardV1225,

  // RR — Request for Repair
  'RR':          rrStandardV1224,    // latest standard
  'RR@v12-24':   rrStandardV1224,

  // RRRR — Seller's Response to Buyer's Request for Repair
  'RRRR':        rrrrStandardV1224,  // latest standard
  'RRRR@v12-24': rrrrStandardV1224,

  // CR-B — Contingency Removal (Buyer)
  'CR-B':        crBStandardV1224,   // latest standard
  'CR-B@v12-24': crBStandardV1224,

  // VP — Verification of Property Condition
  'VP':          vpStandardV1224,    // latest standard
  'VP@v12-24':   vpStandardV1224,

  // SA — Seller's Advisory
  'SA':          saStandardV0625,    // latest standard
  'SA@v06-25':   saStandardV0625,

  // SFLS — Square Footage and Lot Size Advisory and Disclosure
  'SFLS':        sflsStandardV1224,  // latest standard
  'SFLS@v12-24': sflsStandardV1224,

  // WCMD — Water-Conserving Plumbing Fixtures and Carbon Monoxide Detector Advisory
  'WCMD':        wcmdStandardV0624,  // latest standard
  'WCMD@v06-24': wcmdStandardV0624,

  // WFDA — Wildfire Disaster Advisory
  'WFDA':        wfdaStandardV1225,  // latest standard
  'WFDA@v12-25': wfdaStandardV1225,

  // AS — Seller's Affidavit of Nonforeign Status (FIRPTA)
  'AS':          asStandardV0625,    // latest standard
  'AS@v06-25':   asStandardV0625,

  // SCO — Seller Counter Offer
  'SCO':         scoStandardV1224,   // latest standard
  'SCO@v12-24':  scoStandardV1224,

  // BCO — Buyer Counter Offer (same schema, role-neutral naming)
  'BCO':         scoStandardV1224,   // same definition — shared schema
  'BCO@v12-24':  scoStandardV1224,

  // SMCO — Seller Multiple Counter Offer (same schema)
  'SMCO':        scoStandardV1224,   // same definition — shared schema
  'SMCO@v12-24': scoStandardV1224,

  // BMCO — Buyer Multiple Counter Offer (same schema)
  'BMCO':        scoStandardV1224,   // same definition — shared schema
  'BMCO@v12-24': scoStandardV1224,
};

/**
 * Resolve a form definition by code, optionally pinned to a version.
 *
 * Usage in form extractor: resolve('RPA') or resolve('RPA', 'v12-23')
 * Falls back to the shorthand key if the pinned version is not found.
 */
export function resolveFormDefinition(
  formCode: string,
  version?: string | null,
): FormDefinition | undefined {
  const code = formCode.toUpperCase();
  if (version) {
    return FORM_REGISTRY[`${code}@${version}`] ?? FORM_REGISTRY[code];
  }
  return FORM_REGISTRY[code];
}
