'use strict';

jest.mock('../../../api/base_funcs');
jest.mock('../../../api/node_funcs');
jest.mock('../../../api/procedure_funcs');

const base_funcs = require('../../../api/base_funcs');
const node_funcs = require('../../../api/node_funcs');
const procedure_funcs = require('../../../api/procedure_funcs');
const Service = require('../../../controllers/ProceduresService');
const { makeArgs, makeRes, makeNext } = require('../mocks/testHelpers');

beforeEach(() => {
  base_funcs.push_error.mockImplementation((msg, err) => ({ message: msg, err }));
  base_funcs.sanitize_internal_attrs.mockImplementation((x) => x);
});

// The six optional filters use a (hasOwnProperty('value') && value !== undefined) guard.
const TERNARY_KEYS = ['versioned', 'procedure_type', 'hazardous', 'label', 'released', 'obsolete'];

function buildGetProceduresArgs(base, ternaryShape) {
  const args = makeArgs(base);
  for (const key of TERNARY_KEYS) {
    args[key] = ternaryShape(key);
  }
  return args;
}

describe('ProceduresService.get_procedures', () => {
  const baseProvided = {
    offset: 5, limit: 20, title: 't', description: 'd', procedure_id: 'p',
    institutional_id: 'i', author: 'a', sort: 'ASC', sort_by: 'TIME_SAVED'
  };
  const baseDefaults = {
    offset: 0, limit: 0, title: null, description: null, procedure_id: null,
    institutional_id: null, author: null, sort: null, sort_by: null
  };

  test('passes provided filters and lowercases sort_by', async () => {
    procedure_funcs.getProcedures.mockResolvedValue({ total_count: 3, data: [{ id: 1 }] });
    const res = makeRes();
    const args = buildGetProceduresArgs(baseProvided, () => ({ value: true }));
    args.obsolete = { value: false };
    await Service.get_procedures(args, res, makeNext());
    expect(procedure_funcs.getProcedures).toHaveBeenCalledWith(
      5, 20, 't', 'd', 'p', 'i', 'a', true, true, true, true, true, false, 'ASC', 'time_saved'
    );
    expect(res.set).toHaveBeenCalledWith('x-total-count', 3);
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
  });

  test('defaults to null when filter args have no value property', async () => {
    procedure_funcs.getProcedures.mockResolvedValue({ data: [] });
    const res = makeRes();
    const args = buildGetProceduresArgs(baseDefaults, () => ({}));
    await Service.get_procedures(args, res, makeNext());
    expect(procedure_funcs.getProcedures).toHaveBeenCalledWith(
      0, 50, null, null, null, null, null, null, null, null, null, null, null, 'DESC', 'time_created'
    );
    expect(res.set).toHaveBeenCalledWith('x-total-count', 0);
  });

  test('defaults to null when filter values are undefined', async () => {
    procedure_funcs.getProcedures.mockResolvedValue({ total_count: 0, data: [] });
    const res = makeRes();
    const args = buildGetProceduresArgs(baseDefaults, () => ({ value: undefined }));
    await Service.get_procedures(args, res, makeNext());
    expect(procedure_funcs.getProcedures).toHaveBeenCalledWith(
      0, 50, null, null, null, null, null, null, null, null, null, null, null, 'DESC', 'time_created'
    );
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.getProcedures.mockRejectedValue('boom');
    const res = makeRes();
    const args = buildGetProceduresArgs(baseDefaults, () => ({}));
    await Service.get_procedures(args, res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting procedures', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProceduresService.import_procedure_versions', () => {
  test('imports procedure versions', async () => {
    procedure_funcs.importProcedureVersions.mockResolvedValue({ ok: true });
    const res = makeRes();
    await Service.import_procedure_versions(makeArgs({ import_input: { a: 1 } }), res, makeNext());
    expect(procedure_funcs.importProcedureVersions).toHaveBeenCalledWith({ a: 1 });
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.importProcedureVersions.mockRejectedValue('boom');
    const res = makeRes();
    await Service.import_procedure_versions(makeArgs({ import_input: {} }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when importing procedure', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProceduresService.create_procedure', () => {
  test('creates a procedure', async () => {
    procedure_funcs.createProcedure.mockResolvedValue({ id: 'p1' });
    const res = makeRes();
    await Service.create_procedure(makeArgs({ procedure: { title: 't' } }), res, makeNext());
    expect(procedure_funcs.createProcedure).toHaveBeenCalledWith({ title: 't' });
    expect(res.json).toHaveBeenCalledWith({ id: 'p1' });
  });

  test('defaults procedure to null when value is falsy', async () => {
    procedure_funcs.createProcedure.mockResolvedValue({ id: 'p1' });
    const res = makeRes();
    await Service.create_procedure(makeArgs({ procedure: null }), res, makeNext());
    expect(procedure_funcs.createProcedure).toHaveBeenCalledWith(null);
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.createProcedure.mockRejectedValue('boom');
    const res = makeRes();
    await Service.create_procedure(makeArgs({ procedure: {} }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when creating a procedure', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProceduresService.get_procedure', () => {
  test('returns the sanitized procedure', async () => {
    procedure_funcs.getProcedure.mockResolvedValue({ id: 'p1', _key: '1' });
    const res = makeRes();
    await Service.get_procedure(makeArgs({ procedure_id: 'p1' }), res, makeNext());
    expect(base_funcs.sanitize_internal_attrs).toHaveBeenCalledWith({ id: 'p1', _key: '1' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.getProcedure.mockRejectedValue('boom');
    const res = makeRes();
    await Service.get_procedure(makeArgs({ procedure_id: 'p1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting a procedure', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProceduresService.update_procedure', () => {
  test('updates and returns 204', async () => {
    procedure_funcs.updateProcedure.mockResolvedValue({});
    const res = makeRes();
    await Service.update_procedure(makeArgs({ procedure_id: 'p1', procedure_meta_data: { a: 1 } }), res, makeNext());
    expect(procedure_funcs.updateProcedure).toHaveBeenCalledWith('p1', { a: 1 });
    expect(res.status).toHaveBeenCalledWith(204);
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.updateProcedure.mockRejectedValue('boom');
    const res = makeRes();
    await Service.update_procedure(makeArgs({ procedure_id: 'p1', procedure_meta_data: {} }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when updating procedure meta data', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProceduresService.delete_procedure', () => {
  test('deletes and returns 204', async () => {
    procedure_funcs.deleteProcedure.mockResolvedValue({});
    const res = makeRes();
    await Service.delete_procedure(makeArgs({ procedure_id: 'p1' }), res, makeNext());
    expect(procedure_funcs.deleteProcedure).toHaveBeenCalledWith('p1');
    expect(res.status).toHaveBeenCalledWith(204);
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.deleteProcedure.mockRejectedValue('boom');
    const res = makeRes();
    await Service.delete_procedure(makeArgs({ procedure_id: 'p1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when deleting a procedure', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProceduresService.delete_procedure_label', () => {
  test('deletes and returns 204', async () => {
    procedure_funcs.deleteProcedureLabel.mockResolvedValue({});
    const res = makeRes();
    await Service.delete_procedure_label(makeArgs({ label_id: 'l1' }), res, makeNext());
    expect(procedure_funcs.deleteProcedureLabel).toHaveBeenCalledWith('l1');
    expect(res.status).toHaveBeenCalledWith(204);
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.deleteProcedureLabel.mockRejectedValue('boom');
    const res = makeRes();
    await Service.delete_procedure_label(makeArgs({ label_id: 'l1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when deleting a procedure', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProceduresService.create_procedure_label', () => {
  test('creates a label', async () => {
    procedure_funcs.createProcedureLabel.mockResolvedValue({ id: 'l1' });
    const res = makeRes();
    await Service.create_procedure_label(makeArgs({ procedure_label: { name: 'n' } }), res, makeNext());
    expect(procedure_funcs.createProcedureLabel).toHaveBeenCalledWith({ name: 'n' });
    expect(res.json).toHaveBeenCalledWith({ id: 'l1' });
  });

  test('defaults label to null when value is falsy', async () => {
    procedure_funcs.createProcedureLabel.mockResolvedValue({ id: 'l1' });
    const res = makeRes();
    await Service.create_procedure_label(makeArgs({ procedure_label: null }), res, makeNext());
    expect(procedure_funcs.createProcedureLabel).toHaveBeenCalledWith(null);
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.createProcedureLabel.mockRejectedValue('boom');
    const res = makeRes();
    await Service.create_procedure_label(makeArgs({ procedure_label: {} }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when creating a procedure', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProceduresService.get_procedure_labels', () => {
  test('passes provided filters and sets total count header', async () => {
    node_funcs.getProcedureLabels.mockResolvedValue({ total_count: 4, data: [{ id: 1 }] });
    const res = makeRes();
    await Service.get_procedure_labels(makeArgs({ procedure_label_name: 'n', description: 'd', offset: 2, limit: 5, sort: 'ASC' }), res, makeNext());
    expect(node_funcs.getProcedureLabels).toHaveBeenCalledWith(2, 5, 'ASC', 'n', 'd');
    expect(res.set).toHaveBeenCalledWith('x-total-count', 4);
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
  });

  test('uses defaults when args are falsy', async () => {
    node_funcs.getProcedureLabels.mockResolvedValue({ data: [] });
    const res = makeRes();
    await Service.get_procedure_labels(makeArgs({ procedure_label_name: null, description: null, offset: 0, limit: 0, sort: null }), res, makeNext());
    expect(node_funcs.getProcedureLabels).toHaveBeenCalledWith(0, 50, 'DESC', null, null);
    expect(res.set).toHaveBeenCalledWith('x-total-count', 0);
  });

  test('returns 400 on failure', async () => {
    node_funcs.getProcedureLabels.mockRejectedValue('boom');
    const res = makeRes();
    await Service.get_procedure_labels(makeArgs({ procedure_label_name: null, description: null, offset: 0, limit: 0, sort: null }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting procedures', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
