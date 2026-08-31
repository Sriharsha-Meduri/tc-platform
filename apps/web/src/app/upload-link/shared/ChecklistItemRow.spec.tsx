import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChecklistItemRow, { UnmatchedDocumentRow } from './ChecklistItemRow';
import type { ChecklistItemDto, UnmatchedDocumentDto, SellerAgentDocumentDocusignDto } from './checklist.types';

function makeDocusign(overrides: Partial<SellerAgentDocumentDocusignDto> = {}): SellerAgentDocumentDocusignDto {
  return {
    eligible: true,
    recipients: { signers: [{ name: 'Bob Buyer', email: 'bob@buyer.com' }], cc: [{ name: 'Alice Agent', email: 'alice@brokerage.com' }] },
    envelope: null,
    ...overrides,
  };
}

function makeItem(overrides: Partial<ChecklistItemDto> = {}): ChecklistItemDto {
  return {
    formCode: 'TDS',
    formName: 'Transfer Disclosure Statement',
    category: 'disclosure',
    status: 'submitted',
    matchedDocument: { id: 'doc-1', fileName: 'tds.pdf', formType: 'TDS', uploadedAt: '2026-01-01T00:00:00.000Z' },
    uploaded: true,
    validationStatus: null,
    ...overrides,
  };
}

