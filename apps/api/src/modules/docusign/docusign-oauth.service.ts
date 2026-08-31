import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes, createHash } from 'crypto';
import { DocuSignConnectionEntity } from './entities/docusign-connection.entity';

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
}

interface UserInfoResponse {
  sub: string;
  name: string;
  email: string;
  accounts: Array<{ account_id: string; account_name: string; base_uri: string; is_default: boolean }>;
}

@Injectable()
export class DocuSignOAuthService {
  private readonly logger = new Logger(DocuSignOAuthService.name);

  constructor(
    @InjectRepository(DocuSignConnectionEntity)
    private readonly repo: Repository<DocuSignConnectionEntity>,
  ) {}

  private get integrationKey(): string {
    return process.env.DOCUSIGN_INTEGRATION_KEY ?? '';
  }

  private get clientSecret(): string {
    return process.env.DOCUSIGN_CLIENT_SECRET ?? '';
  }

  private get authServer(): string {
    return process.env.DOCUSIGN_AUTH_SERVER ?? 'account.docusign.com';
  }

  get redirectUri(): string {
    return process.env.DOCUSIGN_REDIRECT_URI ?? 'http://localhost:3001/api/integrations/docusign/callback';
  }

  private pendingVerifiers = new Map<string, string>();

  getAuthorizationUrl(accountId: string): { url: string; state: string } {
    const state = accountId;
    const scopes = encodeURIComponent('signature');
    const verifier = randomBytes(32).toString('base64url');
    this.pendingVerifiers.set(accountId, verifier);
    const challenge = createHash('sha256').update(verifier).digest('base64url');

    const url = `https://${this.authServer}/oauth/auth?` +
      `response_type=code&` +
      `scope=${scopes}&` +
      `client_id=${encodeURIComponent(this.integrationKey)}&` +
      `redirect_uri=${encodeURIComponent(this.redirectUri)}&` +
      `state=${state}&` +
      `code_challenge=${challenge}&` +
      `code_challenge_method=S256&` +
      `prompt=login`;

    return { url, state };
  }

  async handleCallback(code: string, accountId: string): Promise<DocuSignConnectionEntity> {
    const codeVerifier = this.pendingVerifiers.get(accountId);
    this.pendingVerifiers.delete(accountId);

    const tokenRes = await fetch(`https://${this.authServer}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: codeVerifier ?? '',
        client_id: this.integrationKey,
        client_secret: this.clientSecret,
      }),
    });

    if (!tokenRes.ok) {
      const txt = await tokenRes.text();
      this.logger.error(`DocuSign token exchange failed (${tokenRes.status}): ${txt}`);
      throw new UnauthorizedException(`Failed to exchange DocuSign authorization code: ${txt}`);
    }

    const tokens = (await tokenRes.json()) as TokenResponse;
    if (!tokens.refresh_token) {
      throw new UnauthorizedException('No refresh token returned from DocuSign');
    }

    const userRes = await fetch(`https://${this.authServer}/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userRes.ok) {
      throw new UnauthorizedException('Failed to fetch DocuSign user info');
    }

    const userInfo = (await userRes.json()) as UserInfoResponse;
    const acct = process.env.DOCUSIGN_ACCOUNT_ID
      ? userInfo.accounts.find((a) => a.account_id === process.env.DOCUSIGN_ACCOUNT_ID)
      : userInfo.accounts.find((a) => a.is_default) ?? userInfo.accounts[0];

    if (!acct) {
      throw new UnauthorizedException('No DocuSign account found for user');
    }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    let connection = await this.repo.findOne({ where: { accountId } });
    if (connection) {
      connection.accessToken = tokens.access_token;
      connection.refreshToken = tokens.refresh_token;
      connection.tokenExpiresAt = expiresAt;
      connection.docusignAccountName = acct.account_name;
      connection.docusignEmail = userInfo.email;
      connection.docusignAccountId = acct.account_id;
      connection.docusignBaseUri = acct.base_uri;
      connection.status = 'connected';
    } else {
      connection = this.repo.create({
        accountId,
        docusignAccountName: acct.account_name,
        docusignEmail: userInfo.email,
        docusignAccountId: acct.account_id,
        docusignBaseUri: acct.base_uri,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: expiresAt,
        connectedAt: new Date(),
        status: 'connected',
      });
    }

    await this.repo.save(connection);
    this.logger.log(`DocuSign connected for account ${accountId} — ${userInfo.email}`);
    return connection;
  }

  async getValidToken(accountId: string): Promise<{ accessToken: string; baseUri: string; docusignAccountId: string }> {
    const connection = await this.repo.findOne({ where: { accountId, status: 'connected' as any } });
    if (!connection) {
      throw new UnauthorizedException('DocuSign not connected for this account');
    }

    if (!connection.tokenExpiresAt || new Date() > new Date(connection.tokenExpiresAt.getTime() - 5 * 60 * 1000)) {
      await this.refreshToken(connection);
    }

    return {
      accessToken: connection.accessToken,
      baseUri: connection.docusignBaseUri,
      docusignAccountId: connection.docusignAccountId,
    };
  }

  private async refreshToken(connection: DocuSignConnectionEntity): Promise<void> {
    try {
      const res = await fetch(`https://${this.authServer}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: connection.refreshToken,
          client_id: this.integrationKey,
          client_secret: this.clientSecret,
        }),
      });

      if (!res.ok) {
        throw new UnauthorizedException('DocuSign token refresh failed');
      }

      const tokens = (await res.json()) as TokenResponse;
      connection.accessToken = tokens.access_token;
      if (tokens.refresh_token) connection.refreshToken = tokens.refresh_token;
      connection.tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);
      await this.repo.save(connection);
    } catch (err) {
      this.logger.error(`Token refresh error: ${(err as Error).message}`);
      throw new UnauthorizedException('DocuSign session expired. Please reconnect.');
    }
  }

  async getConnection(accountId: string): Promise<{ connected: boolean; docusignAccountName?: string; docusignEmail?: string; connectedAt?: Date | null } | null> {
    const connection = await this.repo.findOne({ where: { accountId, status: 'connected' as any } });
    if (!connection) return { connected: false };
    return {
      connected: true,
      docusignAccountName: connection.docusignAccountName,
      docusignEmail: connection.docusignEmail,
      connectedAt: connection.connectedAt,
    };
  }

  async disconnect(accountId: string): Promise<void> {
    await this.repo.update(
      { accountId, status: 'connected' as any },
      { status: 'disconnected' as any },
    );
    this.logger.log(`DocuSign disconnected for account ${accountId}`);
  }
}
