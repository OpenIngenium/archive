'use strict';

jest.mock('../../../api/base_funcs');
jest.mock('../../../api/node_funcs');

const base_funcs = require('../../../api/base_funcs');
const node_funcs = require('../../../api/node_funcs');
const Service = require('../../../controllers/ParagraphService');
const { makeArgs, makeRes, makeNext } = require('../mocks/testHelpers');

beforeEach(() => {
  base_funcs.push_error.mockImplementation((msg, err) => ({ message: msg, err }));
});

describe('ParagraphService.create_paragraph', () => {
  test('adds an element after checking the execution is open', async () => {
    node_funcs.checkExecutionClosed.mockResolvedValue(undefined);
    node_funcs.addElement.mockResolvedValue({ elem_id: 'e1' });
    const res = makeRes();
    await Service.create_paragraph(makeArgs({ execution_id: 'x1', paragraph: { a: 1 }, insert_after_id: '2', level: 'CHILD' }), res, makeNext());
    expect(node_funcs.checkExecutionClosed).toHaveBeenCalledWith('x1', 'Execution has been closed. Cannot add an element.');
    expect(node_funcs.addElement).toHaveBeenCalledWith('x1', { a: 1 }, '2', 'CHILD');
    expect(res.json).toHaveBeenCalledWith({ elem_id: 'e1' });
  });

  test('returns 400 on failure', async () => {
    node_funcs.checkExecutionClosed.mockRejectedValue('closed');
    const res = makeRes();
    await Service.create_paragraph(makeArgs({ execution_id: 'x1', paragraph: {}, insert_after_id: null, level: null }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when creating a paragraph', 'closed');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ParagraphService.get_execution_paragraphs', () => {
  test('uses defaults and returns ascending list', async () => {
    base_funcs.getElements.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const res = makeRes();
    await Service.get_execution_paragraphs(makeArgs({ execution_id: 'x1', offset: 0, limit: 0, sort: null, description: null }), res, makeNext());
    expect(base_funcs.getElements).toHaveBeenCalledWith('EXECUTION', 'execution/x1', 'PARAGRAPH', null, null);
    expect(res.set).toHaveBeenCalledWith('x-total-count', 2);
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }, { id: 2 }]);
  });

  test('honors pagination and descending sort', async () => {
    base_funcs.getElements.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const res = makeRes();
    await Service.get_execution_paragraphs(makeArgs({ execution_id: 'x1', offset: 1, limit: 2, sort: 'DESC', description: 'foo' }), res, makeNext());
    expect(base_funcs.getElements).toHaveBeenCalledWith('EXECUTION', 'execution/x1', 'PARAGRAPH', null, 'foo');
    expect(res.json).toHaveBeenCalledWith([{ id: 3 }, { id: 2 }]);
  });

  test('returns 400 on failure', async () => {
    base_funcs.getElements.mockRejectedValue('boom');
    const res = makeRes();
    await Service.get_execution_paragraphs(makeArgs({ execution_id: 'x1', offset: 0, limit: 0, sort: null, description: null }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting paragraphs', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ParagraphService.get_paragraph', () => {
  test('returns the element', async () => {
    node_funcs.getElement.mockResolvedValue({ elem_id: 'e1' });
    const res = makeRes();
    await Service.get_paragraph(makeArgs({ elem_id: 'e1' }), res, makeNext());
    expect(node_funcs.getElement).toHaveBeenCalledWith('e1');
    expect(res.json).toHaveBeenCalledWith({ elem_id: 'e1' });
  });

  test('returns 400 on failure', async () => {
    node_funcs.getElement.mockRejectedValue('boom');
    const res = makeRes();
    await Service.get_paragraph(makeArgs({ elem_id: 'e1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting a paragraph', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ParagraphService.update_paragraph', () => {
  test('updates the element', async () => {
    node_funcs.updateElement.mockResolvedValue({ ok: true });
    const res = makeRes();
    await Service.update_paragraph(makeArgs({ elem_id: 'e1', paragraph: { a: 1 } }), res, makeNext());
    expect(node_funcs.updateElement).toHaveBeenCalledWith('e1', { a: 1 });
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test('returns 400 on failure', async () => {
    node_funcs.updateElement.mockRejectedValue('boom');
    const res = makeRes();
    await Service.update_paragraph(makeArgs({ elem_id: 'e1', paragraph: {} }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when updating a paragraph', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
