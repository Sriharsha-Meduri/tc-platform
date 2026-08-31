/**
 * California Association of REALTORS® (C.A.R.) Standard Forms Metadata
 *
 * Source: C.A.R. Standard Forms directory (car.org/tools/standard-forms)
 * This file is the single source of truth for all known CAR form codes, names,
 * categories, and transaction applicability.
 *
 * Used by:
 *  - Form checklist template builder (agents compose templates from this list)
 *  - RPA compliance validator (cross-references detected forms against known codes)
 *  - Document checklist UI (displays available forms for a transaction type)
 *
 * To add a new state: create a parallel file (e.g. il-forms.metadata.ts) and
 * re-export through forms-registry.ts.
 */

export type FormCategory =
  | 'purchase_agreement'
  | 'counter_offer'
  | 'listing_agreement'
  | 'buyer_representation'
  | 'disclosure'
  | 'advisory'
  | 'addendum'
  | 'contingency_performance'
  | 'inspection_repair'
  | 'finance'
  | 'federal_compliance'
  | 'commercial'
  | 'lease_rental'
  | 'probate_estate'
  | 'new_construction'
  | 'property_management'
  | 'closing'
  | 'escrow';

export type TransactionSide = 'buyer_side' | 'seller_side' | 'both' | 'listing' | 'dual_agency';
export type TransactionType = 'residential' | 'income_property' | 'commercial' | 'land' | 'manufactured_home' | 'new_construction';

export interface CarFormMetadata {
  /** Official C.A.R. form code, e.g. "RPA", "TDS", "CR-B" */
  code: string;
  /** Full official form name */
  name: string;
  /** Form category for grouping in UI and templates */
  category: FormCategory;
  /** Which side of a transaction uses this form */
  applicableTo: TransactionSide[];
  /** Which transaction types this form applies to */
  transactionTypes: TransactionType[];
  /**
   * Whether this form is legally required in California
   * (as opposed to discretionary/optional).
   * 'conditional' means required only when specific circumstances apply.
   */
  required: boolean | 'conditional';
  /** Version / revision date as printed on the form */
  revisedDate?: string;
  /** Short description for UI display */
  description: string;
  /**
   * When required is 'conditional', explains the condition.
   * E.g. "Required if property built before 1978 (federal law)"
   */
  requiredWhen?: string;
}

// ─── Purchase Agreements ──────────────────────────────────────────────────────

const PURCHASE_AGREEMENTS: CarFormMetadata[] = [
  {
    code: 'RPA',
    name: 'Residential Purchase Agreement and Joint Escrow Instructions',
    category: 'purchase_agreement',
    applicableTo: ['buyer_side', 'seller_side', 'both'],
    transactionTypes: ['residential'],
    required: true,
    revisedDate: '12/25',
    description: 'Primary contract for purchase and sale of residential property. Includes joint escrow instructions.',
  },
  {
    code: 'RIPA',
    name: 'Residential Income Property Purchase Agreement and Joint Escrow Instructions',
    category: 'purchase_agreement',
    applicableTo: ['buyer_side', 'seller_side', 'both'],
    transactionTypes: ['income_property'],
    required: true,
    revisedDate: '12/24',
    description: 'Purchase agreement for 2–4 unit residential income properties.',
  },
  {
    code: 'VLPA',
    name: 'Vacant Land Purchase Agreement and Joint Escrow Instructions',
    category: 'purchase_agreement',
    applicableTo: ['buyer_side', 'seller_side', 'both'],
    transactionTypes: ['land'],
    required: true,
    revisedDate: '12/24',
    description: 'Purchase agreement for vacant land and lot purchases.',
  },
  {
    code: 'CPA',
    name: 'Commercial Property Purchase Agreement and Joint Escrow Instructions',
    category: 'purchase_agreement',
    applicableTo: ['buyer_side', 'seller_side', 'both'],
    transactionTypes: ['commercial'],
    required: true,
    revisedDate: '12/24',
    description: 'Purchase agreement for commercial and industrial properties.',
  },
  {
    code: 'MH-PA',
    name: 'Manufactured Home Purchase Agreement',
    category: 'purchase_agreement',
    applicableTo: ['buyer_side', 'seller_side', 'both'],
    transactionTypes: ['manufactured_home'],
    required: true,
    revisedDate: '12/23',
    description: 'Purchase agreement for manufactured (mobile) homes on leased land.',
  },
  {
    code: 'NIPA',
    name: 'New Construction Purchase Agreement',
    category: 'purchase_agreement',
    applicableTo: ['buyer_side', 'seller_side', 'both'],
    transactionTypes: ['new_construction'],
    required: true,
    revisedDate: '12/23',
    description: 'Purchase agreement for new construction homes.',
  },
];

// ─── Counter Offers ───────────────────────────────────────────────────────────

