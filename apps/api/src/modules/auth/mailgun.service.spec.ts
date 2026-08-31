import { MailgunService } from './mailgun.service';

describe('MailgunService.sendEmail', () => {
  const originalEnv = { ...process.env };
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env.MAILGUN_API_KEY = 'test-key';
    process.env.MAILGUN_DOMAIN = 'txn.mytcapp.net';
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'mg-123' }),
    });
    global.fetch = fetchMock as never;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it('sends without a cc field when none is provided', async () => {
    const service = new MailgunService();
    await service.sendEmail('buyer@example.com', 'Subject', '<html></html>', 'text');

    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = new URLSearchParams(options.body);
    expect(body.has('cc')).toBe(false);
  });

  it('includes a real Cc field when a single cc address is provided', async () => {
    const service = new MailgunService();
    await service.sendEmail('buyer@example.com', 'Subject', '<html></html>', 'text', undefined, 'agent@brokerage.com');

    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = new URLSearchParams(options.body);
    expect(body.get('cc')).toBe('agent@brokerage.com');
    expect(body.get('to')).toBe('buyer@example.com');
  });

  it('joins multiple cc addresses with a comma', async () => {
    const service = new MailgunService();
    await service.sendEmail('buyer@example.com', 'Subject', '<html></html>', 'text', undefined, ['a@x.com', 'b@x.com']);

    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = new URLSearchParams(options.body);
    expect(body.get('cc')).toBe('a@x.com,b@x.com');
  });

  it('omits In-Reply-To/References headers when inReplyTo is not provided', async () => {
    const service = new MailgunService();
    await service.sendEmail('buyer@example.com', 'Subject', '<html></html>', 'text');

    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = new URLSearchParams(options.body);
    expect(body.has('h:In-Reply-To')).toBe(false);
    expect(body.has('h:References')).toBe(false);
  });

  it('sets both In-Reply-To and References to the given message id when inReplyTo is provided', async () => {
    const service = new MailgunService();
    await service.sendEmail('sam@listingco.com', 'Re: Subject', '<html></html>', 'text', undefined, undefined, 'mg-original-1');

    const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = new URLSearchParams(options.body);
    expect(body.get('h:In-Reply-To')).toBe('mg-original-1');
    expect(body.get('h:References')).toBe('mg-original-1');
  });
});
