/**
 * Loads the correct .env file before any NestJS module or TypeORM config runs.
 *
 * APP_ENV controls which file is loaded:
 *   local       → .env.local       Docker dev DB  (default)
 *   dev         → .env.dev         Neon dev DB
 *   production  → .env.production  Neon prod DB
 *
 * dotenv never overrides variables already set in the process, so
 * Fly.io secrets always win over values in .env files.
 *
 * IMPORTANT: this file must be the very first import in main.ts and
 * data-source.ts so it runs before any module-level code reads process.env.
 */
import { config } from 'dotenv';
import { resolve } from 'path';

const appEnv = process.env.APP_ENV ?? 'local';
const envFile = resolve(process.cwd(), `.env.${appEnv}`);

config({ path: envFile });
