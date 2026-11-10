'use strict';

jest.mock('../../../api/base_funcs');
jest.mock('../../../api/procedure_funcs');

const base_funcs = require('../../../api/base_funcs');
const procedure_funcs = require('../../../api/procedure_funcs');
const Service = require('../../../controllers/ProcedureProcSectionService');
const { makeArgs, makeRes, makeNext } = require('../mocks/testHelpers');

beforeEach(() => {
  base_funcs.push_error.mockImplementation((msg, err) => ({ message: msg, err }));
  base_funcs.sanitizeElement.mockImplementation(() => {});
  base_funcs.sanitize_internal_attrs.mockImplementation((x) => x);
  base_funcs.sanitize_internal_attrs_recursive.mockImplementation((x) => x);
});

describe('ProcedureProcSectionService.procedure_create_procedure_section', () => {
  test('adds an element', async () => {
    procedure_funcs.addElement.mockResolvedValue({ elem_id: 'e1' });
    const res = makeRes();
    await Service.procedure_create_procedure_section(makeArgs({ procedure_id: 'p1', procedure_section: { a: 1 }, insert_after_id: '2', level: 'CHILD' }), res, makeNext());
    expect(procedure_funcs.addElement).toHaveBeenCalledWith('p1', { a: 1 }, '2', 'CHILD');
    expect(res.json).toHaveBeenCalledWith({ elem_id: 'e1' });
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.addElement.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_create_procedure_section(makeArgs({ procedure_id: 'p1', procedure_section: {}, insert_after_id: null, level: null }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when adding a procedure section to a procedure', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureProcSectionService.procedure_get_procedure_section', () => {
  test('returns the element', async () => {
    procedure_funcs.getElement.mockResolvedValue({ elem_id: 'e1' });
    const res = makeRes();
    await Service.procedure_get_procedure_section(makeArgs({ procedure_id: 'p1', elem_id: 'e1' }), res, makeNext());
    expect(res.json).toHaveBeenCalledWith({ elem_id: 'e1' });
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.getElement.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_get_procedure_section(makeArgs({ procedure_id: 'p1', elem_id: 'e1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting a procedure section of a procedure', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureProcSectionService.procedure_get_procedure_section_structure', () => {
  test('sanitizes and returns the structure', async () => {
    procedure_funcs.getProcedureSectionStructure.mockResolvedValue({ id: 'root' });
    const res = makeRes();
    await Service.procedure_get_procedure_section_structure(makeArgs({ procedure_id: 'p1', elem_id: 'e1' }), res, makeNext());
    expect(procedure_funcs.getProcedureSectionStructure).toHaveBeenCalledWith('PROCEDURE', 'e1');
    expect(base_funcs.sanitize_internal_attrs_recursive).toHaveBeenCalledWith({ id: 'root' });
    expect(res.json).toHaveBeenCalledWith({ id: 'root' });
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.getProcedureSectionStructure.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_get_procedure_section_structure(makeArgs({ procedure_id: 'p1', elem_id: 'e1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting the struture of a procedure section of a procedure', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureProcSectionService.procedure_get_procedure_section_elements', () => {
  test('collects and sanitizes each element', async () => {
    procedure_funcs.getProcedureSectionStructure.mockResolvedValue({ id: 'root' });
    base_funcs.collectElements.mockImplementation((data, elems) => { elems.push({ id: 1 }); });
    const res = makeRes();
    await Service.procedure_get_procedure_section_elements(makeArgs({ procedure_id: 'p1', elem_id: 'e1' }), res, makeNext());
    expect(base_funcs.sanitizeElement).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.getProcedureSectionStructure.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_get_procedure_section_elements(makeArgs({ procedure_id: 'p1', elem_id: 'e1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting selected elements of a procedure', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureProcSectionService.procedure_get_procedure_sections', () => {
  test('uses defaults and returns ascending list', async () => {
    procedure_funcs.getProcedureVersionId.mockResolvedValue('ver1');
    procedure_funcs.getElements.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const res = makeRes();
    await Service.procedure_get_procedure_sections(makeArgs({ procedure_id: 'p1', offset: 0, limit: 0, sort: null, description: null }), res, makeNext());
    expect(procedure_funcs.getElements).toHaveBeenCalledWith('procedureVersion/ver1', 'PROCEDURE_SECTION', null, null);
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }, { id: 2 }]);
  });

  test('honors pagination and descending sort', async () => {
    procedure_funcs.getProcedureVersionId.mockResolvedValue('ver1');
    procedure_funcs.getElements.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const res = makeRes();
    await Service.procedure_get_procedure_sections(makeArgs({ procedure_id: 'p1', offset: 1, limit: 2, sort: 'DESC', description: 'foo' }), res, makeNext());
    expect(res.json).toHaveBeenCalledWith([{ id: 3 }, { id: 2 }]);
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.getProcedureVersionId.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_get_procedure_sections(makeArgs({ procedure_id: 'p1', offset: 0, limit: 0, sort: null, description: null }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting procedure sections of a procedure', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureProcSectionService.procedure_update_procedure_section', () => {
  test('checks versioning then updates', async () => {
    procedure_funcs.checkElementVersioned.mockResolvedValue(undefined);
    procedure_funcs.updateElement.mockResolvedValue({ ok: true });
    const res = makeRes();
    await Service.procedure_update_procedure_section(makeArgs({ procedure_id: 'p1', elem_id: 'e1', procedure_section: { a: 1 } }), res, makeNext());
    expect(procedure_funcs.updateElement).toHaveBeenCalledWith('p1', 'e1', { a: 1 });
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.checkElementVersioned.mockRejectedValue('versioned');
    const res = makeRes();
    await Service.procedure_update_procedure_section(makeArgs({ procedure_id: 'p1', elem_id: 'e1', procedure_section: {} }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when updating a procedure section of a procedure', 'versioned');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureProcSectionService.procedure_get_procedure_section_input', () => {
  test('returns the authoring user input', async () => {
    procedure_funcs.getElement.mockResolvedValue({ authoring_user_input: { k: 'v' } });
    const res = makeRes();
    await Service.procedure_get_procedure_section_input(makeArgs({ procedure_id: 'p1', elem_id: 'e1' }), res, makeNext());
    expect(res.json).toHaveBeenCalledWith({ k: 'v' });
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.getElement.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_get_procedure_section_input(makeArgs({ procedure_id: 'p1', elem_id: 'e1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting input of a procedure section of a procedure', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureProcSectionService.procedure_update_procedure_section_input', () => {
  test('checks circular reference when a reference version of 0 is provided, then updates', async () => {
    procedure_funcs.checkCircularReferenceElem.mockResolvedValue(undefined);
    procedure_funcs.checkElementVersioned.mockResolvedValue(undefined);
    procedure_funcs.updateElement.mockResolvedValue({});
    const res = makeRes();
    const user_input = { reference_procedure_id: 'ref1', reference_procedure_version: 0, elements: ['a'] };
    await Service.procedure_update_procedure_section_input(makeArgs({ procedure_id: 'p1', elem_id: 'e1', user_input }), res, makeNext());
    expect(procedure_funcs.checkCircularReferenceElem).toHaveBeenCalledWith('ref1', 0, ['a'], 'e1');
    expect(procedure_funcs.updateElement).toHaveBeenCalledWith('p1', 'e1', { authoring_user_input: user_input });
    expect(res.status).toHaveBeenCalledWith(204);
  });

  test('checks circular reference for a positive reference version', async () => {
    procedure_funcs.checkCircularReferenceElem.mockResolvedValue(undefined);
    procedure_funcs.checkElementVersioned.mockResolvedValue(undefined);
    procedure_funcs.updateElement.mockResolvedValue({});
    const res = makeRes();
    const user_input = { reference_procedure_id: 'ref1', reference_procedure_version: 3, elements: [] };
    await Service.procedure_update_procedure_section_input(makeArgs({ procedure_id: 'p1', elem_id: 'e1', user_input }), res, makeNext());
    expect(procedure_funcs.checkCircularReferenceElem).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(204);
  });

  test('skips the circular check when the reference version is invalid', async () => {
    procedure_funcs.checkElementVersioned.mockResolvedValue(undefined);
    procedure_funcs.updateElement.mockResolvedValue({});
    const res = makeRes();
    const user_input = { reference_procedure_id: 'ref1', reference_procedure_version: -1, elements: [] };
    await Service.procedure_update_procedure_section_input(makeArgs({ procedure_id: 'p1', elem_id: 'e1', user_input }), res, makeNext());
    expect(procedure_funcs.checkCircularReferenceElem).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(204);
  });

  test('returns 400 when the circular reference check fails', async () => {
    procedure_funcs.checkCircularReferenceElem.mockRejectedValue('circular');
    const res = makeRes();
    const user_input = { reference_procedure_id: 'ref1', reference_procedure_version: 0, elements: [] };
    await Service.procedure_update_procedure_section_input(makeArgs({ procedure_id: 'p1', elem_id: 'e1', user_input }), res, makeNext());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'circular' });
    expect(procedure_funcs.updateElement).not.toHaveBeenCalled();
  });

  test('returns 400 when the update fails', async () => {
    procedure_funcs.checkCircularReferenceElem.mockResolvedValue(undefined);
    procedure_funcs.checkElementVersioned.mockRejectedValue('versioned');
    const res = makeRes();
    const user_input = { reference_procedure_id: 'ref1', reference_procedure_version: 0, elements: [] };
    await Service.procedure_update_procedure_section_input(makeArgs({ procedure_id: 'p1', elem_id: 'e1', user_input }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when updating procedure section input', 'versioned');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
