import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Step5Confirm, type PartyFields } from './Step5Confirm';
import type { ExtractionResult } from '../../../extraction-result.types';

function makeResult(): ExtractionResult {
  return {
    documentType: 'Residential Purchase Agreement',
    documentSubtypes: [],
    sourceLanguage: 'en',
    property: {
      streetAddress: '123 Main St', city: 'Chino', state: 'CA', postalCode: '91710',
      county: null, apn: null, mlsNumber: null, legalDescription: null,
    },
    transaction: {
      purchasePrice: 850000, earnestMoneyAmount: 17000, offerDate: '2026-05-01',
      acceptanceDate: '2026-05-03', closingDate: '2026-06-15', possessionDate: '2026-06-15',
      financingType: 'Conventional', loanAmount: 680000, occupancyType: 'Primary Residence',
    },
    parties: {
      buyers: [], sellers: [], buyerAgents: [], listingAgents: [], brokers: [],
      escrowCompanies: [], lenders: [], attorneys: [], otherParties: [],
    },
    contractTerms: {} as ExtractionResult['contractTerms'],
    formsAndDisclosures: [],
    signatures: { buyerSigned: true, sellerSigned: true, missingSignatures: [] },
    extractionWarnings: [],
    confidenceSummary: { overall: 0.95, property: 0.95, transaction: 0.95, parties: 0.95, formsAndDisclosures: 0.95 },
  } as unknown as ExtractionResult;
}

function makeFields(overrides: Partial<PartyFields> = {}): PartyFields {
  return {
    buyers: [{ name: 'John Buyer', email: 'john@buyer.com' }],
    sellers: [{ name: 'Jane Seller' }],
    buyerAgentName: 'Alice Agent', buyerAgentEmail: 'alice@brokerage.com',
    sellerAgentName: 'Dave Agent', sellerAgentEmail: 'dave@brokerage.com',
    sellerTcName: '', sellerTcEmail: '',
    ...overrides,
  };
}

function renderStep5(fields: PartyFields, onSubmit = jest.fn()) {
  render(
    <Step5Confirm
      result={makeResult()}
      fields={fields}
      onChange={jest.fn()}
      onBuyerChange={jest.fn()}
      onAddBuyer={jest.fn()}
      onRemoveBuyer={jest.fn()}
      onSellerChange={jest.fn()}
      onAddSeller={jest.fn()}
      onRemoveSeller={jest.fn()}
      onSubmit={onSubmit}
      isSubmitting={false}
      error={null}
      onBack={jest.fn()}
      transactionId="tx-1"
      compliance={null}
      onVoided={jest.fn()}
    />,
  );
  return { onSubmit };
}

describe('Step5Confirm — Seller(s) section', () => {
  it('renders seller names but no email input within the Seller(s) section', () => {
    renderStep5(makeFields({ sellers: [{ name: 'Jane Seller' }, { name: 'John Seller' }] }));

    // SectionDivider ("Seller(s)") and the StepCardBody holding the seller
    // rows are rendered as adjacent siblings, not nested — scope to the body
    // that immediately follows the "Seller(s)" divider.
    const sellerSection = screen.getByText('Seller(s)').closest('div')!.nextElementSibling as HTMLElement;

    // Seller names are still rendered as text inputs.
    const sellerNameInputs = within(sellerSection).getAllByPlaceholderText('e.g. Jane Doe');
    expect(sellerNameInputs).toHaveLength(2);
    expect((sellerNameInputs[0] as HTMLInputElement).value).toBe('Jane Seller');

    // No email address input anywhere within the Seller(s) section.
    const emailInputs = sellerSection.querySelectorAll('input[type="email"]');
    expect(emailInputs).toHaveLength(0);
  });

  it('still renders an email input for Buyers (unaffected by the seller change)', () => {
    renderStep5(makeFields());

    const buyerSection = screen.getByText('Buyer(s)').closest('div')!.nextElementSibling as HTMLElement;
    const emailInputs = buyerSection.querySelectorAll('input[type="email"]');
    expect(emailInputs.length).toBeGreaterThan(0);
  });

  it('does not require or gate submission on a seller email — clicking Submit fires onSubmit for name-only sellers', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderStep5(makeFields({ sellers: [{ name: 'Jane Seller' }] }));

    await user.click(screen.getByRole('button', { name: /Submit & Send Emails/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('marks the seller Full name field as required', () => {
    renderStep5(makeFields({ sellers: [{ name: 'Jane Seller' }] }));

    const sellerSection = screen.getByText('Seller(s)').closest('div')!.nextElementSibling as HTMLElement;
    expect(within(sellerSection).getByText('Full name')).toBeInTheDocument();
    // The FormRow required-asterisk is rendered as a sibling span next to the label.
    expect(sellerSection.textContent).toContain('Full name*');
  });

  it('does not render the Buyer Transaction Coordinator section', () => {
    renderStep5(makeFields());

    expect(screen.queryByText("Buyer's Transaction Coordinator")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('e.g. Sarah Johnson')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('sarah@tcoffice.com')).not.toBeInTheDocument();
  });

  it('still renders the Seller Transaction Coordinator section (unaffected)', () => {
    renderStep5(makeFields({ sellerTcName: 'Maria Lopez', sellerTcEmail: 'maria@sellertc.com' }));

    expect(screen.getByText("Seller's Transaction Coordinator")).toBeInTheDocument();
    const nameInput = screen.getByPlaceholderText('e.g. Maria Lopez') as HTMLInputElement;
    expect(nameInput.value).toBe('Maria Lopez');
    const emailInput = screen.getByPlaceholderText('maria@sellertc.com') as HTMLInputElement;
    expect(emailInput.value).toBe('maria@sellertc.com');
  });
});
