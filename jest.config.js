/** @type {import('jest').Config} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['<rootDir>/test/**/*.test.ts'],
    testPathIgnorePatterns: ['/node_modules/', '/dist/'],
    testTimeout: 30000,
};
