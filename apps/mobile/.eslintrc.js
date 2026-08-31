/** @type {import("eslint").Linter.Config} */
module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'react', 'react-native'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',  // removes need for React import in every file
  ],
  root: true,
  env: {
    'react-native/react-native': true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js', 'jest.config.ts'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    'react/prop-types': 'off',  // TypeScript handles prop types
  },
  settings: {
    react: { version: 'detect' },
  },
};