const COUNTER_OFFERS: CarFormMetadata[] = [
  {
    code: 'SCO',
    name: 'Seller Counter Offer',
    category: 'counter_offer',
    applicableTo: ['seller_side', 'both'],
    transactionTypes: ['residential', 'income_property', 'land', 'commercial'],
    required: false,
    revisedDate: '12/24',
    description: 'Counter offer from seller modifying one or more terms of the buyer\'s offer.',
  },
  {
    code: 'SMCO',
    name: 'Seller Multiple Counter Offer',
    category: 'counter_offer',
    applicableTo: ['seller_side'],
    transactionTypes: ['residential', 'income_property', 'land', 'commercial'],
    required: false,
    revisedDate: '12/24',
    description: 'Allows seller to counter multiple buyers simultaneously without committing to any single buyer.',
  },
  {
    code: 'BCO',
    name: 'Buyer Counter Offer',
    category: 'counter_offer',
    applicableTo: ['buyer_side', 'both'],
    transactionTypes: ['residential', 'income_property', 'land', 'commercial'],
    required: false,
    revisedDate: '12/24',
    description: 'Counter offer from buyer in response to a seller counter offer.',
  },
  {
    code: 'BMCO',
    name: 'Buyer Multiple Counter Offer Selection',
    category: 'counter_offer',
    applicableTo: ['buyer_side'],
    transactionTypes: ['residential', 'income_property', 'land', 'commercial'],
    required: false,
    revisedDate: '12/23',
    description: 'Buyer selects and signs one of multiple counter offers issued by seller.',
  },
];

// ─── Listing Agreements ───────────────────────────────────────────────────────

const LISTING_AGREEMENTS: CarFormMetadata[] = [
  {
    code: 'RLA',
    name: 'Residential Listing Agreement — Exclusive Authorization and Right to Sell',
    category: 'listing_agreement',
    applicableTo: ['listing'],
    transactionTypes: ['residential'],
    required: true,
    revisedDate: '1/25',
    description: 'Exclusive listing agreement granting broker the right to sell the property.',
  },
  {
    code: 'RLAA',
    name: 'Residential Listing Agreement — Exclusive Authorization and Right to Sell (Agency)',
    category: 'listing_agreement',
    applicableTo: ['listing'],
    transactionTypes: ['residential'],
    required: false,
    revisedDate: '12/24',
    description: 'Alternate exclusive listing agreement with modified agency provisions.',
  },
  {
    code: 'RLAS',
    name: 'Residential Listing Agreement — Seller Reserved',
    category: 'listing_agreement',
    applicableTo: ['listing'],
    transactionTypes: ['residential'],
    required: false,
    revisedDate: '12/23',
    description: 'Exclusive listing agreement where seller retains the right to sell to named parties without paying commission.',
  },
  {
    code: 'RLBO',
    name: 'Residential Listing Agreement — Open',
    category: 'listing_agreement',
    applicableTo: ['listing'],
    transactionTypes: ['residential'],
    required: false,
    revisedDate: '12/23',
    description: 'Non-exclusive open listing agreement.',
  },
  {
    code: 'CLAL',
    name: 'Commercial Listing Agreement — Exclusive Authorization',
    category: 'listing_agreement',
    applicableTo: ['listing'],
    transactionTypes: ['commercial'],
    required: true,
    revisedDate: '12/24',
    description: 'Exclusive listing agreement for commercial and industrial properties.',
  },
  {
    code: 'LLAL',
    name: 'Land Listing Agreement — Exclusive Authorization',
    category: 'listing_agreement',
    applicableTo: ['listing'],
    transactionTypes: ['land'],
    required: true,
    revisedDate: '12/23',
    description: 'Exclusive listing agreement for vacant land.',
  },
  {
    code: 'RIPA-LA',
    name: 'Residential Income Property Listing Agreement',
    category: 'listing_agreement',
    applicableTo: ['listing'],
    transactionTypes: ['income_property'],
    required: true,
    revisedDate: '12/24',
    description: 'Exclusive listing agreement for 2–4 unit residential income properties.',
  },
];

// ─── Buyer Representation ─────────────────────────────────────────────────────

const BUYER_REPRESENTATION: CarFormMetadata[] = [
  {
    code: 'BRBC',
    name: 'Buyer Representation and Broker Compensation Agreement',
    category: 'buyer_representation',
    applicableTo: ['buyer_side'],
    transactionTypes: ['residential', 'income_property', 'land', 'commercial'],
    required: true,
    revisedDate: '8/24',
    description: 'Required (as of August 17, 2024) before a broker shows property to a buyer. Establishes buyer representation and compensation terms.',
    requiredWhen: 'Required before showing property to any buyer — NAR settlement mandate effective 8/17/2024.',
  },
  {
    code: 'BRBB',
    name: 'Buyer Representation and Broker Compensation — Bilateral',
    category: 'buyer_representation',
    applicableTo: ['buyer_side', 'both'],
    transactionTypes: ['residential', 'income_property', 'land', 'commercial'],
    required: false,
    revisedDate: '8/24',
    description: 'Alternative buyer representation agreement signed by both buyer and seller\'s broker when buyer\'s broker compensation comes from seller.',
  },
  {
    code: 'BRBCAA',
    name: 'Buyer Representation and Broker Compensation Agreement — Addendum',
    category: 'buyer_representation',
    applicableTo: ['buyer_side'],
    transactionTypes: ['residential', 'income_property', 'land', 'commercial'],
    required: false,
    revisedDate: '8/24',
    description: 'Addendum to BRBC modifying terms of the buyer representation agreement.',
  },
];

// ─── Disclosures (Legally Required) ──────────────────────────────────────────

