module.exports = {
  clearMocks: true,
  collectCoverage: true,
  coverageProvider: "v8",
  coverageReporters: [
    "json",
    "lcov",
    "cobertura",
    "text-summary",
  ],
  coverageDirectory: "frontend",
  testEnvironment: "jsdom",
  transform: {
    '^.+\\.jsx?$': 'babel-jest',
  },
};