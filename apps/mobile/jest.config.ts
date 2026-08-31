import type { Config } from 'jest';

const config: Config = {
  preset: 'jest-expo',
  passWithNoTests: true,
  testRegex: '.*\\.spec\\.(ts|tsx)$',
  // Required: allow jest to transform these packages (they ship ESM)
  transformIgnorePatterns: [
    'node_modules/(?!(' +
      '(jest-)?react-native' +
      '|@react-native(-community)?' +
      '|expo(nent)?' +
      '|@expo(nent)?/.*' +
      '|react-navigation' +
      '|@react-navigation/.*' +
    '))',
  ],
  collectCoverageFrom: [
    'src/**/*.(ts|tsx)',
    '!src/**/*.stories.(ts|tsx)',
    '!App.tsx',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleNameMapper: {
    '^@tc/shared(.*)$': '<rootDir>/../../packages/shared/src$1',
    '^@tc/api-client(.*)$': '<rootDir>/../../packages/api-client/src$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFiles: ['@testing-library/jest-native/extend-expect'],
};

export default config;
