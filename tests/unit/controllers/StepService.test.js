'use strict';

jest.mock('../../../api/base_funcs');
jest.mock('../../../api/node_funcs');

const base_funcs = require('../../../api/base_funcs');
const node_funcs = require('../../../api/node_funcs');
const StepService = require('../../../controllers/StepService');
const { makeArgs, makeRes, makeNext } = require('../mocks/testHelpers');

beforeEach(() => {
  base_funcs.push_error.mockImplementation((msg, err) => ({ message: msg, err }));
});

describe('StepService.get_step', () => {
  test('returns the step', async () => {
    node_funcs.getStep.mockResolvedValue({ elem_id: 'e1' });
    const res = makeRes();
    await StepService.get_step(makeArgs({ elem_id: 'e1' }), res, makeNext());
    expect(node_funcs.getStep).toHaveBeenCalledWith('e1');
    expect(res.json).toHaveBeenCalledWith({ elem_id: 'e1' });
  });

  test('returns 400 on failure', async () => {
    node_funcs.getStep.mockRejectedValue('nope');
    const res = makeRes();
    await StepService.get_step(makeArgs({ elem_id: 'e1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting a step', 'nope');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('StepService.get_step_input', () => {
  test('returns the user input when present', async () => {
    node_funcs.getStep.mockResolvedValue({ execution_user_input: { k: 'v' } });
    const res = makeRes();
    await StepService.get_step_input(makeArgs({ elem_id: 'e1' }), res, makeNext());
    expect(res.json).toHaveBeenCalledWith({ k: 'v' });
  });

  test('returns an empty object when input is absent', async () => {
    node_funcs.getStep.mockResolvedValue({});
    const res = makeRes();
    await StepService.get_step_input(makeArgs({ elem_id: 'e1' }), res, makeNext());
    expect(res.json).toHaveBeenCalledWith({});
  });

  test('returns 400 on failure', async () => {
    node_funcs.getStep.mockRejectedValue('nope');
    const res = makeRes();
    await StepService.get_step_input(makeArgs({ elem_id: 'e1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting input of a step', 'nope');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('StepService.get_step_result', () => {
  test('returns the execution when present', async () => {
    node_funcs.getStep.mockResolvedValue({ execution: { status: 'DONE' } });
    const res = makeRes();
    await StepService.get_step_result(makeArgs({ elem_id: 'e1' }), res, makeNext());
    expect(res.json).toHaveBeenCalledWith({ status: 'DONE' });
  });

  test('returns an empty object when execution is absent', async () => {
    node_funcs.getStep.mockResolvedValue({});
    const res = makeRes();
    await StepService.get_step_result(makeArgs({ elem_id: 'e1' }), res, makeNext());
    expect(res.json).toHaveBeenCalledWith({});
  });

  test('returns 400 on failure', async () => {
    node_funcs.getStep.mockRejectedValue('nope');
    const res = makeRes();
    await StepService.get_step_result(makeArgs({ elem_id: 'e1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting result of a step', 'nope');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('StepService.update_step', () => {
  test('updates the element', async () => {
    node_funcs.updateElement.mockResolvedValue({ ok: true });
    const res = makeRes();
    await StepService.update_step(makeArgs({ elem_id: 'e1', step: { a: 1 } }), res, makeNext());
    expect(node_funcs.updateElement).toHaveBeenCalledWith('e1', { a: 1 });
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test('returns 400 on failure', async () => {
    node_funcs.updateElement.mockRejectedValue('nope');
    const res = makeRes();
    await StepService.update_step(makeArgs({ elem_id: 'e1', step: {} }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when updating a step', 'nope');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('StepService.update_step_input', () => {
  test('sets the input and returns 204', async () => {
    node_funcs.setStepInput.mockResolvedValue({});
    const res = makeRes();
    await StepService.update_step_input(makeArgs({ elem_id: 'e1', user_input: { k: 'v' } }), res, makeNext());
    expect(node_funcs.setStepInput).toHaveBeenCalledWith('e1', { k: 'v' });
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalledTimes(1);
  });

  test('returns 400 on failure', async () => {
    node_funcs.setStepInput.mockRejectedValue('nope');
    const res = makeRes();
    await StepService.update_step_input(makeArgs({ elem_id: 'e1', user_input: {} }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when updating input of a step', 'nope');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('StepService.update_step_result', () => {
  test('sets the output', async () => {
    node_funcs.setStepOutput.mockResolvedValue({ ok: true });
    const res = makeRes();
    await StepService.update_step_result(makeArgs({ elem_id: 'e1', result: { r: 1 } }), res, makeNext());
    expect(node_funcs.setStepOutput).toHaveBeenCalledWith('e1', { r: 1 });
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test('returns 400 on failure', async () => {
    node_funcs.setStepOutput.mockRejectedValue('nope');
    const res = makeRes();
    await StepService.update_step_result(makeArgs({ elem_id: 'e1', result: {} }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when updating result of a step', 'nope');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('StepService.create_new_run', () => {
  test('creates a new run', async () => {
    node_funcs.createNewRun.mockResolvedValue({ elem_id: 'e1' });
    const res = makeRes();
    await StepService.create_new_run(makeArgs({ elem_id: 'e1' }), res, makeNext());
    expect(node_funcs.createNewRun).toHaveBeenCalledWith('e1');
    expect(res.json).toHaveBeenCalledWith({ elem_id: 'e1' });
  });

  test('returns 400 on failure', async () => {
    node_funcs.createNewRun.mockRejectedValue('nope');
    const res = makeRes();
    await StepService.create_new_run(makeArgs({ elem_id: 'e1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when creating a new run of a step', 'nope');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
