import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SendDocumentsViaDocuSignModal, { buildSelectableDocuments } from './SendDocumentsViaDocuSignModal';
import type { ChecklistItemDto, DocumentChecklistStatus, SellerAgentDocumentDocusignDto, UnmatchedDocumentDto } from '../shared/checklist.types';

function makeDocusign(overrides: Partial<SellerAgentDocumentDocusignDto> = {}): SellerAgentDocumentDocusignDto {
  return { eligible: true, recipients: { signers: [{ name: 'Bob Buyer', email: 'bob@buyer.com' }], cc: [] }, envelope: null, ...overrides };
}

function makeItem(overrides: Partial<ChecklistItemDto> = {}): ChecklistItemDto {
  return {
    formCode: 'TDS',
    formName: 'Transfer Disclosure Statement',
    category: 'disclosure',
    status: 'submitted',
    matchedDocument: { id: 'doc-1', fileName: 'tds.pdf', formType: 'TDS', uploadedAt: '2026-01-01T00:00:00.000Z' },
    uploaded: true,
    validationStatus: 'passed',
    docusign: makeDocusign(),
    ...overrides,
  };
}

function makeUnmatched(overrides: Partial<UnmatchedDocumentDto> = {}): UnmatchedDocumentDto {
  return {
    id: 'doc-9',
    fileName: 'extra.pdf',
    formType: 'BIA',
    status: 'unknown_form',
    uploadedAt: '2026-01-01T00:00:00.000Z',
    isOriginalPackage: false,
    sourceDocumentId: null,
    docusign: makeDocusign(),
    ...overrides,
  };
}

function makeChecklist(overrides: Partial<DocumentChecklistStatus> = {}): DocumentChecklistStatus {
  return {
    items: [makeItem()],
    optionalItems: [],
    unmatchedDocuments: [],
    requiredCount: 1,
    submittedCount: 1,
    allRequiredSubmitted: true,
    transactionCompleted: false,
    ...overrides,
  };
}

describe('buildSelectableDocuments', () => {
  it('flattens required items, optional items, and unmatched documents that carry a docusign field', () => {
    const docs = buildSelectableDocuments(makeChecklist({
      optionalItems: [makeItem({ formCode: 'RR', formName: 'Repair Request', matchedDocument: { id: 'doc-2', fileName: 'rr.pdf', formType: 'RR', uploadedAt: '2026-01-01T00:00:00.000Z' } })],
      unmatchedDocuments: [makeUnmatched()],
    }));
    expect(docs.map((d) => d.documentId)).toEqual(['doc-1', 'doc-2', 'doc-9']);
    expect(docs.map((d) => d.group)).toEqual(['required', 'optional', 'additional']);
  });

  it('excludes a checklist item with no matched document — nothing to send yet', () => {
    const docs = buildSelectableDocuments(makeChecklist({ items: [makeItem({ matchedDocument: null, docusign: null, status: 'required' })] }));
    expect(docs).toHaveLength(0);
  });
});

describe('SendDocumentsViaDocuSignModal', () => {
  it('preselects a document that is eligible and has never been sent', () => {
    render(<SendDocumentsViaDocuSignModal checklist={makeChecklist()} sending={false} error={null} onConfirm={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('does not preselect a document with a prior declined envelope — the Seller Agent must opt back in', () => {
    const checklist = makeChecklist({ items: [makeItem({ docusign: makeDocusign({ envelope: { envelopeId: 'env-1', status: 'declined', sentAt: '2026-01-02T00:00:00.000Z' } }) })] });
    render(<SendDocumentsViaDocuSignModal checklist={checklist} sending={false} error={null} onConfirm={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('checkbox')).toBeEnabled();
  });

  it('disables and unchecks a document with a blocking (already-sent) envelope', () => {
    const checklist = makeChecklist({ items: [makeItem({ docusign: makeDocusign({ eligible: true, envelope: { envelopeId: 'env-1', status: 'sent', sentAt: '2026-01-02T00:00:00.000Z' } }) })] });
    render(<SendDocumentsViaDocuSignModal checklist={checklist} sending={false} error={null} onConfirm={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('disables and unchecks an ineligible document, showing its ineligible reason', () => {
    const checklist = makeChecklist({ items: [makeItem({ docusign: makeDocusign({ eligible: false, ineligibleReason: 'Document has not passed every required validation check.' }) })] });
    render(<SendDocumentsViaDocuSignModal checklist={checklist} sending={false} error={null} onConfirm={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByText('Document has not passed every required validation check.')).toBeInTheDocument();
  });

  it('lets the user toggle a selectable document off and back on', async () => {
    const user = userEvent.setup();
    render(<SendDocumentsViaDocuSignModal checklist={makeChecklist()} sending={false} error={null} onConfirm={jest.fn()} onCancel={jest.fn()} />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeChecked();
    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it('calls onConfirm with exactly the selected document ids, and disables confirm when nothing is selected', async () => {
    const user = userEvent.setup();
    const onConfirm = jest.fn();
    render(<SendDocumentsViaDocuSignModal checklist={makeChecklist()} sending={false} error={null} onConfirm={onConfirm} onCancel={jest.fn()} />);
    await user.click(screen.getByRole('checkbox')); // deselect the only document
    expect(screen.getByRole('button', { name: /Send Selected via DocuSign/i })).toBeDisabled();
    await user.click(screen.getByRole('checkbox')); // reselect
    await user.click(screen.getByRole('button', { name: /Send Selected via DocuSign/i }));
    expect(onConfirm).toHaveBeenCalledWith(['doc-1']);
  });

  it('shows the form code tag and group label next to each document', () => {
    render(<SendDocumentsViaDocuSignModal checklist={makeChecklist()} sending={false} error={null} onConfirm={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByText('[TDS]')).toBeInTheDocument();
    expect(screen.getByText('Required')).toBeInTheDocument();
  });

  it('shows an error message and keeps the confirm button available to retry', () => {
    render(<SendDocumentsViaDocuSignModal checklist={makeChecklist()} sending={false} error="Something went wrong." onConfirm={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send Selected via DocuSign/i })).toBeEnabled();
  });

  it('disables Cancel and Confirm while sending', () => {
    render(<SendDocumentsViaDocuSignModal checklist={makeChecklist()} sending={true} error={null} onConfirm={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Sending…/i })).toBeDisabled();
  });

  it('calls onCancel when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const onCancel = jest.fn();
    render(<SendDocumentsViaDocuSignModal checklist={makeChecklist()} sending={false} error={null} onConfirm={jest.fn()} onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows a message when there are no documents to send', () => {
    render(<SendDocumentsViaDocuSignModal checklist={makeChecklist({ items: [] })} sending={false} error={null} onConfirm={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByText('No documents are available to send yet.')).toBeInTheDocument();
  });
});
