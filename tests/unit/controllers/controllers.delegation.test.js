'use strict';

const { makeReq, makeRes, makeNext } = require('../mocks/testHelpers');

// Auto-mock every service module so the thin controllers delegate to jest.fn()s.
jest.mock('../../../controllers/HealthService');
jest.mock('../../../controllers/LoggingService');
jest.mock('../../../controllers/CommentService');
jest.mock('../../../controllers/ExecutionService');
jest.mock('../../../controllers/FileService');
jest.mock('../../../controllers/ParagraphService');
jest.mock('../../../controllers/ProcSectionService');
jest.mock('../../../controllers/ProcedureService');
jest.mock('../../../controllers/ProcedureCommentService');
jest.mock('../../../controllers/ProcedureFileService');
jest.mock('../../../controllers/ProcedureParagraphService');
jest.mock('../../../controllers/ProcedureProcSectionService');
jest.mock('../../../controllers/ProcedureSectionService');
jest.mock('../../../controllers/ProcedureStepService');
jest.mock('../../../controllers/ProcedureVersionsService');
jest.mock('../../../controllers/ProceduresService');
jest.mock('../../../controllers/SectionService');
jest.mock('../../../controllers/StepService');
jest.mock('../../../controllers/VenueService');
jest.mock('../../../controllers/VenueGroupService');

// [controllerFile, serviceFile]
const controllerPairs = [
  ['Health', 'HealthService'],
  ['Logging', 'LoggingService'],
  ['Comment', 'CommentService'],
  ['Execution', 'ExecutionService'],
  ['File', 'FileService'],
  ['Paragraph', 'ParagraphService'],
  ['ProcSection', 'ProcSectionService'],
  ['Procedure', 'ProcedureService'],
  ['ProcedureComment', 'ProcedureCommentService'],
  ['ProcedureFile', 'ProcedureFileService'],
  ['ProcedureParagraph', 'ProcedureParagraphService'],
  ['ProcedureProcSection', 'ProcedureProcSectionService'],
  ['ProcedureSection', 'ProcedureSectionService'],
  ['ProcedureStep', 'ProcedureStepService'],
  ['ProcedureVersions', 'ProcedureVersionsService'],
  ['Procedures', 'ProceduresService'],
  ['Section', 'SectionService'],
  ['Step', 'StepService'],
  ['Venue', 'VenueService'],
  ['VenueGroup', 'VenueGroupService']
];

describe.each(controllerPairs)('%s controller', (controllerName, serviceName) => {
  const controller = require(`../../../controllers/${controllerName}`);
  const service = require(`../../../controllers/${serviceName}`);

  const methodNames = Object.keys(controller);

  test('exposes at least one handler', () => {
    expect(methodNames.length).toBeGreaterThan(0);
  });

  test.each(methodNames)('%s forwards swagger params, res and next to the service', (method) => {
    const req = makeReq({ a: 1 }, { authorization: 'Bearer token' });
    const res = makeRes();
    const next = makeNext();

    controller[method](req, res, next);

    expect(service[method]).toHaveBeenCalledTimes(1);
    const callArgs = service[method].mock.calls[0];
    expect(callArgs[0]).toBe(req.swagger.params);
    expect(callArgs[1]).toBe(res);
    expect(callArgs[2]).toBe(next);

    // A few handlers additionally forward request headers as a 4th argument.
    if (callArgs.length === 4) {
      expect(callArgs[3]).toBe(req.headers);
    }
  });
});
