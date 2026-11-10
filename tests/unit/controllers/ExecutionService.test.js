'use strict';

jest.mock('../../../api/base_funcs');
jest.mock('../../../api/node_funcs');

const base_funcs = require('../../../api/base_funcs');
const node_funcs = require('../../../api/node_funcs');
const Service = require('../../../controllers/ExecutionService');
const { makeArgs, makeRes, makeNext } = require('../mocks/testHelpers');

beforeEach(() => {
  base_funcs.push_error.mockImplementation((msg, err) => ({ message: msg, err }));
  base_funcs.sanitize_internal_attrs.mockImplementation((x) => x);
  base_funcs.sanitizeElement.mockImplementation(() => {});
  base_funcs.sanitize_internal_attrs_recursive.mockImplementation(() => {});
});

describe('ExecutionService.create_execution', () => {
  test('creates an execution', async () => {
    node_funcs.createExecution.mockResolvedValue({ id: 'x1' });
    const res = makeRes();
    await Service.create_execution(makeArgs({ execution: { name: 'e' } }), res, makeNext());
    expect(node_funcs.createExecution).toHaveBeenCalledWith({ name: 'e' });
    expect(res.json).toHaveBeenCalledWith({ id: 'x1' });
  });

  test('returns 400 on failure', async () => {
    node_funcs.createExecution.mockRejectedValue('boom');
    const res = makeRes();
    await Service.create_execution(makeArgs({ execution: {} }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when creating an execution', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ExecutionService.create_execution_step', () => {
  test('checks the execution then adds a step', async () => {
    node_funcs.checkExecutionClosed.mockResolvedValue(undefined);
    node_funcs.addElement.mockResolvedValue({ elem_id: 'e1' });
    const res = makeRes();
    await Service.create_execution_step(makeArgs({ execution_id: 'x1', step: { a: 1 }, insert_after_id: '2', level: 'CHILD' }), res, makeNext());
    expect(node_funcs.addElement).toHaveBeenCalledWith('x1', { a: 1 }, '2', 'CHILD');
    expect(res.json).toHaveBeenCalledWith({ elem_id: 'e1' });
  });

  test('returns 400 on failure', async () => {
    node_funcs.checkExecutionClosed.mockRejectedValue('closed');
    const res = makeRes();
    await Service.create_execution_step(makeArgs({ execution_id: 'x1', step: {}, insert_after_id: null, level: null }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when adding a step', 'closed');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ExecutionService.delete_execution', () => {
  test('deletes and returns 204', async () => {
    node_funcs.deleteExecution.mockResolvedValue({});
    const res = makeRes();
    await Service.delete_execution(makeArgs({ execution_id: 'x1' }), res, makeNext());
    expect(node_funcs.deleteExecution).toHaveBeenCalledWith('x1');
    expect(res.status).toHaveBeenCalledWith(204);
  });

  test('returns 400 on failure', async () => {
    node_funcs.deleteExecution.mockRejectedValue('boom');
    const res = makeRes();
    await Service.delete_execution(makeArgs({ execution_id: 'x1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when deleting an execution', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ExecutionService.get_execution', () => {
  test('returns the full execution', async () => {
    node_funcs.getExecutionFull.mockResolvedValue({ id: 'x1' });
    const res = makeRes();
    await Service.get_execution(makeArgs({ execution_id: 'x1' }), res, makeNext());
    expect(node_funcs.getExecutionFull).toHaveBeenCalledWith('x1');
    expect(res.json).toHaveBeenCalledWith({ id: 'x1' });
  });

  test('returns 400 on failure', async () => {
    node_funcs.getExecutionFull.mockRejectedValue('boom');
    const res = makeRes();
    await Service.get_execution(makeArgs({ execution_id: 'x1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting an execution', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ExecutionService.get_execution_as_run', () => {
  test('returns the sanitized as-run report', async () => {
    node_funcs.getAsRun.mockResolvedValue({ id: 'root' });
    const res = makeRes();
    await Service.get_execution_as_run(makeArgs({ execution_id: 'x1' }), res, makeNext());
    expect(node_funcs.getAsRun).toHaveBeenCalledWith('execution/x1');
    expect(base_funcs.sanitize_internal_attrs_recursive).toHaveBeenCalledWith({ id: 'root' });
    expect(res.json).toHaveBeenCalledWith({ id: 'root' });
  });

  test('returns 400 on failure', async () => {
    node_funcs.getAsRun.mockRejectedValue('boom');
    const res = makeRes();
    await Service.get_execution_as_run(makeArgs({ execution_id: 'x1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting execution AS RUN', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ExecutionService.get_execution_elements', () => {
  test('uses defaults and returns ascending list', async () => {
    base_funcs.getElements.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const res = makeRes();
    await Service.get_execution_elements(makeArgs({
      execution_id: 'x1', elem_type: null, step_type: null, offset: 0, limit: 0, sort: null, description: null,
      all_elements: 'OFF', comment_filter: 'OFF', ar_comment_filter: 'OFF', dr_comment_filter: 'OFF'
    }), res, makeNext());
    expect(base_funcs.getElements).toHaveBeenCalledWith('EXECUTION', 'execution/x1', null, null, null, false, false, false, false);
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }, { id: 2 }]);
  });

  test('honors filters, pagination and descending sort', async () => {
    base_funcs.getElements.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const res = makeRes();
    await Service.get_execution_elements(makeArgs({
      execution_id: 'x1', elem_type: 'STEP', step_type: 'ACTION', offset: 1, limit: 2, sort: 'DESC', description: 'foo',
      all_elements: 'ON', comment_filter: 'ON', ar_comment_filter: 'ON', dr_comment_filter: 'ON'
    }), res, makeNext());
    expect(base_funcs.getElements).toHaveBeenCalledWith('EXECUTION', 'execution/x1', 'STEP', 'ACTION', 'foo', true, true, true, true);
    expect(res.json).toHaveBeenCalledWith([{ id: 3 }, { id: 2 }]);
  });

  test('returns 400 on failure', async () => {
    base_funcs.getElements.mockRejectedValue('boom');
    const res = makeRes();
    await Service.get_execution_elements(makeArgs({
      execution_id: 'x1', elem_type: null, step_type: null, offset: 0, limit: 0, sort: null, description: null,
      all_elements: 'OFF', comment_filter: 'OFF', ar_comment_filter: 'OFF', dr_comment_filter: 'OFF'
    }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting execution elements', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ExecutionService.get_execution_simple_elements', () => {
  test('returns simple elements with total count header', async () => {
    base_funcs.getSimpleElements.mockResolvedValue([{ id: 1 }]);
    const res = makeRes();
    await Service.get_execution_simple_elements(makeArgs({ execution_id: 'x1' }), res, makeNext());
    expect(base_funcs.getSimpleElements).toHaveBeenCalledWith('EXECUTION', 'execution/x1');
    expect(res.set).toHaveBeenCalledWith('x-total-count', 1);
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
  });

  test('returns 400 on failure', async () => {
    base_funcs.getSimpleElements.mockRejectedValue('boom');
    const res = makeRes();
    await Service.get_execution_simple_elements(makeArgs({ execution_id: 'x1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting execution simple elements', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ExecutionService.update_execution_elements', () => {
  test('updates elements', async () => {
    base_funcs.updateElements.mockResolvedValue([{ id: 1 }]);
    const res = makeRes();
    await Service.update_execution_elements(makeArgs({ execution_id: 'x1', elems_input: [{ id: 1 }] }), res, makeNext());
    expect(base_funcs.updateElements).toHaveBeenCalledWith('EXECUTION', [{ id: 1 }]);
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
  });

  test('returns 400 on failure', async () => {
    base_funcs.updateElements.mockRejectedValue('boom');
    const res = makeRes();
    await Service.update_execution_elements(makeArgs({ execution_id: 'x1', elems_input: [] }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when updating execution elements', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ExecutionService.get_execution_outline', () => {
  test('returns the outline', async () => {
    node_funcs.getOutline.mockResolvedValue([{ id: 1 }]);
    const res = makeRes();
    await Service.get_execution_outline(makeArgs({ execution_id: 'x1' }), res, makeNext());
    expect(node_funcs.getOutline).toHaveBeenCalledWith('execution/x1');
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
  });

  test('returns 400 on failure', async () => {
    node_funcs.getOutline.mockRejectedValue('boom');
    const res = makeRes();
    await Service.get_execution_outline(makeArgs({ execution_id: 'x1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting execution outline', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ExecutionService.get_execution_history', () => {
  test('returns the history', async () => {
    node_funcs.getStepExecutionHistory.mockResolvedValue({ history: [] });
    const res = makeRes();
    await Service.get_execution_history(makeArgs({ execution_id: 'x1' }), res, makeNext());
    expect(node_funcs.getStepExecutionHistory).toHaveBeenCalledWith('execution/x1');
    expect(res.json).toHaveBeenCalledWith({ history: [] });
  });

  test('returns 400 on failure', async () => {
    node_funcs.getStepExecutionHistory.mockRejectedValue('boom');
    const res = makeRes();
    await Service.get_execution_history(makeArgs({ execution_id: 'x1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting execution history', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ExecutionService.get_execution_status', () => {
  test('returns the status', async () => {
    node_funcs.getExecutionStatus.mockResolvedValue({ status: 'RUNNING' });
    const res = makeRes();
    await Service.get_execution_status(makeArgs({ execution_id: 'x1' }), res, makeNext());
    expect(node_funcs.getExecutionStatus).toHaveBeenCalledWith('x1');
    expect(res.json).toHaveBeenCalledWith({ status: 'RUNNING' });
  });

  test('returns 400 on failure', async () => {
    node_funcs.getExecutionStatus.mockRejectedValue('boom');
    const res = makeRes();
    await Service.get_execution_status(makeArgs({ execution_id: 'x1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting execution status', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ExecutionService.get_execution_steps', () => {
  test('uses defaults and returns ascending list', async () => {
    base_funcs.getElements.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const res = makeRes();
    await Service.get_execution_steps(makeArgs({ execution_id: 'x1', offset: 0, limit: 0, sort: null, description: null }), res, makeNext());
    expect(base_funcs.getElements).toHaveBeenCalledWith('EXECUTION', 'execution/x1', 'STEP', null, null);
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }, { id: 2 }]);
  });

  test('honors pagination and descending sort', async () => {
    base_funcs.getElements.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const res = makeRes();
    await Service.get_execution_steps(makeArgs({ execution_id: 'x1', offset: 1, limit: 2, sort: 'DESC', description: 'foo' }), res, makeNext());
    expect(res.json).toHaveBeenCalledWith([{ id: 3 }, { id: 2 }]);
  });

  test('returns 400 on failure', async () => {
    base_funcs.getElements.mockRejectedValue('boom');
    const res = makeRes();
    await Service.get_execution_steps(makeArgs({ execution_id: 'x1', offset: 0, limit: 0, sort: null, description: null }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting execution steps', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ExecutionService.get_executions', () => {
  const TERNARY_KEYS = ['completed', 'run_for_score'];
  function build(base, ternaryShape) {
    const args = makeArgs(base);
    for (const key of TERNARY_KEYS) {
      args[key] = ternaryShape(key);
    }
    return args;
  }
  const provided = {
    offset: 5, limit: 20, sort: 'ASC', sort_by: 'TIME', execution_id: 'x', description: 'd',
    status: 'RUNNING', statuses: 'A,B', from_time: 't1', to_time: 't2', venue_id: 'v', venue_name: 'vn',
    venue_type: 'vt', test_conductor: 'tc', procedure_id: 'p', version: 2, institutional_id: 'i', institutional_release_id: 'ir'
  };
  const defaults = {
    offset: 0, limit: 0, sort: null, sort_by: null, execution_id: null, description: null,
    status: null, statuses: null, from_time: null, to_time: null, venue_id: null, venue_name: null,
    venue_type: null, test_conductor: null, procedure_id: null, version: null, institutional_id: null, institutional_release_id: null
  };

  test('passes provided filters, builds status list and sanitizes results', async () => {
    node_funcs.getExecutions.mockResolvedValue({ total_count: 2, data: [{ id: 1 }, { id: 2 }] });
    const res = makeRes();
    const args = build(provided, () => ({ value: true }));
    args.run_for_score = { value: false };
    await Service.get_executions(args, res, makeNext());
    expect(node_funcs.getExecutions).toHaveBeenCalledWith(
      5, 20, 'ASC', 'TIME', 'x', 'd', ['RUNNING', 'A', 'B'], true, 't1', 't2', 'v', 'vn', 'vt', false, 'tc', 'p', 2, 'i', 'ir'
    );
    expect(base_funcs.sanitize_internal_attrs).toHaveBeenCalledTimes(2);
    expect(res.set).toHaveBeenCalledWith('x-total-count', 2);
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }, { id: 2 }]);
  });

  test('uses defaults and an empty status list when filter args have no value', async () => {
    node_funcs.getExecutions.mockResolvedValue({ data: [] });
    const res = makeRes();
    const args = build(defaults, () => ({}));
    await Service.get_executions(args, res, makeNext());
    expect(node_funcs.getExecutions).toHaveBeenCalledWith(
      0, 50, 'DESC', null, null, null, [], null, null, null, null, null, null, null, null, null, null, null, null
    );
    expect(res.set).toHaveBeenCalledWith('x-total-count', 0);
  });

  test('treats undefined filter values as null', async () => {
    node_funcs.getExecutions.mockResolvedValue({ total_count: 0, data: [] });
    const res = makeRes();
    const args = build(defaults, () => ({ value: undefined }));
    await Service.get_executions(args, res, makeNext());
    expect(node_funcs.getExecutions).toHaveBeenCalledWith(
      0, 50, 'DESC', null, null, null, [], null, null, null, null, null, null, null, null, null, null, null, null
    );
  });

  test('returns 400 on failure', async () => {
    node_funcs.getExecutions.mockRejectedValue('boom');
    const res = makeRes();
    const args = build(defaults, () => ({}));
    await Service.get_executions(args, res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting executions', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ExecutionService.move_execution_element', () => {
  test('checks the execution then moves', async () => {
    node_funcs.checkExecutionClosed.mockResolvedValue(undefined);
    node_funcs.moveElement.mockResolvedValue({ count: 1 });
    const res = makeRes();
    await Service.move_execution_element(makeArgs({ execution_id: 'x1', move_element_input: { elem_ids: ['e1'], insert_after_id: '2', level: 'CHILD' } }), res, makeNext());
    expect(node_funcs.moveElement).toHaveBeenCalledWith('x1', ['e1'], '2', 'CHILD');
    expect(res.json).toHaveBeenCalledWith({ count: 1 });
  });

  test('returns 400 on failure', async () => {
    node_funcs.checkExecutionClosed.mockRejectedValue('closed');
    const res = makeRes();
    await Service.move_execution_element(makeArgs({ execution_id: 'x1', move_element_input: { elem_ids: [], insert_after_id: null, level: null } }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when moving an execution element', 'closed');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ExecutionService.copy_execution_element', () => {
  test('copies with explicit source info', async () => {
    node_funcs.checkExecutionClosed.mockResolvedValue(undefined);
    node_funcs.copyElement.mockResolvedValue({ count: 1 });
    const res = makeRes();
    const input = { elem_ids: ['e1'], insert_after_id: '2', level: 'CHILD', source_execution_id: 'sx', source_procedure_id: 'sp', source_procedure_version: 3 };
    await Service.copy_execution_element(makeArgs({ execution_id: 'x1', copy_element_input: input }), res, makeNext());
    expect(node_funcs.copyElement).toHaveBeenCalledWith('x1', ['e1'], '2', 'CHILD', 'sx', 'sp', 3);
    expect(res.json).toHaveBeenCalledWith({ count: 1 });
  });

  test('defaults source info when omitted', async () => {
    node_funcs.checkExecutionClosed.mockResolvedValue(undefined);
    node_funcs.copyElement.mockResolvedValue({ count: 1 });
    const res = makeRes();
    const input = { elem_ids: ['e1'], insert_after_id: '2', level: 'CHILD' };
    await Service.copy_execution_element(makeArgs({ execution_id: 'x1', copy_element_input: input }), res, makeNext());
    expect(node_funcs.copyElement).toHaveBeenCalledWith('x1', ['e1'], '2', 'CHILD', null, null, null);
  });

  test('returns 400 on failure', async () => {
    node_funcs.checkExecutionClosed.mockRejectedValue('closed');
    const res = makeRes();
    await Service.copy_execution_element(makeArgs({ execution_id: 'x1', copy_element_input: { elem_ids: [], insert_after_id: null, level: null } }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when copying an execution element', 'closed');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ExecutionService.execution_get_element', () => {
  test('returns the sanitized element', async () => {
    node_funcs.getElement.mockResolvedValue({ id: 'e1', _key: '1' });
    const res = makeRes();
    await Service.execution_get_element(makeArgs({ execution_id: 'x1', elem_id: 'e1' }), res, makeNext());
    expect(base_funcs.sanitize_internal_attrs).toHaveBeenCalledWith({ id: 'e1', _key: '1' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('returns 400 on failure', async () => {
    node_funcs.getElement.mockRejectedValue('boom');
    const res = makeRes();
    await Service.execution_get_element(makeArgs({ execution_id: 'x1', elem_id: 'e1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting an execution element', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ExecutionService.execution_update_element', () => {
  test('checks the execution then updates', async () => {
    node_funcs.checkExecutionClosed.mockResolvedValue(undefined);
    node_funcs.updateElement.mockResolvedValue({ ok: true });
    const res = makeRes();
    await Service.execution_update_element(makeArgs({ execution_id: 'x1', elem_id: 'e1', elem_input: { a: 1 } }), res, makeNext());
    expect(node_funcs.updateElement).toHaveBeenCalledWith('e1', { a: 1 });
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test('returns 400 on failure', async () => {
    node_funcs.checkExecutionClosed.mockRejectedValue('closed');
    const res = makeRes();
    await Service.execution_update_element(makeArgs({ execution_id: 'x1', elem_id: 'e1', elem_input: {} }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when updating an execution element', 'closed');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ExecutionService.execution_delete_element', () => {
  test('checks the execution then deletes', async () => {
    node_funcs.checkExecutionClosed.mockResolvedValue(undefined);
    node_funcs.deleteElement.mockResolvedValue({ count: 1 });
    const res = makeRes();
    await Service.execution_delete_element(makeArgs({ execution_id: 'x1', elem_id: 'e1' }), res, makeNext());
    expect(node_funcs.deleteElement).toHaveBeenCalledWith('e1', false);
    expect(res.json).toHaveBeenCalledWith({ count: 1 });
  });

  test('returns 400 on failure', async () => {
    node_funcs.checkExecutionClosed.mockRejectedValue('closed');
    const res = makeRes();
    await Service.execution_delete_element(makeArgs({ execution_id: 'x1', elem_id: 'e1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when deleting an execution element', 'closed');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ExecutionService.execution_modify_element', () => {
  test('checks the execution then modifies', async () => {
    node_funcs.checkExecutionClosed.mockResolvedValue(undefined);
    node_funcs.modifyElement.mockResolvedValue({ ok: true });
    const res = makeRes();
    await Service.execution_modify_element(makeArgs({ execution_id: 'x1', elem_id: 'e1' }), res, makeNext());
    expect(node_funcs.modifyElement).toHaveBeenCalledWith('x1', 'e1');
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test('returns 400 on failure', async () => {
    node_funcs.checkExecutionClosed.mockRejectedValue('closed');
    const res = makeRes();
    await Service.execution_modify_element(makeArgs({ execution_id: 'x1', elem_id: 'e1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when modifying an execution element', 'closed');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ExecutionService.execution_discard_element', () => {
  test('checks the execution then discards a single element', async () => {
    node_funcs.checkExecutionClosed.mockResolvedValue(undefined);
    node_funcs.discardElements.mockResolvedValue({ count: 1 });
    const res = makeRes();
    await Service.execution_discard_element(makeArgs({ execution_id: 'x1', elem_id: 'e1' }), res, makeNext());
    expect(node_funcs.discardElements).toHaveBeenCalledWith('x1', ['e1']);
    expect(res.json).toHaveBeenCalledWith({ count: 1 });
  });

  test('returns 400 on failure', async () => {
    node_funcs.checkExecutionClosed.mockRejectedValue('closed');
    const res = makeRes();
    await Service.execution_discard_element(makeArgs({ execution_id: 'x1', elem_id: 'e1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when discarding an execution element', 'closed');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ExecutionService.execution_discard_elements', () => {
  test('checks the execution then discards multiple elements', async () => {
    node_funcs.checkExecutionClosed.mockResolvedValue(undefined);
    node_funcs.discardElements.mockResolvedValue({ count: 2 });
    const res = makeRes();
    await Service.execution_discard_elements(makeArgs({ execution_id: 'x1', discard_input: { elem_ids: ['e1', 'e2'] } }), res, makeNext());
    expect(node_funcs.discardElements).toHaveBeenCalledWith('x1', ['e1', 'e2']);
    expect(res.json).toHaveBeenCalledWith({ count: 2 });
  });

  test('returns 400 on failure', async () => {
    node_funcs.checkExecutionClosed.mockRejectedValue('closed');
    const res = makeRes();
    await Service.execution_discard_elements(makeArgs({ execution_id: 'x1', discard_input: { elem_ids: [] } }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when discarding an execution element', 'closed');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ExecutionService.update_execution', () => {
  test('updates the execution meta data', async () => {
    node_funcs.updateExecution.mockResolvedValue({ ok: true });
    const res = makeRes();
    await Service.update_execution(makeArgs({ execution_id: 'x1', execution_meta_data: { a: 1 } }), res, makeNext());
    expect(node_funcs.updateExecution).toHaveBeenCalledWith('x1', { a: 1 });
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test('returns 400 on failure', async () => {
    node_funcs.updateExecution.mockRejectedValue('boom');
    const res = makeRes();
    await Service.update_execution(makeArgs({ execution_id: 'x1', execution_meta_data: {} }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when updating an execution', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ExecutionService.update_execution_status', () => {
  test('resolves the user name then updates status', async () => {
    base_funcs.getUserName.mockReturnValue('alice');
    node_funcs.updateExecutionStatus.mockResolvedValue({ status: 'CLOSED' });
    const res = makeRes();
    await Service.update_execution_status(makeArgs({ execution_id: 'x1', execution_status: { status: 'CLOSED' } }), res, makeNext(), { authorization: 'Bearer token' });
    expect(base_funcs.getUserName).toHaveBeenCalledWith('Bearer token');
    expect(node_funcs.updateExecutionStatus).toHaveBeenCalledWith('x1', { status: 'CLOSED' }, 'alice');
    expect(res.json).toHaveBeenCalledWith({ status: 'CLOSED' });
  });

  test('returns 400 on failure', async () => {
    base_funcs.getUserName.mockReturnValue('alice');
    node_funcs.updateExecutionStatus.mockRejectedValue('boom');
    const res = makeRes();
    await Service.update_execution_status(makeArgs({ execution_id: 'x1', execution_status: {} }), res, makeNext(), { authorization: 'Bearer token' });
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when updating execution status', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ExecutionService.get_next_element', () => {
  test('returns the next element when found', async () => {
    node_funcs.getNextElement.mockResolvedValue({ elem_id: 'e2' });
    const res = makeRes();
    await Service.get_next_element(makeArgs({ execution_id: 'x1', elem_id: 'e1', executable: true }), res, makeNext());
    expect(node_funcs.getNextElement).toHaveBeenCalledWith('x1', 'e1', true);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ elem_id: 'e2' });
  });

  test('returns 404 when there is no next element', async () => {
    node_funcs.getNextElement.mockResolvedValue(null);
    const res = makeRes();
    await Service.get_next_element(makeArgs({ execution_id: 'x1', elem_id: 'e1', executable: true }), res, makeNext());
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.end).toHaveBeenCalledTimes(1);
  });

  test('returns 400 on failure', async () => {
    node_funcs.getNextElement.mockRejectedValue('boom');
    const res = makeRes();
    await Service.get_next_element(makeArgs({ execution_id: 'x1', elem_id: 'e1', executable: true }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting the next execution element', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ExecutionService.set_boundary_element', () => {
  test('sets the boundary when the execution is returned', async () => {
    node_funcs.setExecutionBoundary.mockResolvedValue({ id: 'x1' });
    const res = makeRes();
    await Service.set_boundary_element(makeArgs({ execution_id: 'x1', elem_id: 'e1' }), res, makeNext());
    expect(node_funcs.setExecutionBoundary).toHaveBeenCalledWith('x1', 'e1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ id: 'x1' });
  });

  test('returns 404 when nothing is returned', async () => {
    node_funcs.setExecutionBoundary.mockResolvedValue(null);
    const res = makeRes();
    await Service.set_boundary_element(makeArgs({ execution_id: 'x1', elem_id: 'e1' }), res, makeNext());
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.end).toHaveBeenCalledTimes(1);
  });

  test('returns 400 on failure', async () => {
    node_funcs.setExecutionBoundary.mockRejectedValue('boom');
    const res = makeRes();
    await Service.set_boundary_element(makeArgs({ execution_id: 'x1', elem_id: 'e1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when setting execution boundary element', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ExecutionService.export_execution', () => {
  test('exports the execution', async () => {
    node_funcs.exportExecution.mockResolvedValue({ data: 1 });
    const res = makeRes();
    await Service.export_execution(makeArgs({ execution_id: 'x1' }), res, makeNext());
    expect(node_funcs.exportExecution).toHaveBeenCalledWith('x1');
    expect(res.json).toHaveBeenCalledWith({ data: 1 });
  });

  test('returns 400 on failure', async () => {
    node_funcs.exportExecution.mockRejectedValue('boom');
    const res = makeRes();
    await Service.export_execution(makeArgs({ execution_id: 'x1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when exporting an execution', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ExecutionService.import_execution', () => {
  test('imports the execution', async () => {
    node_funcs.importExecution.mockResolvedValue({ ok: true });
    const res = makeRes();
    await Service.import_execution(makeArgs({ import_input: { a: 1 } }), res, makeNext());
    expect(node_funcs.importExecution).toHaveBeenCalledWith({ a: 1 });
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test('returns 400 on failure', async () => {
    node_funcs.importExecution.mockRejectedValue('boom');
    const res = makeRes();
    await Service.import_execution(makeArgs({ import_input: {} }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when importing execution', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