const DISCLOSURES: CarFormMetadata[] = [
  {
    code: 'TDS',
    name: 'Real Estate Transfer Disclosure Statement',
    category: 'disclosure',
    applicableTo: ['seller_side', 'both'],
    transactionTypes: ['residential'],
    required: true,
    revisedDate: '12/24',
    description: 'Mandatory seller disclosure of known property conditions, defects, and material facts. Required by California Civil Code §1102 for 1–4 unit residential properties.',
    requiredWhen: 'Required for all residential 1–4 unit property sales (Civil Code §1102). Exempt: new construction with 10-year warranty, foreclosure, probate court order.',
  },
  {
    code: 'SPQ',
    name: 'Seller Property Questionnaire',
    category: 'disclosure',
    applicableTo: ['seller_side', 'both'],
    transactionTypes: ['residential', 'income_property'],
    required: true,
    revisedDate: '12/24',
    description: 'Seller\'s detailed disclosure of property characteristics, systems, improvements, legal issues, and neighborhood conditions. Supplements the TDS.',
  },
  {
    code: 'SPQR',
    name: 'Supplemental Seller Property Questionnaire',
    category: 'disclosure',
    applicableTo: ['seller_side'],
    transactionTypes: ['residential'],
    required: false,
    revisedDate: '12/23',
    description: 'Extended questionnaire for additional property condition disclosures.',
  },
  {
    code: 'AD',
    name: 'Disclosure Regarding Real Estate Agency Relationships',
    category: 'disclosure',
    applicableTo: ['buyer_side', 'seller_side', 'both'],
    transactionTypes: ['residential', 'income_property', 'land', 'commercial'],
    required: true,
    revisedDate: '12/24',
    description: 'Mandatory disclosure of agency relationship (buyer\'s agent, seller\'s agent, or dual agent) to all parties. Required by California Civil Code §2079.',
  },
  {
    code: 'AVID',
    name: 'Agent Visual Inspection Disclosure',
    category: 'disclosure',
    applicableTo: ['buyer_side', 'seller_side', 'both'],
    transactionTypes: ['residential'],
    required: true,
    revisedDate: '12/24',
    description: 'Agent\'s disclosure of observations from visual inspection of the property. Required of all agents in a residential transaction (Civil Code §2079.3).',
  },
  {
    code: 'SBSA',
    name: 'Statewide Buyer and Seller Advisory',
    category: 'disclosure',
    applicableTo: ['buyer_side', 'seller_side', 'both'],
    transactionTypes: ['residential', 'income_property', 'land'],
    required: false,
    revisedDate: '12/24',
    description: 'Comprehensive advisory covering property conditions, neighborhood issues, legal disclosures, and buyer/seller rights. Strongly recommended.',
  },
  {
    code: 'NHD',
    name: 'Natural Hazard Disclosure Statement',
    category: 'disclosure',
    applicableTo: ['seller_side', 'both'],
    transactionTypes: ['residential', 'income_property', 'land'],
    required: true,
    revisedDate: '12/24',
    description: 'Discloses whether property is in any state-mapped natural hazard zones (earthquake fault, seismic hazard, flood, fire, etc.). Required by California law.',
    requiredWhen: 'Required for all California residential property sales. Typically provided by a third-party NHD company.',
  },
  {
    code: 'FHDA',
    name: 'Fair Housing and Discrimination Advisory',
    category: 'disclosure',
    applicableTo: ['buyer_side', 'seller_side', 'both'],
    transactionTypes: ['residential', 'income_property', 'land', 'commercial'],
    required: false,
    revisedDate: '12/24',
    description: 'Advisory informing parties of fair housing laws, prohibited discrimination, and their rights and obligations.',
  },
  {
    code: 'WFA',
    name: 'Wire Fraud and Electronic Funds Transfer Advisory',
    category: 'disclosure',
    applicableTo: ['buyer_side', 'seller_side', 'both'],
    transactionTypes: ['residential', 'income_property', 'land', 'commercial'],
    required: false,
    revisedDate: '12/24',
    description: 'Advisory warning buyers and sellers about wire fraud schemes targeting real estate transactions.',
  },
  {
    code: 'CCPA',
    name: 'California Consumer Privacy Act Advisory, Disclosure and Notice',
    category: 'disclosure',
    applicableTo: ['buyer_side', 'seller_side', 'both'],
    transactionTypes: ['residential', 'income_property', 'land', 'commercial'],
    required: false,
    revisedDate: '12/22',
    description: 'Notice to buyers and sellers about collection and use of personal data under CCPA.',
  },
  {
    code: 'PRBS',
    name: 'Possible Representation of More Than One Buyer or Seller — Disclosure and Consent',
    category: 'disclosure',
    applicableTo: ['buyer_side', 'seller_side', 'both'],
    transactionTypes: ['residential', 'income_property', 'land', 'commercial'],
    required: false,
    revisedDate: '6/25',
    description: 'Consent form for dual agency — where one broker represents both buyer and seller.',
  },
  {
    code: 'AC',
    name: 'Confirmation of Real Estate Agency Relationships',
    category: 'disclosure',
    applicableTo: ['buyer_side', 'seller_side', 'both'],
    transactionTypes: ['residential', 'income_property', 'land', 'commercial'],
    required: false,
    description: 'Confirmation that all parties have received and understand the agency relationship disclosure.',
  },
  {
    code: 'AVID LA',
    name: 'Agent Visual Inspection Disclosure (Listing Agent)',
    category: 'disclosure',
    applicableTo: ['seller_side'],
    transactionTypes: ['residential'],
    required: true,
    description: 'Listing agent\'s disclosure of observations from visual inspection of the property. Required of listing agents in residential transactions (Civil Code §2079.3).',
  },
  {
    code: 'AVID SA',
    name: 'Agent Visual Inspection Disclosure (Seller Agent)',
    category: 'disclosure',
    applicableTo: ['buyer_side'],
    transactionTypes: ['residential'],
    required: true,
    description: 'Seller\'s agent disclosure of observations from visual inspection of the property. Required of seller\'s agents in residential transactions (Civil Code §2079.3).',
  },
  {
    code: 'BHAA',
    name: "Buyer's Homeowners' Association Advisory",
    category: 'advisory',
    applicableTo: ['buyer_side'],
    transactionTypes: ['residential'],
    required: false,
    description: 'Advisory informing buyers about homeowners association documents, fees, and their review rights.',
  },
  {
    code: 'DEDA',
    name: 'Designated Electronic Delivery Address Amendment',
    category: 'disclosure',
    applicableTo: ['buyer_side', 'seller_side', 'both'],
    transactionTypes: ['residential', 'income_property', 'commercial'],
    required: false,
    description: 'Amendment designating the electronic delivery address for transaction-related documents and communications.',
  },
  {
    code: 'PVOH',
    name: 'Property Visit and Open House Advisory',
    category: 'advisory',
    applicableTo: ['buyer_side', 'seller_side', 'both'],
    transactionTypes: ['residential'],
    required: false,
    description: 'Advisory regarding property visits and open house procedures, including agent duties and buyer expectations.',
  },
  {
    code: 'FHDS',
    name: 'Fire Hardening & Defensible Space Disclosure',
    category: 'disclosure',
    applicableTo: ['seller_side'],
    transactionTypes: ['residential'],
    required: 'conditional',
    description: 'Disclosure of fire hardening measures and defensible space requirements for properties in fire hazard zones.',
    requiredWhen: 'Required for properties in state fire responsibility areas or very high fire hazard severity zones.',
  },
  {
    code: 'WPA',
    name: 'Water-Saving Plumbing Retrofit Disclosure and Waiver',
    category: 'disclosure',
    applicableTo: ['seller_side'],
    transactionTypes: ['residential'],
    required: 'conditional',
    revisedDate: '12/23',
    description: 'Disclosure of California law requiring water-conserving plumbing fixtures at point of sale.',
    requiredWhen: 'Required when property does not have compliant water-conserving fixtures. Waiver available under certain conditions.',
  },
  {
    code: 'MELLO',
    name: 'Mello-Roos and Special Assessment Disclosure',
    category: 'disclosure',
    applicableTo: ['seller_side'],
    transactionTypes: ['residential', 'income_property', 'land'],
    required: 'conditional',
    revisedDate: '12/23',
    description: 'Disclosure of Mello-Roos community facilities district bonds or special assessments on the property.',
    requiredWhen: 'Required when property is subject to Mello-Roos tax or special assessments (Government Code §53341.5).',
  },
  {
    code: 'WHSD',
    name: 'Residential Earthquake Hazards Report',
    category: 'disclosure',
    applicableTo: ['seller_side'],
    transactionTypes: ['residential'],
    required: 'conditional',
    revisedDate: '12/23',
    description: 'Seller\'s disclosure and buyer\'s acknowledgment regarding residential earthquake hazards.',
    requiredWhen: 'Required for residential properties built before January 1, 1960 with certain structural types.',
  },
  {
    code: 'IBA',
    name: 'Interim Occupancy Addendum — HOA',
    category: 'disclosure',
    applicableTo: ['buyer_side', 'seller_side'],
    transactionTypes: ['residential'],
    required: 'conditional',
    revisedDate: '12/23',
    description: 'HOA disclosure and approval requirements for interim occupancy.',
    requiredWhen: 'Required when property is in a common interest development (HOA) or condo.',
  },
];