describe('ChecklistItemRow', () => {
  it('shows the item\'s expected form code as a "[CODE]" tag when no document has been matched yet', () => {
    render(<ChecklistItemRow item={makeItem({ formCode: 'AVID', status: 'required', matchedDocument: null, uploaded: false })} />);
    expect(screen.getByText('[AVID]')).toBeInTheDocument();
  });

  it('shows the matched document\'s own identified form code once a document is submitted', () => {
    render(<ChecklistItemRow item={makeItem({ formCode: 'TDS', matchedDocument: { id: 'doc-1', fileName: 'tds.pdf', formType: 'TDS', uploadedAt: '2026-01-01T00:00:00.000Z' } })} />);
    expect(screen.getByText('[TDS]')).toBeInTheDocument();
  });

  it('shows the requirementNote for a dynamically-added AVID item while it is missing', () => {
    render(<ChecklistItemRow item={makeItem({
      formCode: 'AVID', status: 'required', matchedDocument: null, uploaded: false,
      requirementNote: 'TDS Section III: AVID is selected, but an Agent Visual Inspection Disclosure (AVID) was not provided.',
    })} />);
    expect(screen.getByText('TDS Section III: AVID is selected, but an Agent Visual Inspection Disclosure (AVID) was not provided.')).toBeInTheDocument();
  });

  it('does not show the requirementNote once the item is submitted', () => {
    render(<ChecklistItemRow item={makeItem({
      formCode: 'AVID', status: 'submitted',
      requirementNote: 'TDS Section III: AVID is selected, but an Agent Visual Inspection Disclosure (AVID) was not provided.',
    })} />);
    expect(screen.queryByText(/AVID is selected/)).not.toBeInTheDocument();
  });

  it('never renders any Send/Resend via DocuSign button — sending is centralized in the checklist sidebar\'s single action, not per row', () => {
    const docusign = makeDocusign({
      eligible: true,
      envelope: { envelopeId: 'env-1', status: 'declined', sentAt: '2026-01-02T00:00:00.000Z' },
    });
    render(<ChecklistItemRow item={makeItem({ docusign })} />);
    expect(screen.queryByRole('button', { name: /Send via DocuSign/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Resend via DocuSign/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Send All Documents via DocuSign/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Send Documents to Buyer via DocuSign/i)).not.toBeInTheDocument();
  });

  it('shows the envelope status as a passive badge once one exists, with no button', () => {
    const docusign = makeDocusign({ eligible: true, envelope: { envelopeId: 'env-1', status: 'sent', sentAt: '2026-01-02T00:00:00.000Z' } });
    render(<ChecklistItemRow item={makeItem({ docusign })} />);
    expect(screen.getByText('Sent')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /DocuSign/i })).not.toBeInTheDocument();
  });

  it('shows no DocuSign status at all when the document has no envelope yet, even if eligible', () => {
    render(<ChecklistItemRow item={makeItem({ docusign: makeDocusign({ eligible: true, envelope: null }) })} />);
    expect(screen.queryByText(/Sent|Declined|Voided|Completed|Delivered|Created/)).not.toBeInTheDocument();
  });

  it('shows "Reupload Required" instead of any DocuSign status for an invalid document', () => {
    render(
      <ChecklistItemRow
        item={makeItem({ status: 'reupload_required', matchedDocument: null, docusign: null, lastRejectionReasons: ['Missing seller signature'] })}
      />,
    );
    expect(screen.getByText('Reupload Required')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /DocuSign/i })).not.toBeInTheDocument();
  });

  it('expanding the row shows validation checks with correct Passed/Failed/Not Applicable labels', async () => {
    const user = userEvent.setup();
    render(
      <ChecklistItemRow
        item={makeItem({
          validation: {
            checks: [
              { id: 'type', label: 'Document type identified', status: 'passed' },
              { id: 'addr', label: 'Property address matches', status: 'failed', severity: 'error', detail: 'Address mismatch' },
              { id: 'initials', label: 'Initials present', status: 'not_applicable' },
            ],
          },
        })}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Show validation details/i }));
    expect(screen.getByText('Document type identified')).toBeInTheDocument();
    expect(screen.getByText('Passed', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Failed', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Not Applicable', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Address mismatch')).toBeInTheDocument();
  });

  it('expanding a reupload_required row shows the rejection reasons instead of a check list', async () => {
    const user = userEvent.setup();
    render(
      <ChecklistItemRow
        item={makeItem({ status: 'reupload_required', matchedDocument: null, lastRejectionReasons: ['Missing seller signature', 'Property address mismatch'] })}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Show validation details/i }));
    expect(screen.getByText('What needs to be corrected:')).toBeInTheDocument();
    expect(screen.getByText('Missing seller signature')).toBeInTheDocument();
    expect(screen.getByText('Property address mismatch')).toBeInTheDocument();
  });

  it('shows the envelope status badge for a terminal-negative (declined) envelope — with no button, resending happens via the centralized modal', () => {
    const docusign = makeDocusign({ eligible: false, envelope: { envelopeId: 'env-1', status: 'declined', sentAt: '2026-01-02T00:00:00.000Z' } });
    render(<ChecklistItemRow item={makeItem({ docusign })} />);
    expect(screen.getByText('Declined')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /DocuSign/i })).not.toBeInTheDocument();
  });

  it('does not show an expand chevron when there is nothing expandable', () => {
    render(<ChecklistItemRow item={makeItem({ validation: null, lastRejectionReasons: null })} />);
    expect(screen.queryByRole('button', { name: /Show validation details/i })).not.toBeInTheDocument();
  });

  it('still shows the expand chevron — but no general Compliant/Needs Review label — when every check passed, so the full passed breakdown stays available', () => {
    render(
      <ChecklistItemRow
        item={makeItem({
          validation: { checks: [{ id: 'type', label: 'Document type identified', status: 'passed' }, { id: 'sig', label: 'Signature present', status: 'not_applicable' }] },
        })}
      />,
    );
    expect(screen.getByRole('button', { name: /Show validation details/i })).toBeInTheDocument();
    expect(screen.queryByText('Compliant')).not.toBeInTheDocument();
    expect(screen.queryByText('Needs Review')).not.toBeInTheDocument();
  });

  it('shows the page/location hint alongside a check when the underlying validation recorded one', async () => {
    const user = userEvent.setup();
    render(
      <ChecklistItemRow
        item={makeItem({
          validation: {
            checks: [
              { id: 'buyer_sig', label: 'Broker signature missing', status: 'failed', severity: 'error', location: 'Page 2' },
            ],
          },
        })}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Show validation details/i }));
    expect(screen.getByText('Page 2')).toBeInTheDocument();
  });

  it('does not duplicate the page/location hint when it is already embedded in the check label', async () => {
    const user = userEvent.setup();
    render(
      <ChecklistItemRow
        item={makeItem({
          validation: {
            checks: [
              { id: 'buyer_sig', label: "Buyer's Signature (Page 1) — present", status: 'passed', location: 'Page 1' },
            ],
          },
        })}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Show validation details/i }));
    expect(screen.getAllByText(/Page 1/)).toHaveLength(1); // only inside the label itself, not a separate line
  });

  it('still shows the expand chevron for an overridden check even with no active failures', () => {
    render(
      <ChecklistItemRow
        item={makeItem({
          validation: { checks: [{ id: 'type', label: 'Document type identified', status: 'passed' }, { id: 'sig', label: 'Signature present', status: 'overridden', severity: 'warning', detail: 'Accepted by TC override' }] },
        })}
      />,
    );
    expect(screen.getByRole('button', { name: /Show validation details/i })).toBeInTheDocument();
  });
});

