import { uploadFiles } from './uploadLinkApi';

/** Minimal fake XMLHttpRequest — enough surface for uploadBatchRequest's usage (open/setRequestHeader/send, upload.onprogress, onload/onerror/ontimeout, status/responseText/timeout). */
class FakeXhr {
  static instances: FakeXhr[] = [];
  status = 0;
  responseText = '';
  timeout = 0;
  upload = { onprogress: null as ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  openedUrl = '';
  headers: Record<string, string> = {};
  sent = false;

  constructor() {
    FakeXhr.instances.push(this);
  }

  open(_method: string, url: string) {
    this.openedUrl = url;
  }

  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }

  send() {
    this.sent = true;
  }

  respond(status: number, body: string) {
    this.status = status;
    this.responseText = body;
    this.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 });
    this.onload?.();
  }
}

function makeFile(name: string): File {
  return new File(['content'], name, { type: 'application/pdf' });
}

describe('uploadFiles', () => {
  let originalXhr: typeof XMLHttpRequest;

  beforeEach(() => {
    FakeXhr.instances = [];
    originalXhr = global.XMLHttpRequest;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.XMLHttpRequest = FakeXhr as any;
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    global.XMLHttpRequest = originalXhr;
    jest.restoreAllMocks();
  });

  it('sets a generous client-side timeout on the request — long enough for the synchronous multi-file pipeline, comfortably under the raised proxy timeout', async () => {
    const promise = uploadFiles('tok-1', [makeFile('a.pdf')], 'idem-1', () => {});
    const xhr = FakeXhr.instances[0];
    expect(xhr.timeout).toBeGreaterThan(300_000);
    xhr.respond(200, JSON.stringify({ results: [{ fileName: 'a.pdf', status: 'success', documentId: 'doc-1' }] }));
    await promise;
  });

  it('rejects with a clear, distinct message on ontimeout — not the generic "Upload failed" string — and logs the real condition to the console', async () => {
    const promise = uploadFiles('tok-1', [makeFile('a.pdf'), makeFile('b.pdf')], 'idem-1', () => {});
    const xhr = FakeXhr.instances[0];
    xhr.ontimeout?.();

    await expect(promise).rejects.toThrow(/taking longer than expected/i);
    // eslint-disable-next-line no-console
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('timed out client-side'));
  });

  it('on a non-JSON error body (e.g. a proxy-generated plain-text 500), logs the actual response and surfaces the HTTP status instead of a bare generic message', async () => {
    const promise = uploadFiles('tok-1', [makeFile('a.pdf'), makeFile('b.pdf')], 'idem-1', () => {});
    const xhr = FakeXhr.instances[0];
    xhr.respond(500, 'Internal Server Error');

    await expect(promise).rejects.toThrow('Upload failed (HTTP 500). Please try again.');
    // eslint-disable-next-line no-console
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('non-JSON error response (HTTP 500)'),
      expect.stringContaining('Internal Server Error'),
    );
  });

  it('surfaces the server-provided message when the error response is valid JSON', async () => {
    const promise = uploadFiles('tok-1', [makeFile('a.pdf')], 'idem-1', () => {});
    const xhr = FakeXhr.instances[0];
    xhr.respond(400, JSON.stringify({ message: 'This upload link is invalid or has expired.' }));

    await expect(promise).rejects.toThrow('This upload link is invalid or has expired.');
  });

  it('reports "processing" once the upload leg reaches 100% but the server response has not arrived yet', async () => {
    const phases: string[] = [];
    const promise = uploadFiles('tok-1', [makeFile('a.pdf')], 'idem-1', () => {}, undefined, 10, (phase) => phases.push(phase));
    const xhr = FakeXhr.instances[0];
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 });
    expect(phases).toEqual(['processing']);

    xhr.respond(200, JSON.stringify({ results: [{ fileName: 'a.pdf', status: 'success', documentId: 'doc-1' }] }));
    await promise;
  });
});
