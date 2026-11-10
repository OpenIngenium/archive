'use strict';

jest.mock('../../../api/base_funcs');
jest.mock('../../../api/node_funcs');
jest.mock('../../../api/procedure_funcs');

const base_funcs = require('../../../api/base_funcs');
const node_funcs = require('../../../api/node_funcs');
const procedure_funcs = require('../../../api/procedure_funcs');
const Service = require('../../../controllers/ProcSectionService');
const { makeArgs, makeRes, makeNext } = require('../mocks/testHelpers');

beforeEach(() => {
  base_funcs.push_error.mockImplementation((msg, err) => ({ message: msg, err }));
  base_funcs.sanitizeElement.mockImplementation(() => {});
  base_funcs.sanitize_internal_attrs.mockImplementation((x) => x);
  base_funcs.sanitize_internal_attrs_recursive.mockImplementation((x) => x);
});

describe('ProcSectionService.create_procedure_section', () => {
  test('sets run_for_score true for ATLO and keeps existing input', async () => {
    node_funcs.checkExecutionClosed.mockResolvedValue(undefined);
    node_funcs.getVenueTypeForExecution.mockResolvedValue('ATLO');
    node_funcs.addElement.mockResolvedValue({ elem_id: 'e1' });
    const res = makeRes();
    const section = { execution_user_input: { existing: 1 } };
    await Service.create_procedure_section(makeArgs({ execution_id: 'x1', procedure_section: section, insert_after_id: '2', level: 'CHILD' }), res, makeNext());
    expect(node_funcs.addElement).toHaveBeenCalledWith('x1', expect.objectContaining({
      execution_user_input: { existing: 1, run_for_score: true }
    }), '2', 'CHILD');
    expect(res.json).toHaveBeenCalledWith({ elem_id: 'e1' });
  });

  test('sets run_for_score true for Testbed', async () => {
    node_funcs.checkExecutionClosed.mockResolvedValue(undefined);
    node_funcs.getVenueTypeForExecution.mockResolvedValue('Testbed');
    node_funcs.addElement.mockResolvedValue({ elem_id: 'e1' });
    const res = makeRes();
    await Service.create_procedure_section(makeArgs({ execution_id: 'x1', procedure_section: {}, insert_after_id: null, level: null }), res, makeNext());
    expect(node_funcs.addElement).toHaveBeenCalledWith('x1', { execution_user_input: { run_for_score: true } }, null, null);
  });

  test('sets run_for_score false for other venues and defaults input', async () => {
    node_funcs.checkExecutionClosed.mockResolvedValue(undefined);
    node_funcs.getVenueTypeForExecution.mockResolvedValue('FlightLike');
    node_funcs.addElement.mockResolvedValue({ elem_id: 'e1' });
    const res = makeRes();
    await Service.create_procedure_section(makeArgs({ execution_id: 'x1', procedure_section: {}, insert_after_id: null, level: null }), res, makeNext());
    expect(node_funcs.addElement).toHaveBeenCalledWith('x1', { execution_user_input: { run_for_score: false } }, null, null);
  });

  test('returns 400 on failure', async () => {
    node_funcs.checkExecutionClosed.mockRejectedValue('closed');
    const res = makeRes();
    await Service.create_procedure_section(makeArgs({ execution_id: 'x1', procedure_section: {}, insert_after_id: null, level: null }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when creating a procedure section', 'closed');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcSectionService.get_execution_procedure_sections', () => {
  test('uses defaults and returns ascending list', async () => {
    base_funcs.getElements.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const res = makeRes();
    await Service.get_execution_procedure_sections(makeArgs({ execution_id: 'x1', offset: 0, limit: 0, sort: null, description: null }), res, makeNext());
    expect(base_funcs.getElements).toHaveBeenCalledWith('EXECUTION', 'execution/x1', 'PROCEDURE_SECTION', null, null);
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }, { id: 2 }]);
  });

  test('honors pagination and descending sort', async () => {
    base_funcs.getElements.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const res = makeRes();
    await Service.get_execution_procedure_sections(makeArgs({ execution_id: 'x1', offset: 1, limit: 2, sort: 'DESC', description: 'foo' }), res, makeNext());
    expect(res.json).toHaveBeenCalledWith([{ id: 3 }, { id: 2 }]);
  });

  test('returns 400 on failure', async () => {
    base_funcs.getElements.mockRejectedValue('boom');
    const res = makeRes();
    await Service.get_execution_procedure_sections(makeArgs({ execution_id: 'x1', offset: 0, limit: 0, sort: null, description: null }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting procedure sections', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcSectionService.get_procedure_section', () => {
  test('returns the element', async () => {
    node_funcs.getElement.mockResolvedValue({ elem_id: 'e1' });
    const res = makeRes();
    await Service.get_procedure_section(makeArgs({ elem_id: 'e1' }), res, makeNext());
    expect(res.json).toHaveBeenCalledWith({ elem_id: 'e1' });
  });

  test('returns 400 on failure', async () => {
    node_funcs.getElement.mockRejectedValue('boom');
    const res = makeRes();
    await Service.get_procedure_section(makeArgs({ elem_id: 'e1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting a procedure section', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcSectionService.get_procedure_section_structure', () => {
  test('sanitizes and returns the structure', async () => {
    procedure_funcs.getProcedureSectionStructure.mockResolvedValue({ id: 'root' });
    const res = makeRes();
    await Service.get_procedure_section_structure(makeArgs({ elem_id: 'e1' }), res, makeNext());
    expect(procedure_funcs.getProcedureSectionStructure).toHaveBeenCalledWith('EXECUTION', 'e1');
    expect(base_funcs.sanitizeElement).toHaveBeenCalledWith({ id: 'root' });
    expect(base_funcs.sanitize_internal_attrs_recursive).toHaveBeenCalledWith({ id: 'root' });
    expect(res.json).toHaveBeenCalledWith({ id: 'root' });
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.getProcedureSectionStructure.mockRejectedValue('boom');
    const res = makeRes();
    await Service.get_procedure_section_structure(makeArgs({ elem_id: 'e1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting elements structure of a procedure section', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcSectionService.get_procedure_section_elements', () => {
  test('collects and sanitizes each element', async () => {
    procedure_funcs.getProcedureSectionStructure.mockResolvedValue({ id: 'root' });
    base_funcs.collectElements.mockImplementation((data, elems) => { elems.push({ id: 1 }, { id: 2 }); });
    const res = makeRes();
    await Service.get_procedure_section_elements(makeArgs({ elem_id: 'e1' }), res, makeNext());
    expect(base_funcs.sanitizeElement).toHaveBeenCalledTimes(2);
    expect(base_funcs.sanitize_internal_attrs).toHaveBeenCalledTimes(2);
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }, { id: 2 }]);
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.getProcedureSectionStructure.mockRejectedValue('boom');
    const res = makeRes();
    await Service.get_procedure_section_elements(makeArgs({ elem_id: 'e1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting elements of a procedure section', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcSectionService.import_procedure_section', () => {
  test('imports and updates used procedures', async () => {
    node_funcs.importProcedureSection.mockResolvedValue({ id: 'root' });
    node_funcs.updateUsedProcedures.mockResolvedValue(undefined);
    const res = makeRes();
    await Service.import_procedure_section(makeArgs({ execution_id: 'x1', elem_id: 'e1' }), res, makeNext());
    expect(node_funcs.importProcedureSection).toHaveBeenCalledWith('e1');
    expect(node_funcs.updateUsedProcedures).toHaveBeenCalledWith('x1');
    expect(res.json).toHaveBeenCalledWith({ id: 'root' });
  });

  test('returns 400 on failure', async () => {
    node_funcs.importProcedureSection.mockRejectedValue('boom');
    const res = makeRes();
    await Service.import_procedure_section(makeArgs({ execution_id: 'x1', elem_id: 'e1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when importing a procedure for a procedure. boom', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcSectionService.update_procedure_section', () => {
  test('updates the element', async () => {
    node_funcs.updateElement.mockResolvedValue({ ok: true });
    const res = makeRes();
    await Service.update_procedure_section(makeArgs({ elem_id: 'e1', procedure_section: { a: 1 } }), res, makeNext());
    expect(node_funcs.updateElement).toHaveBeenCalledWith('e1', { a: 1 });
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test('returns 400 on failure', async () => {
    node_funcs.updateElement.mockRejectedValue('boom');
    const res = makeRes();
    await Service.update_procedure_section(makeArgs({ elem_id: 'e1', procedure_section: {} }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when updating a procedure section', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcSectionService.get_procedure_section_input', () => {
  test('returns the execution user input', async () => {
    node_funcs.getElement.mockResolvedValue({ execution_user_input: { k: 'v' } });
    const res = makeRes();
    await Service.get_procedure_section_input(makeArgs({ elem_id: 'e1' }), res, makeNext());
    expect(res.json).toHaveBeenCalledWith({ k: 'v' });
  });

  test('returns 400 on failure', async () => {
    node_funcs.getElement.mockRejectedValue('boom');
    const res = makeRes();
    await Service.get_procedure_section_input(makeArgs({ elem_id: 'e1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting input of procedure section', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcSectionService.update_procedure_section_input', () => {
  test('updates the input and returns 204', async () => {
    node_funcs.updateElement.mockResolvedValue({});
    const res = makeRes();
    await Service.update_procedure_section_input(makeArgs({ elem_id: 'e1', user_input: { k: 'v' } }), res, makeNext());
    expect(node_funcs.updateElement).toHaveBeenCalledWith('e1', { execution_user_input: { k: 'v' } });
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalledTimes(1);
  });

  test('returns 400 on failure', async () => {
    node_funcs.updateElement.mockRejectedValue('boom');
    const res = makeRes();
    await Service.update_procedure_section_input(makeArgs({ elem_id: 'e1', user_input: {} }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when updating input of a procedure section', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
