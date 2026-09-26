export default {
  testTimeout: 30000,
  projects: [
    {
      displayName: "unit",
      testMatch: ["<rootDir>/tests/unit/**/*.test.js"],
      transform: {},
      testEnvironment: "node",
      setupFiles: ["<rootDir>/tests/unit/env.js"],
    },
    {
      displayName: "integration",
      testMatch: ["<rootDir>/tests/integration/**/*.test.js"],
      transform: {},
      testEnvironment: "node",
      testTimeout: 30000,
    },
  ],
};