// ─── Advisory Forms ───────────────────────────────────────────────────────────

const ADVISORIES: CarFormMetadata[] = [
  {
    code: 'BIA',
    name: 'Buyer\'s Investigation Advisory',
    category: 'advisory',
    applicableTo: ['buyer_side', 'both'],
    transactionTypes: ['residential', 'income_property', 'land'],
    required: false,
    revisedDate: '6/25',
    description: 'Advises buyer to investigate the property and obtain professional inspections. Lists common areas to investigate.',
  },
  {
    code: 'BHIA',
    name: 'Buyer Homeowners\' Insurance Advisory',
    category: 'advisory',
    applicableTo: ['buyer_side'],
    transactionTypes: ['residential'],
    required: false,
    revisedDate: '6/24',
    description: 'Advisory on the importance of obtaining homeowners insurance; notes California\'s wildfire insurance challenges.',
  },
  {
    code: 'AEA',
    name: 'Agent Environmental Advisory',
    category: 'advisory',
    applicableTo: ['buyer_side', 'seller_side', 'both'],
    transactionTypes: ['residential', 'income_property', 'land', 'commercial'],
    required: false,
    revisedDate: '12/23',
    description: 'Advises parties about potential environmental hazards and recommends professional environmental inspection.',
  },
  {
    code: 'FHA-VA',
    name: 'FHA/VA and Conventional Financing Advisory',
    category: 'advisory',
    applicableTo: ['buyer_side'],
    transactionTypes: ['residential'],
    required: false,
    revisedDate: '12/23',
    description: 'Advisory about differences between FHA, VA, and conventional financing and their impact on the transaction.',
  },
  {
    code: 'RSPA',
    name: 'Residential Square Footage Advisory',
    category: 'advisory',
    applicableTo: ['buyer_side', 'seller_side'],
    transactionTypes: ['residential'],
    required: false,
    revisedDate: '12/23',
    description: 'Advisory about how residential square footage is measured and potential discrepancies with public records.',
  },
  {
    code: 'SEA',
    name: 'Solar Energy Advisory',
    category: 'advisory',
    applicableTo: ['buyer_side', 'seller_side', 'both'],
    transactionTypes: ['residential', 'income_property'],
    required: false,
    revisedDate: '12/23',
    description: 'Advisory about solar systems — owned vs. leased, net metering, and transfer of solar agreements.',
  },
  {
    code: 'PED',
    name: 'Parent/Guardian Authorization for Minor Signatory',
    category: 'advisory',
    applicableTo: ['buyer_side', 'seller_side', 'both'],
    transactionTypes: ['residential', 'income_property', 'land', 'commercial'],
    required: 'conditional',
    revisedDate: '12/23',
    description: 'Authorization for parent or guardian to sign on behalf of a minor party to the transaction.',
    requiredWhen: 'Required when any party to the transaction is a minor.',
  },
  {
    code: 'HAA',
    name: 'Home Affordability Advisory',
    category: 'advisory',
    applicableTo: ['buyer_side'],
    transactionTypes: ['residential'],
    required: false,
    revisedDate: '12/24',
    description: 'Advisory about the true costs of homeownership beyond the purchase price.',
  },
];

