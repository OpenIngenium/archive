'use strict';

jest.mock('../../../api/base_funcs');
jest.mock('../../../api/procedure_funcs');

const base_funcs = require('../../../api/base_funcs');
const procedure_funcs = require('../../../api/procedure_funcs');
const Service = require('../../../controllers/ProcedureFileService');
const { makeArgs, makeRes, makeNext } = require('../mocks/testHelpers');

beforeEach(() => {
  base_funcs.push_error.mockImplementation((msg, err) => ({ message: msg, err }));
});

describe('ProcedureFileService.procedure_element_upload_file', () => {
  test('checks versioning then uploads', async () => {
    procedure_funcs.checkElementVersioned.mockResolvedValue(undefined);
    procedure_funcs.addFile.mockResolvedValue({ id: 'f1' });
    const res = makeRes();
    await Service.procedure_element_upload_file(makeArgs({ elem_id: 'e1', file_metadata: { name: 'a' }, procedure_id: 'p1' }), res, makeNext());
    expect(procedure_funcs.checkElementVersioned).toHaveBeenCalledWith('p1', 'e1', 'Cannot modify element of versioned procedure');
    expect(procedure_funcs.addFile).toHaveBeenCalledWith('e1', { name: 'a' });
    expect(res.json).toHaveBeenCalledWith({ id: 'f1' });
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.checkElementVersioned.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_element_upload_file(makeArgs({ elem_id: 'e1', file_metadata: {}, procedure_id: 'p1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when adding a file to a procedure element', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureFileService.procedure_element_get_files', () => {
  test('returns files with total count header (provided pagination)', async () => {
    procedure_funcs.getFiles.mockResolvedValue({ total: 3, files: [{ id: 1 }] });
    const res = makeRes();
    await Service.procedure_element_get_files(makeArgs({ elem_id: 'e1', offset: 1, limit: 2, procedure_id: 'p1' }), res, makeNext());
    expect(procedure_funcs.getFiles).toHaveBeenCalledWith('e1', 1, 2);
    expect(res.set).toHaveBeenCalledWith('x-total-count', 3);
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
  });

  test('defaults pagination to undefined', async () => {
    procedure_funcs.getFiles.mockResolvedValue({ total: 0, files: [] });
    const res = makeRes();
    await Service.procedure_element_get_files(makeArgs({ elem_id: 'e1', offset: 0, limit: 0, procedure_id: 'p1' }), res, makeNext());
    expect(procedure_funcs.getFiles).toHaveBeenCalledWith('e1', undefined, undefined);
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.getFiles.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_element_get_files(makeArgs({ elem_id: 'e1', offset: 0, limit: 0, procedure_id: 'p1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting files from a procedure element', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureFileService.procedure_element_get_file', () => {
  test('returns the file', async () => {
    procedure_funcs.getFile.mockResolvedValue({ id: 'f1' });
    const res = makeRes();
    await Service.procedure_element_get_file(makeArgs({ elem_id: 'e1', file_id: 'f1', procedure_id: 'p1' }), res, makeNext());
    expect(procedure_funcs.getFile).toHaveBeenCalledWith('e1', 'f1');
    expect(res.json).toHaveBeenCalledWith({ id: 'f1' });
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.getFile.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_element_get_file(makeArgs({ elem_id: 'e1', file_id: 'f1', procedure_id: 'p1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting a file from a procedure element', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureFileService.procedure_element_delete_file', () => {
  test('checks versioning then deletes', async () => {
    procedure_funcs.checkElementVersioned.mockResolvedValue(undefined);
    procedure_funcs.deleteFile.mockResolvedValue({ ok: true });
    const res = makeRes();
    await Service.procedure_element_delete_file(makeArgs({ elem_id: 'e1', file_id: 'f1', procedure_id: 'p1' }), res, makeNext());
    expect(procedure_funcs.deleteFile).toHaveBeenCalledWith('e1', 'f1');
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.checkElementVersioned.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_element_delete_file(makeArgs({ elem_id: 'e1', file_id: 'f1', procedure_id: 'p1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when deleting a file from a procedure element', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureFileService.procedure_upload_file', () => {
  test('uploads a file to a procedure', async () => {
    procedure_funcs.addProcedureFile.mockResolvedValue({ id: 'f1' });
    const res = makeRes();
    await Service.procedure_upload_file(makeArgs({ file_metadata: { name: 'a' }, procedure_id: 'p1' }), res, makeNext());
    expect(procedure_funcs.addProcedureFile).toHaveBeenCalledWith('p1', { name: 'a' });
    expect(res.json).toHaveBeenCalledWith({ id: 'f1' });
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.addProcedureFile.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_upload_file(makeArgs({ file_metadata: {}, procedure_id: 'p1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when adding a file to a procedure', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureFileService.procedure_get_files', () => {
  test('returns files with total count header (provided pagination)', async () => {
    procedure_funcs.getProcedureFiles.mockResolvedValue({ total: 4, files: [{ id: 1 }] });
    const res = makeRes();
    await Service.procedure_get_files(makeArgs({ offset: 2, limit: 3, procedure_id: 'p1' }), res, makeNext());
    expect(procedure_funcs.getProcedureFiles).toHaveBeenCalledWith('p1', 2, 3);
    expect(res.set).toHaveBeenCalledWith('x-total-count', 4);
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
  });

  test('defaults pagination to undefined', async () => {
    procedure_funcs.getProcedureFiles.mockResolvedValue({ total: 0, files: [] });
    const res = makeRes();
    await Service.procedure_get_files(makeArgs({ offset: 0, limit: 0, procedure_id: 'p1' }), res, makeNext());
    expect(procedure_funcs.getProcedureFiles).toHaveBeenCalledWith('p1', undefined, undefined);
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.getProcedureFiles.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_get_files(makeArgs({ offset: 0, limit: 0, procedure_id: 'p1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting files from a procedure', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureFileService.procedure_get_file', () => {
  test('returns the file', async () => {
    procedure_funcs.getProcedureFile.mockResolvedValue({ id: 'f1' });
    const res = makeRes();
    await Service.procedure_get_file(makeArgs({ file_id: 'f1', procedure_id: 'p1' }), res, makeNext());
    expect(procedure_funcs.getProcedureFile).toHaveBeenCalledWith('p1', 'f1');
    expect(res.json).toHaveBeenCalledWith({ id: 'f1' });
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.getProcedureFile.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_get_file(makeArgs({ file_id: 'f1', procedure_id: 'p1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting a file from a procedure element', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureFileService.procedure_delete_file', () => {
  test('deletes the file', async () => {
    procedure_funcs.deleteProcedureFile.mockResolvedValue({ ok: true });
    const res = makeRes();
    await Service.procedure_delete_file(makeArgs({ procedure_id: 'p1', file_id: 'f1' }), res, makeNext());
    expect(procedure_funcs.deleteProcedureFile).toHaveBeenCalledWith('p1', 'f1');
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.deleteProcedureFile.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_delete_file(makeArgs({ procedure_id: 'p1', file_id: 'f1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when deleting a file from a procedure', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureFileService.procedure_element_post_comment_file', () => {
  test('adds a file to a comment', async () => {
    procedure_funcs.addFileComment.mockResolvedValue({ id: 'f1' });
    const res = makeRes();
    await Service.procedure_element_post_comment_file(makeArgs({ procedure_id: 'p1', elem_id: 'e1', conversation_id: 'c1', comment_id: 'm1', file_metadata: { name: 'a' } }), res, makeNext());
    expect(procedure_funcs.addFileComment).toHaveBeenCalledWith('p1', 'e1', 'c1', 'm1', { name: 'a' });
    expect(res.json).toHaveBeenCalledWith({ id: 'f1' });
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.addFileComment.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_element_post_comment_file(makeArgs({ procedure_id: 'p1', elem_id: 'e1', conversation_id: 'c1', comment_id: 'm1', file_metadata: {} }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when adding a file to a comment', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureFileService.procedure_element_get_comment_file', () => {
  test('returns a comment file', async () => {
    procedure_funcs.getCommentFile.mockResolvedValue({ id: 'f1' });
    const res = makeRes();
    await Service.procedure_element_get_comment_file(makeArgs({ procedure_id: 'p1', elem_id: 'e1', conversation_id: 'c1', comment_id: 'm1', file_id: 'f1' }), res, makeNext());
    expect(procedure_funcs.getCommentFile).toHaveBeenCalledWith('p1', 'e1', 'c1', 'm1', 'f1');
    expect(res.json).toHaveBeenCalledWith({ id: 'f1' });
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.getCommentFile.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_element_get_comment_file(makeArgs({ procedure_id: 'p1', elem_id: 'e1', conversation_id: 'c1', comment_id: 'm1', file_id: 'f1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting a file of a comment', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureFileService.procedure_element_get_comment_files', () => {
  test('returns comment files with total count header (provided pagination)', async () => {
    procedure_funcs.getCommentFiles.mockResolvedValue({ total: 6, files: [{ id: 1 }] });
    const res = makeRes();
    await Service.procedure_element_get_comment_files(makeArgs({ procedure_id: 'p1', elem_id: 'e1', conversation_id: 'c1', comment_id: 'm1', offset: 1, limit: 2 }), res, makeNext());
    expect(procedure_funcs.getCommentFiles).toHaveBeenCalledWith('p1', 'e1', 'c1', 'm1', 1, 2);
    expect(res.set).toHaveBeenCalledWith('x-total-count', 6);
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
  });

  test('defaults pagination to undefined', async () => {
    procedure_funcs.getCommentFiles.mockResolvedValue({ total: 0, files: [] });
    const res = makeRes();
    await Service.procedure_element_get_comment_files(makeArgs({ procedure_id: 'p1', elem_id: 'e1', conversation_id: 'c1', comment_id: 'm1', offset: 0, limit: 0 }), res, makeNext());
    expect(procedure_funcs.getCommentFiles).toHaveBeenCalledWith('p1', 'e1', 'c1', 'm1', undefined, undefined);
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.getCommentFiles.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_element_get_comment_files(makeArgs({ procedure_id: 'p1', elem_id: 'e1', conversation_id: 'c1', comment_id: 'm1', offset: 0, limit: 0 }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting files of a comment', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureFileService.procedure_element_delete_comment_file', () => {
  test('deletes a comment file', async () => {
    procedure_funcs.deleteCommentFile.mockResolvedValue({ ok: true });
    const res = makeRes();
    await Service.procedure_element_delete_comment_file(makeArgs({ procedure_id: 'p1', elem_id: 'e1', comment_id: 'm1', conversation_id: 'c1', file_id: 'f1' }), res, makeNext());
    expect(procedure_funcs.deleteCommentFile).toHaveBeenCalledWith('p1', 'e1', 'c1', 'm1', 'f1');
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.deleteCommentFile.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_element_delete_comment_file(makeArgs({ procedure_id: 'p1', elem_id: 'e1', comment_id: 'm1', conversation_id: 'c1', file_id: 'f1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when deleting a file from a comment', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
