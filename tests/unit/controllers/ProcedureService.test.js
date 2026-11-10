'use strict';

jest.mock('../../../api/base_funcs');
jest.mock('../../../api/procedure_funcs');

const base_funcs = require('../../../api/base_funcs');
const procedure_funcs = require('../../../api/procedure_funcs');
const Service = require('../../../controllers/ProcedureService');
const { makeArgs, makeRes, makeNext } = require('../mocks/testHelpers');

beforeEach(() => {
  base_funcs.push_error.mockImplementation((msg, err) => ({ message: msg, err }));
  base_funcs.sanitize_internal_attrs.mockImplementation((x) => x);
  base_funcs.sanitizeElement.mockImplementation(() => {});
  base_funcs.sanitize_internal_attrs_recursive.mockImplementation(() => {});
});

describe('ProcedureService.procedure_get_elements', () => {
  test('uses defaults and returns ascending list', async () => {
    procedure_funcs.getProcedureVersionId.mockResolvedValue('ver1');
    procedure_funcs.getElements.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const res = makeRes();
    await Service.procedure_get_elements(makeArgs({ procedure_id: 'p1', elem_type: null, step_type: null, offset: 0, limit: 0, sort: null, description: null }), res, makeNext());
    expect(procedure_funcs.getElements).toHaveBeenCalledWith('procedureVersion/ver1', null, null, null);
    expect(res.set).toHaveBeenCalledWith('x-total-count', 2);
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }, { id: 2 }]);
  });

  test('honors filters, pagination and descending sort', async () => {
    procedure_funcs.getProcedureVersionId.mockResolvedValue('ver1');
    procedure_funcs.getElements.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const res = makeRes();
    await Service.procedure_get_elements(makeArgs({ procedure_id: 'p1', elem_type: 'STEP', step_type: 'ACTION', offset: 1, limit: 2, sort: 'DESC', description: 'foo' }), res, makeNext());
    expect(procedure_funcs.getElements).toHaveBeenCalledWith('procedureVersion/ver1', 'STEP', 'ACTION', 'foo');
    expect(res.json).toHaveBeenCalledWith([{ id: 3 }, { id: 2 }]);
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.getProcedureVersionId.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_get_elements(makeArgs({ procedure_id: 'p1', elem_type: null, step_type: null, offset: 0, limit: 0, sort: null, description: null }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting procedure elements', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureService.procedure_update_elements', () => {
  test('updates elements', async () => {
    procedure_funcs.getProcedureVersionId.mockResolvedValue('ver1');
    procedure_funcs.updateElements.mockResolvedValue([{ id: 1 }]);
    const res = makeRes();
    await Service.procedure_update_elements(makeArgs({ procedure_id: 'p1', elems_input: [{ id: 1 }] }), res, makeNext());
    expect(procedure_funcs.getProcedureVersionId).toHaveBeenCalledWith('p1', 0);
    expect(procedure_funcs.updateElements).toHaveBeenCalledWith([{ id: 1 }]);
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.getProcedureVersionId.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_update_elements(makeArgs({ procedure_id: 'p1', elems_input: [] }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when updating procedure elements', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureService.procedure_move_element', () => {
  test('moves an element', async () => {
    procedure_funcs.moveElement.mockResolvedValue({ count: 2 });
    const res = makeRes();
    await Service.procedure_move_element(makeArgs({ procedure_id: 'p1', move_element_input: { elem_ids: ['e1'], insert_after_id: '2', level: 'CHILD' } }), res, makeNext());
    expect(procedure_funcs.moveElement).toHaveBeenCalledWith('p1', ['e1'], '2', 'CHILD');
    expect(res.json).toHaveBeenCalledWith({ count: 2 });
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.moveElement.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_move_element(makeArgs({ procedure_id: 'p1', move_element_input: { elem_ids: [], insert_after_id: null, level: null } }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when moving procedure element', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureService.procedure_copy_element', () => {
  test('copies with explicit source information', async () => {
    procedure_funcs.copyElement.mockResolvedValue({ count: 1 });
    const res = makeRes();
    const input = { elem_ids: ['e1'], insert_after_id: '2', level: 'CHILD', source_execution_id: 'x1', source_procedure_id: 'sp1', source_procedure_version: 3 };
    await Service.procedure_copy_element(makeArgs({ procedure_id: 'p1', copy_element_input: input }), res, makeNext());
    expect(procedure_funcs.copyElement).toHaveBeenCalledWith('p1', ['e1'], '2', 'CHILD', 'x1', 'sp1', 3);
    expect(res.json).toHaveBeenCalledWith({ count: 1 });
  });

  test('defaults source information when omitted', async () => {
    procedure_funcs.copyElement.mockResolvedValue({ count: 1 });
    const res = makeRes();
    const input = { elem_ids: ['e1'], insert_after_id: '2', level: 'CHILD' };
    await Service.procedure_copy_element(makeArgs({ procedure_id: 'p1', copy_element_input: input }), res, makeNext());
    expect(procedure_funcs.copyElement).toHaveBeenCalledWith('p1', ['e1'], '2', 'CHILD', null, null, null);
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.copyElement.mockRejectedValue('boom');
    const res = makeRes();
    const input = { elem_ids: [], insert_after_id: null, level: null };
    await Service.procedure_copy_element(makeArgs({ procedure_id: 'p1', copy_element_input: input }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when copying procedure element', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureService.procedure_get_element', () => {
  test('returns the sanitized element', async () => {
    procedure_funcs.getElement.mockResolvedValue({ id: 'e1', _key: '1' });
    const res = makeRes();
    await Service.procedure_get_element(makeArgs({ procedure_id: 'p1', elem_id: 'e1' }), res, makeNext());
    expect(base_funcs.sanitize_internal_attrs).toHaveBeenCalledWith({ id: 'e1', _key: '1' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.getElement.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_get_element(makeArgs({ procedure_id: 'p1', elem_id: 'e1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting a procedure element', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureService.procedure_update_element', () => {
  test('checks versioning then updates', async () => {
    procedure_funcs.checkElementVersioned.mockResolvedValue(undefined);
    procedure_funcs.updateElement.mockResolvedValue({ ok: true });
    const res = makeRes();
    await Service.procedure_update_element(makeArgs({ procedure_id: 'p1', elem_id: 'e1', elem_input: { a: 1 } }), res, makeNext());
    expect(procedure_funcs.checkElementVersioned).toHaveBeenCalledWith('p1', 'e1', 'Cannot modify element of versioned procedure');
    expect(procedure_funcs.updateElement).toHaveBeenCalledWith('p1', 'e1', { a: 1 });
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.checkElementVersioned.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_update_element(makeArgs({ procedure_id: 'p1', elem_id: 'e1', elem_input: {} }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when updating a procedure element', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureService.procedure_delete_element', () => {
  test('checks versioning then deletes', async () => {
    procedure_funcs.checkElementVersioned.mockResolvedValue(undefined);
    procedure_funcs.deleteElement.mockResolvedValue({ count: 1 });
    const res = makeRes();
    await Service.procedure_delete_element(makeArgs({ procedure_id: 'p1', elem_id: 'e1' }), res, makeNext());
    expect(procedure_funcs.checkElementVersioned).toHaveBeenCalledWith('p1', 'e1', 'Cannot delete element of versioned procedure');
    expect(procedure_funcs.deleteElement).toHaveBeenCalledWith('p1', 'e1');
    expect(res.json).toHaveBeenCalledWith({ count: 1 });
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.checkElementVersioned.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_delete_element(makeArgs({ procedure_id: 'p1', elem_id: 'e1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when deleting a procedure element', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureService.procedure_replace_element', () => {
  test('replaces the element', async () => {
    procedure_funcs.replaceProcedureElement.mockResolvedValue({ ok: true });
    const res = makeRes();
    await Service.procedure_replace_element(makeArgs({ procedure_id: 'p1', elem_id: 'e1', replace_element_input: { a: 1 } }), res, makeNext());
    expect(procedure_funcs.replaceProcedureElement).toHaveBeenCalledWith('p1', 'e1', { a: 1 });
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.replaceProcedureElement.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_replace_element(makeArgs({ procedure_id: 'p1', elem_id: 'e1', replace_element_input: {} }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when replacing a procedure element', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureService.procedure_element_apply_tag', () => {
  test('applies a tag', async () => {
    procedure_funcs.procedureElementApplyTag.mockResolvedValue([{ tag: 't1' }]);
    const res = makeRes();
    await Service.procedure_element_apply_tag(makeArgs({ procedure_id: 'p1', elem_id: 'e1', tag_id: 't1' }), res, makeNext());
    expect(procedure_funcs.procedureElementApplyTag).toHaveBeenCalledWith('p1', 'e1', 't1');
    expect(res.json).toHaveBeenCalledWith([{ tag: 't1' }]);
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.procedureElementApplyTag.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_element_apply_tag(makeArgs({ procedure_id: 'p1', elem_id: 'e1', tag_id: 't1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when applying a tag', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureService.procedure_element_remove_tag', () => {
  test('removes a tag', async () => {
    procedure_funcs.procedureElementRemoveTag.mockResolvedValue([]);
    const res = makeRes();
    await Service.procedure_element_remove_tag(makeArgs({ procedure_id: 'p1', elem_id: 'e1', tag_id: 't1' }), res, makeNext());
    expect(procedure_funcs.procedureElementRemoveTag).toHaveBeenCalledWith('p1', 'e1', 't1');
    expect(res.json).toHaveBeenCalledWith([]);
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.procedureElementRemoveTag.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_element_remove_tag(makeArgs({ procedure_id: 'p1', elem_id: 'e1', tag_id: 't1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when applying a tag', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureService.procedure_get_structure', () => {
  test('sanitizes and returns the structure', async () => {
    procedure_funcs.getProcedureVersionId.mockResolvedValue('ver1');
    procedure_funcs.getStructure.mockResolvedValue({ id: 'root' });
    const res = makeRes();
    await Service.procedure_get_structure(makeArgs({ procedure_id: 'p1' }), res, makeNext());
    expect(procedure_funcs.getStructure).toHaveBeenCalledWith('procedureVersion/ver1', false);
    expect(res.json).toHaveBeenCalledWith({ id: 'root' });
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.getProcedureVersionId.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_get_structure(makeArgs({ procedure_id: 'p1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting procedure structure', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureService.load_working_copy', () => {
  test('loads the working copy and returns 204', async () => {
    procedure_funcs.loadToWorkingCopy.mockResolvedValue({});
    const res = makeRes();
    await Service.load_working_copy(makeArgs({ procedure_id: 'p1', procedure_info: { procedure_id: 'sp1', version: 2 } }), res, makeNext());
    expect(procedure_funcs.loadToWorkingCopy).toHaveBeenCalledWith('p1', 'sp1', 2);
    expect(res.status).toHaveBeenCalledWith(204);
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.loadToWorkingCopy.mockRejectedValue('boom');
    const res = makeRes();
    await Service.load_working_copy(makeArgs({ procedure_id: 'p1', procedure_info: { procedure_id: 'sp1', version: 2 } }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when loading a working copy', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureService.import_procedure_version', () => {
  test('imports and returns 204', async () => {
    procedure_funcs.importProcedureVersion.mockResolvedValue({});
    const res = makeRes();
    await Service.import_procedure_version(makeArgs({ procedure_id: 'p1', procedure_version_data: { a: 1 } }), res, makeNext());
    expect(procedure_funcs.importProcedureVersion).toHaveBeenCalledWith('p1', { a: 1 });
    expect(res.status).toHaveBeenCalledWith(204);
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.importProcedureVersion.mockRejectedValue('boom');
    const res = makeRes();
    await Service.import_procedure_version(makeArgs({ procedure_id: 'p1', procedure_version_data: {} }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when imporing a procedure version', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureService.export_procedure_versions', () => {
  test('exports with explicit version and released_only', async () => {
    procedure_funcs.exportProcedureVersions.mockResolvedValue({ data: 1 });
    const res = makeRes();
    await Service.export_procedure_versions(makeArgs({ procedure_id: 'p1', version: 2, released_only: false }), res, makeNext());
    expect(procedure_funcs.exportProcedureVersions).toHaveBeenCalledWith('p1', 2, false);
    expect(res.json).toHaveBeenCalledWith({ data: 1 });
  });

  test('defaults version and released_only to null when undefined', async () => {
    procedure_funcs.exportProcedureVersions.mockResolvedValue({ data: 1 });
    const res = makeRes();
    await Service.export_procedure_versions(makeArgs({ procedure_id: 'p1', version: undefined, released_only: undefined }), res, makeNext());
    expect(procedure_funcs.exportProcedureVersions).toHaveBeenCalledWith('p1', null, null);
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.exportProcedureVersions.mockRejectedValue('boom');
    const res = makeRes();
    await Service.export_procedure_versions(makeArgs({ procedure_id: 'p1', version: undefined, released_only: undefined }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when exporting a procedure', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureService.procedure_create_tag', () => {
  test('creates a tag', async () => {
    procedure_funcs.procedureCreateTag.mockResolvedValue([{ id: 't1' }]);
    const res = makeRes();
    await Service.procedure_create_tag(makeArgs({ procedure_id: 'p1', tag_input: { name: 'n' } }), res, makeNext());
    expect(procedure_funcs.procedureCreateTag).toHaveBeenCalledWith('p1', { name: 'n' });
    expect(res.json).toHaveBeenCalledWith([{ id: 't1' }]);
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.procedureCreateTag.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_create_tag(makeArgs({ procedure_id: 'p1', tag_input: {} }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when creating a tag', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureService.procedure_update_tag', () => {
  test('updates a tag', async () => {
    procedure_funcs.procedureUpdateTag.mockResolvedValue([{ id: 't1' }]);
    const res = makeRes();
    await Service.procedure_update_tag(makeArgs({ procedure_id: 'p1', tag_id: 't1', tag_input: { name: 'n' } }), res, makeNext());
    expect(procedure_funcs.procedureUpdateTag).toHaveBeenCalledWith('p1', 't1', { name: 'n' });
    expect(res.json).toHaveBeenCalledWith([{ id: 't1' }]);
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.procedureUpdateTag.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_update_tag(makeArgs({ procedure_id: 'p1', tag_id: 't1', tag_input: {} }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when updating a tag', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureService.procedure_delete_tag', () => {
  test('deletes a tag', async () => {
    procedure_funcs.procedureDeleteTag.mockResolvedValue([]);
    const res = makeRes();
    await Service.procedure_delete_tag(makeArgs({ procedure_id: 'p1', tag_id: 't1' }), res, makeNext());
    expect(procedure_funcs.procedureDeleteTag).toHaveBeenCalledWith('p1', 't1');
    expect(res.json).toHaveBeenCalledWith([]);
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.procedureDeleteTag.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_delete_tag(makeArgs({ procedure_id: 'p1', tag_id: 't1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when updating a tag', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