// ─── Addenda ──────────────────────────────────────────────────────────────────

const ADDENDA: CarFormMetadata[] = [
  {
    code: 'AADDM',
    name: 'Addendum',
    category: 'addendum',
    applicableTo: ['buyer_side', 'seller_side', 'both'],
    transactionTypes: ['residential', 'income_property', 'land', 'commercial'],
    required: false,
    revisedDate: '12/24',
    description: 'General-purpose addendum for additional terms or modifications to the purchase agreement.',
  },
  {
    code: 'HOA',
    name: 'Homeowners Association Information and Addendum',
    category: 'addendum',
    applicableTo: ['seller_side', 'both'],
    transactionTypes: ['residential'],
    required: 'conditional',
    revisedDate: '12/24',
    description: 'Discloses HOA information and adds terms for delivery of HOA documents, review period, and associated costs.',
    requiredWhen: 'Required when property is in a common interest development (HOA, condo, PUD, etc.).',
  },
  {
    code: 'IDA',
    name: 'Increased Deposit Addendum',
    category: 'addendum',
    applicableTo: ['buyer_side', 'both'],
    transactionTypes: ['residential', 'income_property', 'land'],
    required: false,
    revisedDate: '12/23',
    description: 'Documents an increase in the initial deposit amount after the original offer is accepted.',
  },
  {
    code: 'REOA',
    name: 'REO Addendum',
    category: 'addendum',
    applicableTo: ['buyer_side', 'both'],
    transactionTypes: ['residential', 'income_property', 'commercial'],
    required: false,
    revisedDate: '12/23',
    description: 'Addendum for purchasing a bank-owned (REO) or foreclosure property, incorporating bank\'s additional terms.',
  },
  {
    code: 'SH',
    name: 'Short Sale Addendum',
    category: 'addendum',
    applicableTo: ['buyer_side', 'seller_side', 'both'],
    transactionTypes: ['residential', 'income_property'],
    required: false,
    revisedDate: '12/23',
    description: 'Addendum for short sale transactions contingent on lender approval of reduced payoff.',
  },
  {
    code: 'PA',
    name: 'Probate Purchase Addendum',
    category: 'addendum',
    applicableTo: ['buyer_side', 'seller_side', 'both'],
    transactionTypes: ['residential', 'income_property', 'land'],
    required: false,
    revisedDate: '12/23',
    description: 'Addendum for purchasing property through a probate estate sale requiring court confirmation.',
  },
  {
    code: 'ABA',
    name: 'Additional Broker Acknowledgement',
    category: 'addendum',
    applicableTo: ['buyer_side', 'seller_side', 'both'],
    transactionTypes: ['residential', 'income_property', 'land', 'commercial'],
    required: false,
    revisedDate: '12/24',
    description: 'Acknowledges participation of an additional broker and confirms compensation.',
  },
  {
    code: 'FRR-PA',
    name: 'Federal Reporting Requirement Purchase Addendum',
    category: 'addendum',
    applicableTo: ['buyer_side', 'seller_side', 'both'],
    transactionTypes: ['residential', 'income_property', 'commercial'],
    required: 'conditional',
    revisedDate: '10/25',
    description: 'Addendum addressing FinCEN reporting requirements for all-cash purchases above certain thresholds.',
    requiredWhen: 'Required for cash transactions meeting FinCEN reporting thresholds (typically $300K+ depending on county).',
  },
  {
    code: 'SOLAR-A',
    name: 'Solar Panels and Systems Addendum',
    category: 'addendum',
    applicableTo: ['seller_side', 'both'],
    transactionTypes: ['residential', 'income_property'],
    required: 'conditional',
    revisedDate: '12/23',
    description: 'Addendum addressing disposition of solar panels and systems — owned vs. leased, transfer terms.',
    requiredWhen: 'Required when property has solar panels or systems, whether owned or leased.',
  },
  {
    code: 'RLEO',
    name: 'Residential Lease After Sale (Seller Leaseback)',
    category: 'addendum',
    applicableTo: ['seller_side', 'both'],
    transactionTypes: ['residential'],
    required: false,
    revisedDate: '12/24',
    description: 'Agreement for seller to remain in the property as a tenant after close of escrow.',
  },
  {
    code: 'RID',
    name: 'Residential Interim Occupancy Agreement',
    category: 'addendum',
    applicableTo: ['buyer_side', 'both'],
    transactionTypes: ['residential'],
    required: false,
    revisedDate: '12/23',
    description: 'Agreement allowing buyer to occupy the property prior to close of escrow.',
  },
  {
    code: 'HWA',
    name: 'Home Warranty Addendum',
    category: 'addendum',
    applicableTo: ['buyer_side', 'seller_side', 'both'],
    transactionTypes: ['residential', 'income_property'],
    required: false,
    revisedDate: '12/23',
    description: 'Documents the home warranty plan to be provided, coverage, cost, and who pays.',
  },
];

