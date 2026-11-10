'use strict';

jest.mock('../../../api/base_funcs');
jest.mock('../../../api/procedure_funcs');

const base_funcs = require('../../../api/base_funcs');
const procedure_funcs = require('../../../api/procedure_funcs');
const Service = require('../../../controllers/ProcedureVersionsService');
const { makeArgs, makeRes, makeNext } = require('../mocks/testHelpers');

beforeEach(() => {
  base_funcs.push_error.mockImplementation((msg, err) => ({ message: msg, err }));
  base_funcs.sanitize_internal_attrs.mockImplementation((x) => x);
  base_funcs.sanitizeElement.mockImplementation(() => {});
  base_funcs.sanitize_internal_attrs_recursive.mockImplementation(() => {});
});

describe('ProcedureVersionsService.create_version', () => {
  test('creates a version from the working copy', async () => {
    procedure_funcs.getProcedure.mockResolvedValue({ id: 'p1' });
    procedure_funcs.getProcedureVersion.mockResolvedValue({ version: 0 });
    procedure_funcs.createProcedureVersion.mockResolvedValue({ version: 1 });
    const res = makeRes();
    await Service.create_version(makeArgs({ procedure_id: 'p1', version_meta_data: { note: 'n' } }), res, makeNext());
    expect(procedure_funcs.getProcedureVersion).toHaveBeenCalledWith('p1', 0);
    expect(procedure_funcs.createProcedureVersion).toHaveBeenCalledWith({ id: 'p1' }, { note: 'n' }, { version: 0 });
    expect(base_funcs.sanitize_internal_attrs).toHaveBeenCalledWith({ version: 1 });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.getProcedure.mockRejectedValue('boom');
    const res = makeRes();
    await Service.create_version(makeArgs({ procedure_id: 'p1', version_meta_data: {} }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when creating a version of a procedure', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureVersionsService.delete_version', () => {
  test('deletes and returns 204', async () => {
    procedure_funcs.deleteProcedureVersion.mockResolvedValue({});
    const res = makeRes();
    await Service.delete_version(makeArgs({ procedure_id: 'p1', version: 2 }), res, makeNext());
    expect(procedure_funcs.deleteProcedureVersion).toHaveBeenCalledWith('p1', 2, false);
    expect(res.status).toHaveBeenCalledWith(204);
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.deleteProcedureVersion.mockRejectedValue('boom');
    const res = makeRes();
    await Service.delete_version(makeArgs({ procedure_id: 'p1', version: 2 }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when deleting a version of procedure', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureVersionsService.get_version', () => {
  test('returns the sanitized version', async () => {
    procedure_funcs.getProcedureVersion.mockResolvedValue({ version: 2, _key: '1' });
    const res = makeRes();
    await Service.get_version(makeArgs({ procedure_id: 'p1', version: 2 }), res, makeNext());
    expect(base_funcs.sanitize_internal_attrs).toHaveBeenCalledWith({ version: 2, _key: '1' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.getProcedureVersion.mockRejectedValue('boom');
    const res = makeRes();
    await Service.get_version(makeArgs({ procedure_id: 'p1', version: 2 }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting a version of procedure', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureVersionsService.get_version_structure', () => {
  test('sanitizes and returns the structure', async () => {
    procedure_funcs.getProcedureVersionId.mockResolvedValue('ver1');
    procedure_funcs.getStructure.mockResolvedValue({ id: 'root' });
    const res = makeRes();
    await Service.get_version_structure(makeArgs({ procedure_id: 'p1', version: 2 }), res, makeNext());
    expect(procedure_funcs.getStructure).toHaveBeenCalledWith('procedureVersion/ver1', false);
    expect(base_funcs.sanitize_internal_attrs_recursive).toHaveBeenCalledWith({ id: 'root' });
    expect(res.json).toHaveBeenCalledWith({ id: 'root' });
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.getProcedureVersionId.mockRejectedValue('boom');
    const res = makeRes();
    await Service.get_version_structure(makeArgs({ procedure_id: 'p1', version: 2 }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting element structure of a version of a procedure', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureVersionsService.get_version_elements', () => {
  test('uses defaults and returns ascending list', async () => {
    procedure_funcs.getProcedureVersionId.mockResolvedValue('ver1');
    procedure_funcs.getElements.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const res = makeRes();
    await Service.get_version_elements(makeArgs({
      procedure_id: 'p1', version: 2, elem_type: null, step_type: null,
      offset: 0, limit: 0, sort: null, description: null, all_elements: 'OFF', comment_filter: 'OFF'
    }), res, makeNext());
    expect(procedure_funcs.getElements).toHaveBeenCalledWith('procedureVersion/ver1', null, null, null, false, false);
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }, { id: 2 }]);
  });

  test('honors filters, pagination and descending sort', async () => {
    procedure_funcs.getProcedureVersionId.mockResolvedValue('ver1');
    procedure_funcs.getElements.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const res = makeRes();
    await Service.get_version_elements(makeArgs({
      procedure_id: 'p1', version: 2, elem_type: 'STEP', step_type: 'ACTION',
      offset: 1, limit: 2, sort: 'DESC', description: 'foo', all_elements: 'ON', comment_filter: 'ON'
    }), res, makeNext());
    expect(procedure_funcs.getElements).toHaveBeenCalledWith('procedureVersion/ver1', 'STEP', 'ACTION', 'foo', true, true);
    expect(res.json).toHaveBeenCalledWith([{ id: 3 }, { id: 2 }]);
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.getProcedureVersionId.mockRejectedValue('boom');
    const res = makeRes();
    await Service.get_version_elements(makeArgs({
      procedure_id: 'p1', version: 2, elem_type: null, step_type: null,
      offset: 0, limit: 0, sort: null, description: null, all_elements: 'OFF', comment_filter: 'OFF'
    }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting elements of a version of a procedure', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureVersionsService.get_version_outline', () => {
  test('parses comma-separated tag ids', async () => {
    procedure_funcs.getProcedureVersionId.mockResolvedValue('ver1');
    procedure_funcs.getOutline.mockResolvedValue({ outline: true });
    const res = makeRes();
    await Service.get_version_outline(makeArgs({ procedure_id: 'p1', version: 2, tag_ids: ' t1 , t2 ' }), res, makeNext());
    expect(procedure_funcs.getOutline).toHaveBeenCalledWith('procedureVersion/ver1', ['t1', 't2']);
    expect(res.json).toHaveBeenCalledWith({ outline: true });
  });

  test('defaults to an empty tag id list', async () => {
    procedure_funcs.getProcedureVersionId.mockResolvedValue('ver1');
    procedure_funcs.getOutline.mockResolvedValue({ outline: true });
    const res = makeRes();
    await Service.get_version_outline(makeArgs({ procedure_id: 'p1', version: 2, tag_ids: null }), res, makeNext());
    expect(procedure_funcs.getOutline).toHaveBeenCalledWith('procedureVersion/ver1', []);
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.getProcedureVersionId.mockRejectedValue('boom');
    const res = makeRes();
    await Service.get_version_outline(makeArgs({ procedure_id: 'p1', version: 2, tag_ids: null }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting outline of a version of a procedure', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureVersionsService.get_versions', () => {
  test('sanitizes each version and sets total count header', async () => {
    procedure_funcs.getProcedureVersions.mockResolvedValue({ total_count: 2, data: [{ v: 1 }, { v: 2 }] });
    const res = makeRes();
    await Service.get_versions(makeArgs({
      procedure_id: 'p1', offset: 3, limit: 4, sort: 'ASC', version_description: 'd',
      institutional_release_id: 'r', version_author: 'a', status: 'RELEASED', sort_by: 'TIME_SAVED'
    }), res, makeNext());
    expect(procedure_funcs.getProcedureVersions).toHaveBeenCalledWith('p1', 3, 4, 'd', 'r', 'a', 'RELEASED', 'ASC', 'TIME_SAVED');
    expect(base_funcs.sanitize_internal_attrs).toHaveBeenCalledTimes(2);
    expect(res.set).toHaveBeenCalledWith('x-total-count', 2);
    expect(res.json).toHaveBeenCalledWith([{ v: 1 }, { v: 2 }]);
  });

  test('handles a result without a data array using defaults', async () => {
    procedure_funcs.getProcedureVersions.mockResolvedValue({});
    const res = makeRes();
    await Service.get_versions(makeArgs({
      procedure_id: 'p1', offset: 0, limit: 0, sort: null, version_description: null,
      institutional_release_id: null, version_author: null, status: null, sort_by: null
    }), res, makeNext());
    expect(procedure_funcs.getProcedureVersions).toHaveBeenCalledWith('p1', 0, 50, null, null, null, null, 'DESC', 'TIME_VERSIONED');
    expect(base_funcs.sanitize_internal_attrs).not.toHaveBeenCalled();
    expect(res.set).toHaveBeenCalledWith('x-total-count', 0);
    expect(res.json).toHaveBeenCalledWith(undefined);
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.getProcedureVersions.mockRejectedValue('boom');
    const res = makeRes();
    await Service.get_versions(makeArgs({
      procedure_id: 'p1', offset: 0, limit: 0, sort: null, version_description: null,
      institutional_release_id: null, version_author: null, status: null, sort_by: null
    }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting versions of a procedure', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureVersionsService.update_version', () => {
  test('updates the version meta data', async () => {
    procedure_funcs.updateProcedureVersion.mockResolvedValue({ v: 1 });
    const res = makeRes();
    await Service.update_version(makeArgs({ procedure_id: 'p1', version: 2, version_meta_data: { note: 'n' } }), res, makeNext());
    expect(procedure_funcs.updateProcedureVersion).toHaveBeenCalledWith('p1', 2, { note: 'n' });
    expect(res.json).toHaveBeenCalledWith({ v: 1 });
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.updateProcedureVersion.mockRejectedValue('boom');
    const res = makeRes();
    await Service.update_version(makeArgs({ procedure_id: 'p1', version: 2, version_meta_data: {} }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when updating meta data of a procedure version', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureVersionsService.update_version_status', () => {
  test('updates the version status', async () => {
    procedure_funcs.updateProcedureVersionStatus.mockResolvedValue({ v: 1 });
    const res = makeRes();
    await Service.update_version_status(makeArgs({ procedure_id: 'p1', version: 2, version_status_input: { status: 'RELEASED' } }), res, makeNext());
    expect(procedure_funcs.updateProcedureVersionStatus).toHaveBeenCalledWith('p1', 2, { status: 'RELEASED' });
    expect(res.json).toHaveBeenCalledWith({ v: 1 });
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.updateProcedureVersionStatus.mockRejectedValue('boom');
    const res = makeRes();
    await Service.update_version_status(makeArgs({ procedure_id: 'p1', version: 2, version_status_input: {} }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when updating status of a procedure version', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
