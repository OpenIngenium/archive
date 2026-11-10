'use strict';

const HealthService = require('../../../controllers/HealthService');
const { makeRes, makeNext } = require('../mocks/testHelpers');

describe('HealthService.health_get', () => {
  test('responds with an OK health status as JSON', () => {
    const res = makeRes();
    const next = makeNext();

    HealthService.health_get({}, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ status: 'OK', message: '' });
  });
});