// ─── Contingency & Performance ────────────────────────────────────────────────

const CONTINGENCY_PERFORMANCE: CarFormMetadata[] = [
  {
    code: 'CR-B',
    name: 'Contingency Removal (Buyer)',
    category: 'contingency_performance',
    applicableTo: ['buyer_side', 'both'],
    transactionTypes: ['residential', 'income_property', 'land', 'commercial'],
    required: false,
    revisedDate: '12/24',
    description: 'Buyer removes one or more contingencies from the purchase agreement, making the purchase non-refundable as to those contingencies.',
  },
  {
    code: 'CR-S',
    name: 'Contingency Removal (Seller)',
    category: 'contingency_performance',
    applicableTo: ['seller_side', 'both'],
    transactionTypes: ['residential', 'income_property', 'land', 'commercial'],
    required: false,
    revisedDate: '12/24',
    description: 'Seller removes contingencies (e.g. seller\'s contingency on finding replacement property).',
  },
  {
    code: 'NBP',
    name: 'Notice to Buyer to Perform',
    category: 'contingency_performance',
    applicableTo: ['seller_side'],
    transactionTypes: ['residential', 'income_property', 'land', 'commercial'],
    required: false,
    revisedDate: '12/24',
    description: 'Seller notifies buyer to remove contingencies or meet contractual obligations within a specified period or the seller may cancel.',
  },
  {
    code: 'NSP',
    name: 'Notice to Seller to Perform',
    category: 'contingency_performance',
    applicableTo: ['buyer_side'],
    transactionTypes: ['residential', 'income_property', 'land', 'commercial'],
    required: false,
    revisedDate: '12/24',
    description: 'Buyer notifies seller to perform contractual obligations (e.g. deliver disclosures) or buyer may cancel.',
  },
  {
    code: 'DCE',
    name: 'Demand to Close Escrow',
    category: 'contingency_performance',
    applicableTo: ['buyer_side', 'seller_side', 'both'],
    transactionTypes: ['residential', 'income_property', 'land', 'commercial'],
    required: false,
    revisedDate: '12/24',
    description: 'Demand that the other party close escrow on or before a specific date or the demanding party may cancel.',
  },
  {
    code: 'CC',
    name: 'Cancellation of Contract, Release of Deposit and Joint Escrow Instructions',
    category: 'contingency_performance',
    applicableTo: ['buyer_side', 'seller_side', 'both'],
    transactionTypes: ['residential', 'income_property', 'land', 'commercial'],
    required: false,
    revisedDate: '12/24',
    description: 'Formally cancels the purchase agreement and provides instructions for release of the buyer\'s deposit.',
  },
  {
    code: 'VP',
    name: 'Verification of Property Condition',
    category: 'closing',
    applicableTo: ['buyer_side', 'both'],
    transactionTypes: ['residential', 'income_property'],
    required: false,
    revisedDate: '12/24',
    description: 'Buyer verifies the condition of the property before close of escrow matches the agreed-upon condition.',
  },
];

// ─── Inspection & Repair ──────────────────────────────────────────────────────

const INSPECTION_REPAIR: CarFormMetadata[] = [
  {
    code: 'RR',
    name: 'Request for Repair',
    category: 'inspection_repair',
    applicableTo: ['buyer_side', 'both'],
    transactionTypes: ['residential', 'income_property'],
    required: false,
    revisedDate: '12/24',
    description: 'Buyer requests seller make specific repairs or provide a credit in lieu of repairs following inspection.',
  },
  {
    code: 'RRRR',
    name: 'Seller\'s Response to Buyer\'s Request for Repair',
    category: 'inspection_repair',
    applicableTo: ['seller_side', 'both'],
    transactionTypes: ['residential', 'income_property'],
    required: false,
    revisedDate: '12/24',
    description: 'Seller\'s written response to buyer\'s Request for Repair — agreeing, partially agreeing, or declining.',
  },
  {
    code: 'PEAD',
    name: 'Pest Control Disclosure and Addendum',
    category: 'inspection_repair',
    applicableTo: ['seller_side', 'both'],
    transactionTypes: ['residential', 'income_property'],
    required: 'conditional',
    revisedDate: '12/23',
    description: 'Discloses pest control (termite) inspection and clearance requirements and allocation of costs.',
    requiredWhen: 'Required when pest inspection or clearance is part of the transaction terms.',
  },
  {
    code: 'WCI',
    name: 'Wood Destroying Pest Inspection and Allocation of Cost Addendum',
    category: 'inspection_repair',
    applicableTo: ['seller_side', 'both'],
    transactionTypes: ['residential', 'income_property'],
    required: 'conditional',
    revisedDate: '12/23',
    description: 'Allocates costs for wood-destroying pest (termite) inspection and any required remediation.',
    requiredWhen: 'Required when lender requires termite clearance (common for FHA/VA loans).',
  },
];

