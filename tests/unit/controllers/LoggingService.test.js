'use strict';

jest.mock('../../../api/base_funcs');
jest.mock('../../../api/node_funcs');

const node_funcs = require('../../../api/node_funcs');
const LoggingService = require('../../../controllers/LoggingService');
const { makeArgs, makeRes, makeNext } = require('../mocks/testHelpers');

describe('LoggingService', () => {
  test('get_logging returns the current logging info', () => {
    const info = { level: 'INFO' };
    node_funcs.getLogging.mockReturnValue(info);
    const res = makeRes();

    LoggingService.get_logging({}, res, makeNext());

    expect(node_funcs.getLogging).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(info);
  });

  test('update_logging applies the new level and returns 204', () => {
    const args = makeArgs({ logging_info: { level: 'DEBUG' } });
    const res = makeRes();

    LoggingService.update_logging(args, res, makeNext());

    expect(node_funcs.updateLogging).toHaveBeenCalledWith({ level: 'DEBUG' });
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalledTimes(1);
  });

  test('update_logging returns 400 with the error message when update fails', () => {
    node_funcs.updateLogging.mockImplementation(() => {
      throw new Error('bad level');
    });
    const args = makeArgs({ logging_info: { level: 'NOPE' } });
    const res = makeRes();

    LoggingService.update_logging(args, res, makeNext());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Error: bad level' });
  });
});
