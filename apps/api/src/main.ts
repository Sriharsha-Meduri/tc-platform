import './env'; // MUST be first — loads .env.{APP_ENV} before any module initialises
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { AppDataSource } from './database/data-source';
import { join } from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const hbs = require('hbs') as typeof import('hbs') & { handlebars: typeof import('handlebars') };
import { AppModule } from './app.module';
import { DocuSignOAuthService } from './modules/docusign/docusign-oauth.service';
import { API_PREFIX } from '@tc/shared';

async function bootstrap() {
  // Run pending migrations on dev startup (safe: only unapplied migrations run)
  if (process.env.APP_ENV === 'dev') {
    try {
      await AppDataSource.initialize();
      await AppDataSource.runMigrations({ transaction: 'each' });
      await AppDataSource.destroy();
    } catch (err) {
      console.error('Migration auto-run failed, continuing startup:', err);
    }
  }

  // Register Handlebars helpers
  hbs.handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Increase body parser limits for large file uploads and JSON payloads.
  // `verify` stashes the raw bytes on req.rawBody — needed by webhook guards
  // (e.g. DocuSign Connect) that HMAC-sign the exact JSON body, since that
  // signature can't be recomputed from the already-parsed/re-serialized object.
  app.use(json({ limit: '50mb', verify: (req: any, _res, buf) => { req.rawBody = buf; } }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  // Cookie parser for admin UI auth (reads tc_token from cookie)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cookieParser = require('cookie-parser');
  app.use(cookieParser());

  // REST API prefix
  app.setGlobalPrefix(API_PREFIX, {
    exclude: ['/admin(.*)', '/webhooks(.*)', '/integrations(.*)', '/api/integrations(.*)'],
  });

  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  // Handlebars template engine for admin UI
  app.useStaticAssets(join(__dirname, '..', 'public'));
  app.setBaseViewsDir(join(__dirname, '..', 'views'));
  app.setViewEngine('hbs');

  // CORS for web + mobile clients
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3001'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');

  // Raw callback handler for DocuSign OAuth — bypasses NestJS auth pipeline
  const oauthService = app.get(DocuSignOAuthService);
  app.getHttpAdapter().get('/api/integrations/docusign/callback', (req: any, res: any) => {
    const { code, state } = req.query;
    console.log('[DocuSign Callback] code present:', !!code, 'state:', state);
    oauthService.handleCallback(code, state)
      .then(() => {
        res.send(`<!DOCTYPE html><html><body><script>window.opener.postMessage('docusign_connected','*');window.close();</script><p>DocuSign connected.</p></body></html>`);
      })
      .catch((err: Error) => {
        console.error('[DocuSign Callback] error:', err.message);
        res.status(500).send(`Connection failed: ${err.message}`);
      });
  });
  app.getHttpAdapter().get('/integrations/docusign/callback', (req: any, res: any) => {
    const { code, state } = req.query;
    console.log('[DocuSign Callback] code present:', !!code, 'state:', state);
    oauthService.handleCallback(code, state)
      .then(() => {
        res.send(`<!DOCTYPE html><html><body><script>window.opener.postMessage('docusign_connected','*');window.close();</script><p>DocuSign connected.</p></body></html>`);
      })
      .catch((err: Error) => {
        console.error('[DocuSign Callback] error:', err.message);
        res.status(500).send(`Connection failed: ${err.message}`);
      });
  });
  console.log(`API running on http://localhost:${port}`);
  console.log(`Admin UI: http://localhost:${port}/admin`);
  console.log(`GraphQL: http://localhost:${port}/graphql`);
}

bootstrap();
