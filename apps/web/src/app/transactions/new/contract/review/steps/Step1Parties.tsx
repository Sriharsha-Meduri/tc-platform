'use client';

import { Users } from 'lucide-react';
import { StepCard, StepCardHeader, StepCardBody, SectionDivider, PartyGroup, SignaturePill } from '../review-shared';
import type { ExtractionResult } from '../../../extraction-result.types';

export function Step1Parties({ result, isAcroForm }: {
  result: ExtractionResult;
  isAcroForm: boolean;
}) {
  const rawParties = result.parties ?? {};
  const parties = {
    buyers: rawParties.buyers ?? [],
    sellers: rawParties.sellers ?? [],
    buyerAgents: rawParties.buyerAgents ?? [],
    listingAgents: rawParties.listingAgents ?? [],
    brokers: rawParties.brokers ?? [],
    escrowCompanies: rawParties.escrowCompanies ?? [],
    lenders: rawParties.lenders ?? [],
    attorneys: rawParties.attorneys ?? [],
    otherParties: rawParties.otherParties ?? [],
  };
  const signatures = result.signatures ?? { buyerSigned: false, sellerSigned: false, signedParties: [], missingSignatures: [] };

  return (
    <StepCard>
      <StepCardHeader
        title="Parties"
        description="Review all parties extracted from the contract. Names and contact details will be used for email communication."
      />

      {/* Signatures */}
      <StepCardBody className="border-b border-gray-100">
        <div className="flex gap-3 flex-wrap">
          <SignaturePill label="Buyer signed" signed={signatures.buyerSigned} />
          <SignaturePill label="Seller signed" signed={signatures.sellerSigned} />
          {(signatures.missingSignatures?.length ?? 0) > 0 && (
            <span className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-full px-3 py-1">
              Missing: {signatures.missingSignatures.join(', ')}
            </span>
          )}
        </div>
      </StepCardBody>

      {/* Buyers */}
      {parties.buyers.length > 0 && (
        <>
          <SectionDivider title="Buyers" icon={Users} />
          <StepCardBody className="border-b border-gray-100">
            <PartyGroup label="" people={parties.buyers} showConfidence={!isAcroForm} />
          </StepCardBody>
        </>
      )}

      {/* Sellers */}
      {parties.sellers.length > 0 && (
        <>
          <SectionDivider title="Sellers" icon={Users} />
          <StepCardBody className="border-b border-gray-100">
            <PartyGroup label="" people={parties.sellers} showConfidence={!isAcroForm} />
          </StepCardBody>
        </>
      )}

      {/* Agents */}
      {(parties.buyerAgents.length > 0 || parties.listingAgents.length > 0) && (
        <>
          <SectionDivider title="Agents" icon={Users} />
          <StepCardBody className="border-b border-gray-100 space-y-4">
            <PartyGroup label="Buyer Agents" people={parties.buyerAgents} showConfidence={!isAcroForm} />
            <PartyGroup label="Listing Agents" people={parties.listingAgents} showConfidence={!isAcroForm} />
          </StepCardBody>
        </>
      )}

      {/* Other parties */}
      {(parties.escrowCompanies.length > 0 || parties.lenders.length > 0 || parties.brokers.length > 0 || parties.attorneys.length > 0 || parties.otherParties.length > 0) && (
        <>
          <SectionDivider title="Other Parties" icon={Users} />
          <StepCardBody className="space-y-4">
            <PartyGroup label="Escrow" people={parties.escrowCompanies} showConfidence={!isAcroForm} />
            <PartyGroup label="Lenders" people={parties.lenders} showConfidence={!isAcroForm} />
            <PartyGroup label="Brokers" people={parties.brokers} showConfidence={!isAcroForm} />
            <PartyGroup label="Attorneys" people={parties.attorneys} showConfidence={!isAcroForm} />
            <PartyGroup label="Other" people={parties.otherParties} showConfidence={!isAcroForm} />
          </StepCardBody>
        </>
      )}
    </StepCard>
  );
}
