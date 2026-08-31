import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Load .env, .env.local in the package dir first, then fall back to apps/api/.env.local
  // so developers don't need to duplicate API keys.
  const packageEnv = loadEnv(mode, __dirname, '');
  const apiEnv = loadEnv(mode, `${__dirname}/../../apps/api`, '');

  const merged = { ...apiEnv, ...packageEnv };

  return {
    test: {
      globals: true,
      environment: 'node',
      testTimeout: 300_000,
      env: {
        ANTHROPIC_API_KEY: merged.ANTHROPIC_API_KEY ?? '',
        GEMINI_API_KEY: merged.GEMINI_API_KEY ?? '',
        LLM_EXTRACTION_PROVIDER: merged.LLM_EXTRACTION_PROVIDER ?? '',
        LLM_REASONING_PROVIDER: merged.LLM_REASONING_PROVIDER ?? '',
      },
    },
  };
});
