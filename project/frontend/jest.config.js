/* eslint-env node */

// For a detailed explanation regarding each configuration property, visit:
// https://jestjs.io/docs/en/configuration.html

module.exports = {
  // Automatically clear mock calls and instances between every test
  clearMocks: true,
  transform: {
    "^.+\\.(js|jsx|ts|tsx)$": [
      "babel-jest",
      {
        presets: [
          ["@babel/preset-env", { targets: { node: "current" } }],
          "@babel/preset-typescript",
          ["@babel/preset-react", { runtime: "automatic" }],
        ],
      },
    ],
  },

  // Indicates whether the coverage information should be collected while executing the test
  collectCoverage: true,

  // The directory where Jest should output its coverage files
  coverageDirectory: "coverage",

  // Force coverage summary to be displayed even if tests fail
  forceExit: false,
  errorOnDeprecated: false,

  // An array of regexp pattern strings used to skip coverage collection
  coveragePathIgnorePatterns: [
     "/node_modules/",
     "/playwright/",
     "app/Instructor/Assessment/assessment.jsx",
     "app/Instructor/Dashboard/dashboard.jsx"
  ],

  // Indicates which provider should be used to instrument code for coverage
  coverageProvider: "v8",

  // A list of reporter names that Jest uses when writing coverage reports
  coverageReporters: [
    "json",
    "json-summary",
    "lcov",
    "cobertura",
    'text-summary',
    'text'  // Shows detailed coverage table in terminal
  ],

  // A map from regular expressions to module names or to arrays of module names that allow to stub out resources with a single module
//   moduleNameMapper: {
//     "^app/(.*)$": "<rootDir>/src/$1",
//     "\\.(css|less|sass|scss)$": "<rootDir>/__mocks__/styleMock.js",
//     "assets\/(.*).(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$": "<rootDir>/__mocks__/fileMock.js",
//     "^react($|/.+)": "<rootDir>/node_modules/react$1",
//     "^pendo$": "<rootDir>/__mocks__/pendo.js",
//     '^reportingUI/FilteringParamsMF$': '<rootDir>/src/moduleFederation/weConsume/FilteringParamsMF.tsx',
//     '^reportingUI/MultiselectCustomWidgetMF$': '<rootDir>/src/moduleFederation/weConsume/MultiselectCustomWidgetMF.tsx',
//   },

  // Use this configuration option to add custom reporters to Jest
//   "reporters": [
//     "default",
//     ["jest-junit", { "outputName": "unittest-junit.xml" }]
//   ],

  // The paths to modules that run some code to configure or set up the testing environment before each test
  // setupFiles: ['./jest.setup.ts'],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],

  // The test environment that will be used for testing
  testEnvironment: "jsdom",

  // An array of regexp pattern strings that are matched against all test paths, matched tests are skipped
  testPathIgnorePatterns: [
    "/node_modules/",
    "/playwright/",
    "Instructor/Policy/Test/test\\.jsx",
  ],

  // Only match files with .test. or .spec. in the filename (not bare test.js or test.jsx)
  testRegex: "(/__tests__/.*|(\\.|/)(test|spec))\\.[jt]sx?$"
};
