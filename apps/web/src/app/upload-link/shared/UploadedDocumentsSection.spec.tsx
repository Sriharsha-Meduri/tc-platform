import { render, screen } from '@testing-library/react';
import UploadedDocumentsSection from './UploadedDocumentsSection';
import type { UploadedDocument } from './uploadLinkTypes';

function makeDoc(overrides: Partial<UploadedDocument> = {}): UploadedDocument {
  return {
    id: 'doc-1',
    fileName: 'tds.pdf',
    formType: 'TDS',
    recipientRole: 'buyer_agent',
    uploadedAt: '2026-01-01T00:00:00.000Z',
    fileSizeBytes: 2048,
    status: 'saved',
    category: 'general',
    viewUrl: '/api/v1/upload-links/token/tok-1/documents/doc-1/file',
    uploadedByType: 'BUYER_AGENT',
    isOriginalPackage: false,
    sourceDocumentId: null,
    ...overrides,
  };
}

describe('UploadedDocumentsSection', () => {
  it('shows "Saved" for a document whose analysis completed normally', () => {
    render(<UploadedDocumentsSection documents={[makeDoc({ status: 'saved' })]} />);
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('also shows "Saved" — not the generic "Uploaded" — for a document stored via the raw "uploaded" fallback status', () => {
    render(<UploadedDocumentsSection documents={[makeDoc({ status: 'uploaded' })]} />);
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.queryByText('Uploaded')).not.toBeInTheDocument();
  });

  it('keeps "Analyzing" and "Analysis Failed" as their own distinct, non-"Saved" states', () => {
    render(
      <UploadedDocumentsSection
        documents={[
          makeDoc({ id: 'doc-2', status: 'analyzing', formType: null }),
          makeDoc({ id: 'doc-3', status: 'analysis_failed', formType: null, message: 'Document uploaded successfully, but the form type could not be identified.' }),
        ]}
      />,
    );
    expect(screen.getByText('Analyzing')).toBeInTheDocument();
    expect(screen.getByText('Analysis Failed')).toBeInTheDocument();
    expect(screen.queryAllByText('Saved')).toHaveLength(0);
  });

  it('shows a form code tag for a document Document Intelligence identified', () => {
    render(<UploadedDocumentsSection documents={[makeDoc({ formType: 'RPA' })]} />);
    expect(screen.getByText('RPA')).toBeInTheDocument();
    expect(screen.queryByText('Original')).not.toBeInTheDocument();
  });

  it('shows an "Original" tag driven by isOriginalPackage metadata, not the filename', () => {
    render(<UploadedDocumentsSection documents={[makeDoc({ fileName: 'random-name.pdf', formType: null, isOriginalPackage: true })]} />);
    expect(screen.getByText('Original')).toBeInTheDocument();
    expect(screen.queryByText('RPA')).not.toBeInTheDocument();
  });

  it('shows both tags together for a document that is both identified and the original upload', () => {
    render(<UploadedDocumentsSection documents={[makeDoc({ formType: 'TDS', isOriginalPackage: true })]} />);
    expect(screen.getByText('TDS')).toBeInTheDocument();
    expect(screen.getByText('Original')).toBeInTheDocument();
  });

  it('shows neither tag for a split-out document with no form code and no original flag', () => {
    render(<UploadedDocumentsSection documents={[makeDoc({ formType: null, isOriginalPackage: false })]} />);
    expect(screen.queryByText('Original')).not.toBeInTheDocument();
  });
});
