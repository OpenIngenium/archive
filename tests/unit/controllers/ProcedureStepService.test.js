'use strict';

jest.mock('../../../api/base_funcs');
jest.mock('../../../api/procedure_funcs');

const base_funcs = require('../../../api/base_funcs');
const procedure_funcs = require('../../../api/procedure_funcs');
const Service = require('../../../controllers/ProcedureStepService');
const { makeArgs, makeRes, makeNext } = require('../mocks/testHelpers');

beforeEach(() => {
  base_funcs.push_error.mockImplementation((msg, err) => ({ message: msg, err }));
});

describe('ProcedureStepService.procedure_create_step', () => {
  test('adds an element', async () => {
    procedure_funcs.addElement.mockResolvedValue({ elem_id: 'e1' });
    const res = makeRes();
    await Service.procedure_create_step(makeArgs({ procedure_id: 'p1', step: { a: 1 }, insert_after_id: '2', level: 'CHILD' }), res, makeNext());
    expect(procedure_funcs.addElement).toHaveBeenCalledWith('p1', { a: 1 }, '2', 'CHILD');
    expect(res.json).toHaveBeenCalledWith({ elem_id: 'e1' });
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.addElement.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_create_step(makeArgs({ procedure_id: 'p1', step: {}, insert_after_id: null, level: null }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when adding a step to procedure', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureStepService.procedure_get_step', () => {
  test('returns the element', async () => {
    procedure_funcs.getElement.mockResolvedValue({ elem_id: 'e1' });
    const res = makeRes();
    await Service.procedure_get_step(makeArgs({ procedure_id: 'p1', elem_id: 'e1' }), res, makeNext());
    expect(procedure_funcs.getElement).toHaveBeenCalledWith('e1');
    expect(res.json).toHaveBeenCalledWith({ elem_id: 'e1' });
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.getElement.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_get_step(makeArgs({ procedure_id: 'p1', elem_id: 'e1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting a step of procedure', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureStepService.procedure_get_step_input', () => {
  test('returns the authoring input when present', async () => {
    procedure_funcs.getElement.mockResolvedValue({ authoring_user_input: { k: 'v' } });
    const res = makeRes();
    await Service.procedure_get_step_input(makeArgs({ procedure_id: 'p1', elem_id: 'e1' }), res, makeNext());
    expect(res.json).toHaveBeenCalledWith({ k: 'v' });
  });

  test('returns an empty object when input is absent', async () => {
    procedure_funcs.getElement.mockResolvedValue({});
    const res = makeRes();
    await Service.procedure_get_step_input(makeArgs({ procedure_id: 'p1', elem_id: 'e1' }), res, makeNext());
    expect(res.json).toHaveBeenCalledWith({});
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.getElement.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_get_step_input(makeArgs({ procedure_id: 'p1', elem_id: 'e1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting input of a step of procedure', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureStepService.procedure_get_steps', () => {
  test('uses defaults and returns ascending list', async () => {
    procedure_funcs.getProcedureVersionId.mockResolvedValue('ver1');
    procedure_funcs.getElements.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const res = makeRes();
    await Service.procedure_get_steps(makeArgs({ procedure_id: 'p1', offset: 0, limit: 0, sort: null, description: null }), res, makeNext());
    expect(procedure_funcs.getElements).toHaveBeenCalledWith('procedureVersion/ver1', 'STEP', null, null);
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }, { id: 2 }]);
  });

  test('honors pagination and descending sort', async () => {
    procedure_funcs.getProcedureVersionId.mockResolvedValue('ver1');
    procedure_funcs.getElements.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const res = makeRes();
    await Service.procedure_get_steps(makeArgs({ procedure_id: 'p1', offset: 1, limit: 2, sort: 'DESC', description: 'foo' }), res, makeNext());
    expect(res.json).toHaveBeenCalledWith([{ id: 3 }, { id: 2 }]);
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.getProcedureVersionId.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_get_steps(makeArgs({ procedure_id: 'p1', offset: 0, limit: 0, sort: null, description: null }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting steps of a procedure', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureStepService.procedure_update_step', () => {
  test('updates the element', async () => {
    procedure_funcs.updateElement.mockResolvedValue({ ok: true });
    const res = makeRes();
    await Service.procedure_update_step(makeArgs({ procedure_id: 'p1', elem_id: 'e1', step: { a: 1 } }), res, makeNext());
    expect(procedure_funcs.updateElement).toHaveBeenCalledWith('p1', 'e1', { a: 1 });
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.updateElement.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_update_step(makeArgs({ procedure_id: 'p1', elem_id: 'e1', step: {} }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when updating a step of procedure', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureStepService.procedure_update_step_input', () => {
  test('wraps input and returns 204', async () => {
    procedure_funcs.updateElement.mockResolvedValue({});
    const res = makeRes();
    await Service.procedure_update_step_input(makeArgs({ procedure_id: 'p1', elem_id: 'e1', user_input: { k: 'v' } }), res, makeNext());
    expect(procedure_funcs.updateElement).toHaveBeenCalledWith('p1', 'e1', { authoring_user_input: { k: 'v' } });
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalledTimes(1);
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.updateElement.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_update_step_input(makeArgs({ procedure_id: 'p1', elem_id: 'e1', user_input: {} }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when updating input of a step of procedure', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