describe('UnmatchedDocumentRow', () => {
  function makeDoc(overrides: Partial<UnmatchedDocumentDto> = {}): UnmatchedDocumentDto {
    return {
      id: 'doc-9',
      fileName: 'extra.pdf',
      formType: null,
      status: 'needs_review',
      uploadedAt: '2026-01-01T00:00:00.000Z',
      isOriginalPackage: false,
      sourceDocumentId: null,
      ...overrides,
    };
  }

  it('never renders any Send/Resend via DocuSign button — sending is centralized in the checklist sidebar\'s single action', () => {
    render(<UnmatchedDocumentRow doc={makeDoc({ docusign: makeDocusign() })} />);
    expect(screen.queryByRole('button', { name: /DocuSign/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Send All Documents via DocuSign/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Send Documents to Buyer via DocuSign/i)).not.toBeInTheDocument();
  });

  it('shows the envelope status as a passive badge once one exists', () => {
    const docusign = makeDocusign({ eligible: true, envelope: { envelopeId: 'env-1', status: 'sent', sentAt: '2026-01-02T00:00:00.000Z' } });
    render(<UnmatchedDocumentRow doc={makeDoc({ docusign })} />);
    expect(screen.getByText('Sent')).toBeInTheDocument();
  });

  it('shows validation checks for this document only when expanded', async () => {
    const user = userEvent.setup();
    render(
      <UnmatchedDocumentRow
        doc={makeDoc({ validation: { checks: [{ id: 'type', label: 'Document type identified', status: 'failed' }] } })}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Show validation details/i }));
    expect(within(screen.getByText('Document type identified').closest('div')!.parentElement!).getByText('Failed', { exact: false })).toBeInTheDocument();
  });

  it('badges a combined-PDF original as "Original" instead of an unrecognized-form status', () => {
    render(<UnmatchedDocumentRow doc={makeDoc({ isOriginalPackage: true, status: 'original', formType: null })} />);
    expect(screen.getByText('Original')).toBeInTheDocument();
    expect(screen.queryByText('Needs Review')).not.toBeInTheDocument();
  });

  it('does not badge a normal (non-split) unmatched document as "Original" — and never shows "Needs Review", since an unidentified form is not a compliance verdict', () => {
    render(<UnmatchedDocumentRow doc={makeDoc({ isOriginalPackage: false, status: 'needs_review' })} />);
    expect(screen.queryByText('Original')).not.toBeInTheDocument();
    expect(screen.queryByText('Needs Review')).not.toBeInTheDocument();
    expect(screen.getByText('Uploaded')).toBeInTheDocument();
  });

  it('still shows the expand chevron for an unmatched document whose checks all passed, so the full passed breakdown stays available', async () => {
    const user = userEvent.setup();
    render(
      <UnmatchedDocumentRow
        doc={makeDoc({ validation: { checks: [{ id: 'type', label: 'Document type identified', status: 'passed' }] } })}
      />,
    );
    const toggle = screen.getByRole('button', { name: /Show validation details/i });
    expect(toggle).toBeInTheDocument();
    await user.click(toggle);
    expect(screen.getByText('Validation Details')).toBeInTheDocument();
    expect(screen.getByText('Document type identified')).toBeInTheDocument();
  });

  it('does not show an expand chevron when the document has no checks at all', () => {
    render(<UnmatchedDocumentRow doc={makeDoc({ validation: null })} />);
    expect(screen.queryByRole('button', { name: /Show validation details/i })).not.toBeInTheDocument();
  });

  it('shows a green check icon when every applicable check passed', () => {
    const { container } = render(
      <UnmatchedDocumentRow
        doc={makeDoc({ validation: { checks: [{ id: 'sig', label: 'Seller signature present', status: 'passed' }, { id: 'date', label: 'Seller date present', status: 'passed' }] } })}
      />,
    );
    expect(container.querySelector('.text-green-600')).toBeInTheDocument();
    expect(container.querySelector('.text-red-500')).not.toBeInTheDocument();
  });

  it('shows a red X icon when at least one check failed, even if others passed', () => {
    const { container } = render(
      <UnmatchedDocumentRow
        doc={makeDoc({ validation: { checks: [{ id: 'sig', label: 'Seller signature present', status: 'passed' }, { id: 'explain', label: 'Yes-answer explanations complete', status: 'failed', severity: 'error' }] } })}
      />,
    );
    expect(container.querySelector('.text-red-500')).toBeInTheDocument();
  });

  it('shows the plain file icon (never the red X) when there are no applicable validators — a document with no checks is never shown as failed', () => {
    const { container } = render(<UnmatchedDocumentRow doc={makeDoc({ validation: null })} />);
    expect(container.querySelector('.text-red-500')).not.toBeInTheDocument();
    expect(container.querySelector('.text-green-600')).not.toBeInTheDocument();
  });

  it('shows the validation code alongside a check when the underlying check carries one', async () => {
    const user = userEvent.setup();
    render(
      <UnmatchedDocumentRow
        doc={makeDoc({ validation: { checks: [{ id: 'spq_yes_explanations', label: 'Yes-answer explanations complete', status: 'failed', severity: 'error', location: 'Page 2', detail: 'Missing explanation for 7D' }] } })}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Show validation details/i }));
    expect(screen.getByText('Page 2')).toBeInTheDocument();
    expect(screen.getByText('Missing explanation for 7D')).toBeInTheDocument();
    expect(screen.getByText(/spq_yes_explanations/)).toBeInTheDocument();
  });

  it('shows the persisted form code instead of "Unknown Form" when the document has already been identified', () => {
    render(<UnmatchedDocumentRow doc={makeDoc({ status: 'unknown_form', formType: 'BIA' })} />);
    expect(screen.getByText('BIA')).toBeInTheDocument();
    expect(screen.queryByText('Unknown Form')).not.toBeInTheDocument();
  });

  it('still shows "Unknown Form" when the document genuinely has no detected form code', () => {
    render(<UnmatchedDocumentRow doc={makeDoc({ status: 'unknown_form', formType: null })} />);
    expect(screen.getByText('Unknown Form')).toBeInTheDocument();
  });

  it('shows the form code instead of the generic "Uploaded" label whenever Document Intelligence identified one, regardless of the underlying status', () => {
    render(<UnmatchedDocumentRow doc={makeDoc({ status: 'uploaded', formType: 'BCO' })} />);
    expect(screen.getByText('BCO')).toBeInTheDocument();
    expect(screen.queryByText('Uploaded')).not.toBeInTheDocument();
  });

  it('falls back to "Uploaded" only when Document Intelligence genuinely returned no form code', () => {
    render(<UnmatchedDocumentRow doc={makeDoc({ status: 'uploaded', formType: null })} />);
    expect(screen.getByText('Uploaded')).toBeInTheDocument();
  });
});
