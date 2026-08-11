'use strict';

jest.mock('../../../api/base_funcs');
jest.mock('../../../api/node_funcs');

const base_funcs = require('../../../api/base_funcs');
const node_funcs = require('../../../api/node_funcs');
const SectionService = require('../../../controllers/SectionService');
const { makeArgs, makeRes, makeNext } = require('../mocks/testHelpers');

beforeEach(() => {
  base_funcs.push_error.mockImplementation((msg, err) => ({ message: msg, err }));
});

describe('SectionService.create_section', () => {
  test('adds an element after checking the execution is open', async () => {
    node_funcs.checkExecutionClosed.mockResolvedValue(undefined);
    node_funcs.addElement.mockResolvedValue({ elem_id: 'e1' });
    const args = makeArgs({ execution_id: 'x1', section: { a: 1 }, insert_after_id: '2', level: 'CHILD' });
    const res = makeRes();

    await SectionService.create_section(args, res, makeNext());

    expect(node_funcs.checkExecutionClosed).toHaveBeenCalledWith('x1', 'Execution has been closed. Cannot add an element.');
    expect(node_funcs.addElement).toHaveBeenCalledWith('x1', { a: 1 }, '2', 'CHILD');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ elem_id: 'e1' });
  });

  test('returns 400 when adding fails', async () => {
    node_funcs.checkExecutionClosed.mockRejectedValue('closed');
    const args = makeArgs({ execution_id: 'x1', section: {}, insert_after_id: null, level: null });
    const res = makeRes();

    await SectionService.create_section(args, res, makeNext());

    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when adding a section', 'closed');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('SectionService.get_execution_sections', () => {
  test('uses defaults and returns ascending list with total count header', async () => {
    base_funcs.getElements.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const args = makeArgs({ execution_id: 'x1', offset: 0, limit: 0, sort: null, description: null });
    const res = makeRes();

    await SectionService.get_execution_sections(args, res, makeNext());

    expect(base_funcs.getElements).toHaveBeenCalledWith('EXECUTION', 'execution/x1', 'SECTION', null, null);
    expect(res.set).toHaveBeenCalledWith('x-total-count', 2);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }, { id: 2 }]);
  });

  test('honors pagination and descending sort', async () => {
    base_funcs.getElements.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const args = makeArgs({ execution_id: 'x1', offset: 1, limit: 2, sort: 'DESC', description: 'foo' });
    const res = makeRes();

    await SectionService.get_execution_sections(args, res, makeNext());

    expect(base_funcs.getElements).toHaveBeenCalledWith('EXECUTION', 'execution/x1', 'SECTION', null, 'foo');
    expect(res.json).toHaveBeenCalledWith([{ id: 3 }, { id: 2 }]);
  });

  test('returns 400 when retrieval fails', async () => {
    base_funcs.getElements.mockRejectedValue('boom');
    const args = makeArgs({ execution_id: 'x1', offset: 0, limit: 0, sort: null, description: null });
    const res = makeRes();

    await SectionService.get_execution_sections(args, res, makeNext());

    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting elements', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('SectionService.get_section', () => {
  test('returns the element', async () => {
    node_funcs.getElement.mockResolvedValue({ elem_id: 'e1' });
    const args = makeArgs({ elem_id: 'e1' });
    const res = makeRes();

    await SectionService.get_section(args, res, makeNext());

    expect(node_funcs.getElement).toHaveBeenCalledWith('e1');
    expect(res.json).toHaveBeenCalledWith({ elem_id: 'e1' });
  });

  test('returns 400 on failure', async () => {
    node_funcs.getElement.mockRejectedValue('nope');
    const res = makeRes();

    await SectionService.get_section(makeArgs({ elem_id: 'e1' }), res, makeNext());

    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting a section', 'nope');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('SectionService.update_section', () => {
  test('updates the element', async () => {
    node_funcs.updateElement.mockResolvedValue({ updated: true });
    const args = makeArgs({ elem_id: 'e1', section: { a: 1 } });
    const res = makeRes();

    await SectionService.update_section(args, res, makeNext());

    expect(node_funcs.updateElement).toHaveBeenCalledWith('e1', { a: 1 });
    expect(res.json).toHaveBeenCalledWith({ updated: true });
  });

  test('returns 400 on failure', async () => {
    node_funcs.updateElement.mockRejectedValue('nope');
    const res = makeRes();

    await SectionService.update_section(makeArgs({ elem_id: 'e1', section: {} }), res, makeNext());

    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when updating a section', 'nope');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
