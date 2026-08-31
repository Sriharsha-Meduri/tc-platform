import { render, screen, fireEvent, act } from '@testing-library/react';
import UploadDropzoneCard from './UploadDropzoneCard';
import { uploadFiles } from './uploadLinkApi';
import type { FileUploadResult } from './uploadLinkTypes';

jest.mock('./uploadLinkApi', () => ({ uploadFiles: jest.fn() }));

const mockedUploadFiles = uploadFiles as jest.MockedFunction<typeof uploadFiles>;

function makeFile(name: string): File {
  return new File(['content'], name, { type: 'application/pdf' });
}

function selectFiles(files: File[]) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files } });
}

describe('UploadDropzoneCard — multi-file per-file status', () => {
  beforeEach(() => {
    mockedUploadFiles.mockReset();
    if (!crypto.randomUUID) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (crypto as any).randomUUID = () => 'test-uuid';
    }
  });

  it('shows an Uploading badge per file immediately, then Completed once the batch resolves — for two valid PDFs uploaded simultaneously', async () => {
    let resolveUpload!: (v: { results: FileUploadResult[] }) => void;
    mockedUploadFiles.mockReturnValue(new Promise((resolve) => { resolveUpload = resolve; }));

    render(<UploadDropzoneCard token="tok-1" title="Upload" recipientName="Alice" propertyAddress="123 Main St" onUploaded={jest.fn()} />);
    selectFiles([makeFile('one.pdf'), makeFile('two.pdf')]);
    fireEvent.click(screen.getByRole('button', { name: /Upload 2 Files/i }));

    expect(screen.getAllByText('Uploading')).toHaveLength(2);

    await act(async () => {
      resolveUpload({
        results: [
          { fileName: 'one.pdf', status: 'success', documentId: 'doc-1' },
          { fileName: 'two.pdf', status: 'success', documentId: 'doc-2' },
        ],
      });
    });

    expect(screen.getAllByText('Completed')).toHaveLength(2);
    expect(screen.queryByText('Uploading')).not.toBeInTheDocument();
  });

  it('transitions a file to Processing once its upload leg reaches 100% but the server has not responded yet', async () => {
    let onBatchPhase!: (phase: 'uploading' | 'processing', filesInBatch: File[]) => void;
    let file1!: File;
    let file2!: File;
    mockedUploadFiles.mockImplementation((_token, files, _key, _onProgress, _cat, _max, phaseCb) => {
      [file1, file2] = files;
      onBatchPhase = phaseCb!;
      return new Promise(() => {}); // never resolves — we only care about the mid-flight state
    });

    render(<UploadDropzoneCard token="tok-1" title="Upload" recipientName="Alice" propertyAddress="123 Main St" onUploaded={jest.fn()} />);
    selectFiles([makeFile('one.pdf'), makeFile('two.pdf')]);
    fireEvent.click(screen.getByRole('button', { name: /Upload 2 Files/i }));

    act(() => {
      onBatchPhase('processing', [file1, file2]);
    });

    expect(screen.getAllByText('Processing')).toHaveLength(2);
  });

  it('one successful file and one failed file in the same upload — each keeps its own distinct status, the failure never flips the successful file', async () => {
    mockedUploadFiles.mockResolvedValue({
      results: [
        { fileName: 'good.pdf', status: 'success', documentId: 'doc-1' },
        { fileName: 'corrupt.pdf', status: 'failed', error: 'Unable to read PDF structure' },
      ],
    });

    render(<UploadDropzoneCard token="tok-1" title="Upload" recipientName="Alice" propertyAddress="123 Main St" onUploaded={jest.fn()} />);
    selectFiles([makeFile('good.pdf'), makeFile('corrupt.pdf')]);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Upload 2 Files/i }));
    });

    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Unable to read PDF structure')).toBeInTheDocument();
  });

  it('when the whole request fails (e.g. a proxy timeout), every in-flight file is marked Failed and the real error message is shown, not silently dropped', async () => {
    mockedUploadFiles.mockRejectedValue(new Error('This is taking longer than expected. Your files may still be processing on the server — refresh the page in a moment to check before retrying.'));

    render(<UploadDropzoneCard token="tok-1" title="Upload" recipientName="Alice" propertyAddress="123 Main St" onUploaded={jest.fn()} />);
    selectFiles([makeFile('one.pdf'), makeFile('two.pdf')]);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Upload 2 Files/i }));
    });

    expect(screen.getAllByText('Failed')).toHaveLength(2);
    expect(screen.getByText(/taking longer than expected/i)).toBeInTheDocument();
  });

  it('shows a "{formCode} — Re-upload Required" heading with each location-prefixed blocker when a rejected file carries a detected form code', async () => {
    mockedUploadFiles.mockResolvedValue({
      results: [{
        fileName: 'rpa-unsigned.pdf', status: 'failed', error: 'Document failed validation and was not saved.',
        validationFailures: ['Page 6 — Buyer initials are missing.'], formCode: 'RPA',
      }],
    });

    render(<UploadDropzoneCard token="tok-1" title="Upload" recipientName="Alice" propertyAddress="123 Main St" onUploaded={jest.fn()} />);
    selectFiles([makeFile('rpa-unsigned.pdf')]);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Upload 1 File/i }));
    });

    expect(screen.getByText('RPA — Re-upload Required')).toBeInTheDocument();
    expect(screen.getByText('Page 6 — Buyer initials are missing.')).toBeInTheDocument();
  });

  it('falls back to the generic "Failed validation" heading when no form code was identified', async () => {
    mockedUploadFiles.mockResolvedValue({
      results: [{
        fileName: 'unknown.pdf', status: 'failed', error: 'Document failed validation and was not saved.',
        validationFailures: ['Some blocker.'], formCode: null,
      }],
    });

    render(<UploadDropzoneCard token="tok-1" title="Upload" recipientName="Alice" propertyAddress="123 Main St" onUploaded={jest.fn()} />);
    selectFiles([makeFile('unknown.pdf')]);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Upload 1 File/i }));
    });

    expect(screen.getByText('Failed validation — this document was not saved:')).toBeInTheDocument();
  });
});
