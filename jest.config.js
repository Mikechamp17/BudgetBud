/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testPathIgnorePatterns: ['/node_modules/', '/supabase/'],
  moduleNameMapper: {
    '\\.css$': '<rootDir>/jest.style-mock.js',
  },
};
