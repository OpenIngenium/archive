'use strict';

jest.mock('../../../api/base_funcs');
jest.mock('../../../api/procedure_funcs');

const base_funcs = require('../../../api/base_funcs');
const procedure_funcs = require('../../../api/procedure_funcs');
const Service = require('../../../controllers/ProcedureParagraphService');
const { makeArgs, makeRes, makeNext } = require('../mocks/testHelpers');

beforeEach(() => {
  base_funcs.push_error.mockImplementation((msg, err) => ({ message: msg, err }));
});

describe('ProcedureParagraphService.procedure_create_paragraph', () => {
  test('adds an element', async () => {
    procedure_funcs.addElement.mockResolvedValue({ elem_id: 'e1' });
    const res = makeRes();
    await Service.procedure_create_paragraph(makeArgs({ procedure_id: 'p1', paragraph: { a: 1 }, insert_after_id: '2', level: 'CHILD' }), res, makeNext());
    expect(procedure_funcs.addElement).toHaveBeenCalledWith('p1', { a: 1 }, '2', 'CHILD');
    expect(res.json).toHaveBeenCalledWith({ elem_id: 'e1' });
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.addElement.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_create_paragraph(makeArgs({ procedure_id: 'p1', paragraph: {}, insert_after_id: null, level: null }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when adding a paragraph to a procedure', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureParagraphService.procedure_get_paragraph', () => {
  test('returns the element', async () => {
    procedure_funcs.getElement.mockResolvedValue({ elem_id: 'e1' });
    const res = makeRes();
    await Service.procedure_get_paragraph(makeArgs({ procedure_id: 'p1', elem_id: 'e1' }), res, makeNext());
    expect(procedure_funcs.getElement).toHaveBeenCalledWith('e1');
    expect(res.json).toHaveBeenCalledWith({ elem_id: 'e1' });
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.getElement.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_get_paragraph(makeArgs({ procedure_id: 'p1', elem_id: 'e1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting a paragraph of a procedure', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureParagraphService.procedure_get_paragraphs', () => {
  test('uses defaults and returns ascending list', async () => {
    procedure_funcs.getProcedureVersionId.mockResolvedValue('ver1');
    procedure_funcs.getElements.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const res = makeRes();
    await Service.procedure_get_paragraphs(makeArgs({ procedure_id: 'p1', offset: 0, limit: 0, sort: null, description: null }), res, makeNext());
    expect(procedure_funcs.getProcedureVersionId).toHaveBeenCalledWith('p1', 0);
    expect(procedure_funcs.getElements).toHaveBeenCalledWith('procedureVersion/ver1', 'PARAGRAPH', null, null);
    expect(res.set).toHaveBeenCalledWith('x-total-count', 2);
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }, { id: 2 }]);
  });

  test('honors pagination and descending sort', async () => {
    procedure_funcs.getProcedureVersionId.mockResolvedValue('ver1');
    procedure_funcs.getElements.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const res = makeRes();
    await Service.procedure_get_paragraphs(makeArgs({ procedure_id: 'p1', offset: 1, limit: 2, sort: 'DESC', description: 'foo' }), res, makeNext());
    expect(procedure_funcs.getElements).toHaveBeenCalledWith('procedureVersion/ver1', 'PARAGRAPH', null, 'foo');
    expect(res.json).toHaveBeenCalledWith([{ id: 3 }, { id: 2 }]);
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.getProcedureVersionId.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_get_paragraphs(makeArgs({ procedure_id: 'p1', offset: 0, limit: 0, sort: null, description: null }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting paragraphs of a procedure', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureParagraphService.procedure_update_paragraph', () => {
  test('checks versioning then updates', async () => {
    procedure_funcs.checkElementVersioned.mockResolvedValue(undefined);
    procedure_funcs.updateElement.mockResolvedValue({ ok: true });
    const res = makeRes();
    await Service.procedure_update_paragraph(makeArgs({ procedure_id: 'p1', elem_id: 'e1', paragraph: { a: 1 } }), res, makeNext());
    expect(procedure_funcs.checkElementVersioned).toHaveBeenCalledWith('p1', 'e1', 'Cannot modify element of versioned procedure');
    expect(procedure_funcs.updateElement).toHaveBeenCalledWith('p1', 'e1', { a: 1 });
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.checkElementVersioned.mockRejectedValue('versioned');
    const res = makeRes();
    await Service.procedure_update_paragraph(makeArgs({ procedure_id: 'p1', elem_id: 'e1', paragraph: {} }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when updating a procedure paragraph', 'versioned');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