// ─── Finance ──────────────────────────────────────────────────────────────────

const FINANCE: CarFormMetadata[] = [
  {
    code: 'PAA',
    name: 'Pre-Approval Letter Addendum',
    category: 'finance',
    applicableTo: ['buyer_side'],
    transactionTypes: ['residential', 'income_property'],
    required: false,
    revisedDate: '12/23',
    description: 'Addendum attaching buyer\'s pre-approval letter and detailing loan terms.',
  },
  {
    code: 'FVA',
    name: 'FHA/VA Financing Addendum',
    category: 'finance',
    applicableTo: ['buyer_side', 'both'],
    transactionTypes: ['residential'],
    required: 'conditional',
    revisedDate: '12/24',
    description: 'Addendum required for FHA or VA financing, including appraisal requirements and escape clauses.',
    requiredWhen: 'Required when buyer is obtaining FHA or VA financing.',
  },
  {
    code: 'ABI',
    name: 'Authorization for Bridge Loan / Interim Financing',
    category: 'finance',
    applicableTo: ['buyer_side'],
    transactionTypes: ['residential', 'income_property'],
    required: false,
    revisedDate: '12/23',
    description: 'Authorizes broker to provide financial information to lender for bridge loan or interim financing.',
  },
  {
    code: 'LQ',
    name: 'Lender Pre-Qualification Letter Request',
    category: 'finance',
    applicableTo: ['buyer_side'],
    transactionTypes: ['residential'],
    required: false,
    revisedDate: '12/23',
    description: 'Request to lender for pre-qualification or pre-approval letter.',
  },
  {
    code: 'PREQUAL',
    name: 'Lender Prequalification Letter',
    category: 'finance',
    applicableTo: ['buyer_side'],
    transactionTypes: ['residential', 'income_property'],
    required: true,
    revisedDate: '12/24',
    description: 'Lender-issued prequalification letter confirming buyer\'s financing eligibility.',
  },
  {
    code: 'POF',
    name: 'Buyer Proof of Funds',
    category: 'finance',
    applicableTo: ['buyer_side'],
    transactionTypes: ['residential', 'income_property'],
    required: true,
    revisedDate: '12/24',
    description: 'Bank statement or financial institution letter verifying buyer\'s available funds.',
  },
];

// ─── Federal Compliance ───────────────────────────────────────────────────────

const FEDERAL_COMPLIANCE: CarFormMetadata[] = [
  {
    code: 'LPD',
    name: 'Lead-Based Paint and Lead-Based Paint Hazards Disclosure, Acknowledgment and Addendum',
    category: 'federal_compliance',
    applicableTo: ['seller_side', 'both'],
    transactionTypes: ['residential', 'income_property'],
    required: 'conditional',
    revisedDate: '12/23',
    description: 'Federal disclosure of known lead-based paint and hazards. Buyer has 10-day right to inspect.',
    requiredWhen: 'Required by federal law (42 U.S.C. §4852d) for all residential properties built before January 1, 1978.',
  },
  {
    code: 'FIRPTA',
    name: 'FIRPTA Disclosure',
    category: 'federal_compliance',
    applicableTo: ['seller_side', 'both'],
    transactionTypes: ['residential', 'income_property', 'land', 'commercial'],
    required: 'conditional',
    revisedDate: '12/23',
    description: 'Foreign Investment in Real Property Tax Act — seller certifies whether they are a foreign person subject to withholding.',
    requiredWhen: 'Required for all real estate sales. Withholding required if seller is a foreign person or foreign entity.',
  },
];

// ─── Lease / Rental ───────────────────────────────────────────────────────────

const LEASE_RENTAL: CarFormMetadata[] = [
  {
    code: 'LR',
    name: 'California Residential Lease or Month-to-Month Rental Agreement',
    category: 'lease_rental',
    applicableTo: ['seller_side', 'both'],
    transactionTypes: ['income_property', 'residential'],
    required: false,
    revisedDate: '12/24',
    description: 'Standard California residential lease agreement. Used when property has existing tenants at close of escrow.',
  },
  {
    code: 'IA',
    name: 'Income and Expense Analysis',
    category: 'lease_rental',
    applicableTo: ['seller_side', 'both'],
    transactionTypes: ['income_property'],
    required: false,
    revisedDate: '12/23',
    description: 'Income and expense analysis for income-producing properties. Seller discloses rent rolls, vacancy rates, and operating expenses.',
  },
];

// ─── Commercial ───────────────────────────────────────────────────────────────

