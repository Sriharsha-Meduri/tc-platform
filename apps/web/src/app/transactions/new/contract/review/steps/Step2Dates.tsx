'use client';

import { DollarSign } from 'lucide-react';
import { StepCard, StepCardHeader, StepCardBody, SectionDivider, Field, fmtDate } from '../review-shared';
import type { ExtractionResult } from '../../../extraction-result.types';

export function Step2Dates({ result, isAcroForm: _isAcroForm }: {
  result: ExtractionResult;
  isAcroForm: boolean;
}) {
  const transaction = result.transaction ?? { purchasePrice: null, earnestMoneyAmount: null, offerDate: null, acceptanceDate: null, closingDate: null, possessionDate: null, financingType: null, loanAmount: null, occupancyType: null };
  const property = result.property ?? { streetAddress: null, city: null, state: null, postalCode: null, county: null, apn: null, mlsNumber: null, legalDescription: null };

  return (
    <StepCard>
      <StepCardHeader
        title="Key Dates & Transaction Terms"
        description="Verify the critical dates and financial terms extracted from the contract."
      />

      {/* Property */}
      <SectionDivider title="Property" icon={DollarSign} />
      <StepCardBody className="border-b border-gray-100">
        <dl className="grid grid-cols-2 gap-x-8 gap-y-3">
          <Field label="Street Address" value={property.streetAddress} />
          <Field label="City" value={property.city} />
          <Field label="State" value={property.state} />
          <Field label="Postal Code" value={property.postalCode} />
          <Field label="County" value={property.county} />
          <Field label="APN" value={property.apn} />
          <Field label="MLS Number" value={property.mlsNumber} />
          <Field label="Legal Description" value={property.legalDescription} span />
        </dl>
      </StepCardBody>

      {/* Financial terms */}
      <SectionDivider title="Financial Terms" icon={DollarSign} />
      <StepCardBody className="border-b border-gray-100">
        <dl className="grid grid-cols-2 gap-x-8 gap-y-3">
          <Field
            label="Purchase Price"
            value={transaction.purchasePrice != null ? `$${transaction.purchasePrice.toLocaleString()}` : null}
          />
          <Field
            label="Earnest Money"
            value={transaction.earnestMoneyAmount != null ? `$${transaction.earnestMoneyAmount.toLocaleString()}` : null}
          />
          <Field
            label="Loan Amount"
            value={transaction.loanAmount != null ? `$${transaction.loanAmount.toLocaleString()}` : null}
          />
          <Field label="Financing Type" value={transaction.financingType} />
          <Field label="Occupancy Type" value={transaction.occupancyType} />
        </dl>
      </StepCardBody>

      {/* Key dates */}
      <SectionDivider title="Key Dates" icon={DollarSign} />
      <StepCardBody>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-3">
          <Field label="Offer Date"       value={fmtDate(transaction.offerDate)} />
          <Field label="Acceptance Date"  value={fmtDate(transaction.acceptanceDate)} />
          <Field label="Closing Date"     value={fmtDate(transaction.closingDate)} />
          <Field label="Possession Date"  value={fmtDate(transaction.possessionDate)} />
        </dl>
        {!transaction.acceptanceDate && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-4">
            Acceptance date not found — contingency deadlines on the next step cannot be calculated. Verify the contract and re-upload if needed.
          </p>
        )}
      </StepCardBody>
    </StepCard>
  );
}
