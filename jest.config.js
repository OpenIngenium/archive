'use strict';

module.exports = {
  testEnvironment: 'node',

  testMatch: [
    '**/tests/unit/**/*.test.js'
  ],

  // Coverage is enforced only on source that currently has unit tests.
  // Add modules here as they gain unit-test coverage.
  collectCoverageFrom: [
    'config.js',
    'definitions.js',
    'controllers/Comment.js',
    'controllers/Execution.js',
    'controllers/File.js',
    'controllers/Health.js',
    'controllers/Logging.js',
    'controllers/Paragraph.js',
    'controllers/ProcSection.js',
    'controllers/Procedure.js',
    'controllers/ProcedureComment.js',
    'controllers/ProcedureFile.js',
    'controllers/ProcedureParagraph.js',
    'controllers/ProcedureProcSection.js',
    'controllers/ProcedureSection.js',
    'controllers/ProcedureStep.js',
    'controllers/ProcedureVersions.js',
    'controllers/Procedures.js',
    'controllers/Section.js',
    'controllers/Step.js',
    'controllers/Venue.js',
    'controllers/VenueGroup.js',
    'controllers/HealthService.js',
    'controllers/LoggingService.js',
    'controllers/SectionService.js',
    'controllers/StepService.js',
    'controllers/VenueGroupService.js',
    'controllers/VenueService.js',
    'controllers/ParagraphService.js',
    'controllers/ProcedureParagraphService.js',
    'controllers/ProcedureSectionService.js',
    'controllers/ProcedureStepService.js',
    'controllers/CommentService.js',
    'controllers/FileService.js',
    'controllers/ProcSectionService.js',
    'controllers/ProcedureProcSectionService.js',
    'controllers/ProcedureCommentService.js',
    'controllers/ProcedureFileService.js',
    'controllers/ProceduresService.js',
    'controllers/ProcedureVersionsService.js',
    'controllers/ProcedureService.js',
    'controllers/ExecutionService.js'
  ],

  coveragePathIgnorePatterns: [
    '/node_modules/'
  ],

  coverageReporters: [
    'text',
    'text-summary',
    'lcov',
    'html'
  ],

  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      statements: 100,
      lines: 100
    }
  },

  clearMocks: true,
  restoreMocks: true
};