const COMMERCIAL: CarFormMetadata[] = [
  {
    code: 'CPA',
    name: 'Commercial Property Purchase Agreement',
    category: 'commercial',
    applicableTo: ['buyer_side', 'seller_side', 'both'],
    transactionTypes: ['commercial'],
    required: true,
    revisedDate: '12/24',
    description: 'Primary purchase agreement for commercial and industrial properties.',
  },
  {
    code: 'CDA',
    name: 'Commercial Disclosure Advisory',
    category: 'commercial',
    applicableTo: ['buyer_side', 'seller_side', 'both'],
    transactionTypes: ['commercial'],
    required: false,
    revisedDate: '12/23',
    description: 'Advisory on due diligence investigations specific to commercial properties.',
  },
];

// ─── New Construction ─────────────────────────────────────────────────────────

const NEW_CONSTRUCTION: CarFormMetadata[] = [
  {
    code: 'NCPA',
    name: 'New Construction Purchase Agreement and Escrow Instructions',
    category: 'new_construction',
    applicableTo: ['buyer_side', 'seller_side', 'both'],
    transactionTypes: ['new_construction'],
    required: true,
    revisedDate: '12/23',
    description: 'Purchase agreement for new construction homes. Includes construction timeline, warranty, and change order provisions.',
  },
  {
    code: 'IBA',
    name: 'Interim Occupancy Addendum',
    category: 'new_construction',
    applicableTo: ['buyer_side', 'both'],
    transactionTypes: ['new_construction'],
    required: false,
    revisedDate: '12/23',
    description: 'Allows buyer to occupy new construction before legal close of escrow (common in condo conversions).',
  },
];

// ─── Registry ─────────────────────────────────────────────────────────────────

/** Complete indexed registry of all CAR standard forms. */
export const CAR_FORMS: CarFormMetadata[] = [
  ...PURCHASE_AGREEMENTS,
  ...COUNTER_OFFERS,
  ...LISTING_AGREEMENTS,
  ...BUYER_REPRESENTATION,
  ...DISCLOSURES,
  ...ADVISORIES,
  ...ADDENDA,
  ...CONTINGENCY_PERFORMANCE,
  ...INSPECTION_REPAIR,
  ...FINANCE,
  ...FEDERAL_COMPLIANCE,
  ...LEASE_RENTAL,
  ...COMMERCIAL,
  ...NEW_CONSTRUCTION,
];

/** Look up a single form by its CAR code (case-insensitive). */
export function getCarForm(code: string): CarFormMetadata | undefined {
  return CAR_FORMS.find((f) => f.code.toUpperCase() === code.toUpperCase());
}

/**
 * System-defined default form packages for common transaction types.
 * These are used to pre-populate new form checklist templates.
 */
export const DEFAULT_FORM_PACKAGES: Record<string, { label: string; formCodes: string[] }> = {
  'ca_residential_buyer': {
    label: 'CA Residential — Buyer Side (Standard)',
    formCodes: ['BRBC', 'RPA', 'AD', 'BIA', 'BHIA', 'FHDA', 'WFA', 'CCPA', 'PRBS', 'FRR-PA',
                'TDS', 'SPQ', 'NHD', 'SBSA', 'AVID', 'CR-B', 'VP', 'CC'],
  },
  'ca_residential_seller': {
    label: 'CA Residential — Seller Side (Standard)',
    formCodes: ['RLA', 'AD', 'TDS', 'SPQ', 'NHD', 'AVID', 'SBSA', 'FHDA', 'WFA', 'CCPA',
                'WPA', 'FIRPTA', 'SCO', 'NSP', 'NBP', 'DCE', 'CC', 'VP', 'HOA'],
  },
  'ca_residential_dual': {
    label: 'CA Residential — Dual Agency (Standard)',
    formCodes: ['BRBC', 'RLA', 'RPA', 'AD', 'PRBS', 'TDS', 'SPQ', 'NHD', 'AVID', 'SBSA',
                'BIA', 'BHIA', 'FHDA', 'WFA', 'CCPA', 'FRR-PA', 'CR-B', 'VP', 'HOA',
                'WPA', 'FIRPTA', 'NBP', 'NSP', 'DCE', 'CC'],
  },
  'ca_residential_listing': {
    label: 'CA Residential — Listing Package',
    formCodes: ['RLA', 'AD', 'TDS', 'SPQ', 'NHD', 'AVID', 'SBSA', 'FHDA', 'WFA', 'CCPA',
                'WPA', 'MELLO', 'HOA', 'SEA', 'RSPA'],
  },
  'ca_residential_buyer_fha_va': {
    label: 'CA Residential — Buyer Side (FHA/VA)',
    formCodes: ['BRBC', 'RPA', 'AD', 'BIA', 'BHIA', 'FHDA', 'WFA', 'CCPA', 'PRBS',
                'TDS', 'SPQ', 'NHD', 'SBSA', 'AVID', 'FVA', 'LPD', 'WCI', 'CR-B', 'VP', 'CC'],
  },
  'ca_income_property_buyer': {
    label: 'CA Income Property — Buyer Side',
    formCodes: ['BRBC', 'RIPA', 'AD', 'BIA', 'FHDA', 'WFA', 'CCPA', 'PRBS',
                'TDS', 'SPQ', 'NHD', 'AVID', 'IA', 'CR-B', 'VP', 'CC'],
  },
  'ca_land_buyer': {
    label: 'CA Vacant Land — Buyer Side',
    formCodes: ['BRBC', 'VLPA', 'AD', 'FHDA', 'WFA', 'CCPA', 'NHD', 'SBSA', 'CR-B', 'CC'],
  },
};
