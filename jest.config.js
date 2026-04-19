// Force UTC so all date-fns setHours / getDay calls are timezone-deterministic.
// Without this, tests written with UTC expectations fail in BST or any other
// non-UTC locale because setHours() operates in the process's local timezone.
process.env.TZ = 'UTC';

module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
  testPathIgnorePatterns: ['/node_modules/', '/.expo/', '/app-example/'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  collectCoverageFrom: [
    'src/utils/**/*.ts',
    'src/services/**/*.ts',
    'src/stores/**/*.ts',
    '!src/**/*.d.ts',
  ],
  globals: {
    __DEV__: true,
  },
};
