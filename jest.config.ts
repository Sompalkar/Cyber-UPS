export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 10000,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/index.ts',
    '!src/cli.ts',
  ],
};
