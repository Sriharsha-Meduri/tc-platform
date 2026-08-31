import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({
  dir: './',  // points to Next.js app root (loads next.config.ts + .env.test)
});

const config: Config = {
  coverageProvider: 'v8',
  passWithNoTests: true,
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testRegex: '.*\\.spec\\.(ts|tsx)$',
  testPathIgnorePatterns: ['<rootDir>/e2e/'],
  collectCoverageFrom: [
    'src/**/*.(ts|tsx)',
    '!src/**/*.stories.(ts|tsx)',
    '!src/app/layout.tsx',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleNameMapper: {
    '^@tc/shared(.*)$': '<rootDir>/../../packages/shared/src$1',
    '^@tc/api-client(.*)$': '<rootDir>/../../packages/api-client/src$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};

export default createJestConfig(config);
