export interface SeedPropertyDto {
  addressLine1: string;
  city: string;
  state: string;
  postalCode?: string;
  county?: string;
  contractPrice?: number;
  earnestMoney?: number;
}

export interface SeedContractDto {
  acceptanceDate: string;           // ISO date string, e.g. "2026-04-15"
  closingDate: string;              // ISO date string, e.g. "2026-06-01"
  disclosuresDueDays?: number;      // days from acceptance
  inspectionContingencyDays?: number;
  appraisalContingencyDays?: number;
  loanContingencyDays?: number;
}

export interface SeedTransactionDto {
  type?: string;   // 'purchase' | 'sale' | 'lease'  (default: 'purchase')
  side?: string;   // 'buyer' | 'seller' | 'dual'     (default: 'buyer')
  property: SeedPropertyDto;
}

export interface SeedPartyDto {
  role: string;      // PartyRole value
  displayName: string;
  email: string;
  phone?: string;
}

export interface SeedTransactionPayload {
  transaction: SeedTransactionDto;
  contract: SeedContractDto;
  parties?: SeedPartyDto[];
  /**
   * CAR form codes to associate with the transaction (e.g. ["RPA", "TDS", "NHD"]).
   * Stored for future use — not yet processed by the seed service.
   */
  forms?: string[];
}

export interface SeedTransactionResult {
  transactionId: string;
  transactionNumber: string;
  status: string;
  nextStep: string;
}
