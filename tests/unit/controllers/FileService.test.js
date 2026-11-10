'use strict';

jest.mock('../../../api/base_funcs');
jest.mock('../../../api/node_funcs');

const base_funcs = require('../../../api/base_funcs');
const node_funcs = require('../../../api/node_funcs');
const Service = require('../../../controllers/FileService');
const { makeArgs, makeRes, makeNext } = require('../mocks/testHelpers');

beforeEach(() => {
  base_funcs.push_error.mockImplementation((msg, err) => ({ message: msg, err }));
});

describe('FileService.element_delete_file', () => {
  test('deletes an element file', async () => {
    node_funcs.deleteFile.mockResolvedValue({ ok: true });
    const res = makeRes();
    await Service.element_delete_file(makeArgs({ elem_id: 'e1', file_id: 'f1' }), res, makeNext());
    expect(node_funcs.deleteFile).toHaveBeenCalledWith('e1', 'f1');
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test('returns 400 on failure', async () => {
    node_funcs.deleteFile.mockRejectedValue('boom');
    const res = makeRes();
    await Service.element_delete_file(makeArgs({ elem_id: 'e1', file_id: 'f1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when deleting a file from an element', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('FileService.element_get_file', () => {
  test('returns the element file', async () => {
    node_funcs.getFile.mockResolvedValue({ id: 'f1' });
    const res = makeRes();
    await Service.element_get_file(makeArgs({ elem_id: 'e1', file_id: 'f1' }), res, makeNext());
    expect(node_funcs.getFile).toHaveBeenCalledWith('e1', 'f1');
    expect(res.json).toHaveBeenCalledWith({ id: 'f1' });
  });

  test('returns 400 on failure', async () => {
    node_funcs.getFile.mockRejectedValue('boom');
    const res = makeRes();
    await Service.element_get_file(makeArgs({ elem_id: 'e1', file_id: 'f1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting a file of an element', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('FileService.element_get_files', () => {
  test('returns files with total count header (provided pagination)', async () => {
    node_funcs.getFiles.mockResolvedValue({ total: 3, files: [{ id: 1 }] });
    const res = makeRes();
    await Service.element_get_files(makeArgs({ elem_id: 'e1', offset: 1, limit: 2 }), res, makeNext());
    expect(node_funcs.getFiles).toHaveBeenCalledWith('e1', 1, 2);
    expect(res.set).toHaveBeenCalledWith('x-total-count', 3);
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
  });

  test('defaults pagination to undefined', async () => {
    node_funcs.getFiles.mockResolvedValue({ total: 0, files: [] });
    const res = makeRes();
    await Service.element_get_files(makeArgs({ elem_id: 'e1', offset: 0, limit: 0 }), res, makeNext());
    expect(node_funcs.getFiles).toHaveBeenCalledWith('e1', undefined, undefined);
  });

  test('returns 400 on failure', async () => {
    node_funcs.getFiles.mockRejectedValue('boom');
    const res = makeRes();
    await Service.element_get_files(makeArgs({ elem_id: 'e1', offset: 0, limit: 0 }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting files of an element', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('FileService.element_upload_file', () => {
  test('uploads a file to an element', async () => {
    node_funcs.addFile.mockResolvedValue({ id: 'f1' });
    const res = makeRes();
    await Service.element_upload_file(makeArgs({ elem_id: 'e1', file_metadata: { name: 'a' } }), res, makeNext());
    expect(node_funcs.addFile).toHaveBeenCalledWith('e1', { name: 'a' });
    expect(res.json).toHaveBeenCalledWith({ id: 'f1' });
  });

  test('returns 400 on failure', async () => {
    node_funcs.addFile.mockRejectedValue('boom');
    const res = makeRes();
    await Service.element_upload_file(makeArgs({ elem_id: 'e1', file_metadata: {} }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when uploading file for an element', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('FileService.execution_delete_file', () => {
  test('deletes an execution file', async () => {
    node_funcs.deleteExecFile.mockResolvedValue({ ok: true });
    const res = makeRes();
    await Service.execution_delete_file(makeArgs({ execution_id: 'x1', file_id: 'f1' }), res, makeNext());
    expect(node_funcs.deleteExecFile).toHaveBeenCalledWith('x1', 'f1');
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test('returns 400 on failure', async () => {
    node_funcs.deleteExecFile.mockRejectedValue('boom');
    const res = makeRes();
    await Service.execution_delete_file(makeArgs({ execution_id: 'x1', file_id: 'f1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when deleting a file from an execution', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('FileService.execution_get_file', () => {
  test('returns the execution file', async () => {
    node_funcs.getExecFile.mockResolvedValue({ id: 'f1' });
    const res = makeRes();
    await Service.execution_get_file(makeArgs({ execution_id: 'x1', file_id: 'f1' }), res, makeNext());
    expect(node_funcs.getExecFile).toHaveBeenCalledWith('x1', 'f1');
    expect(res.json).toHaveBeenCalledWith({ id: 'f1' });
  });

  test('returns 400 on failure', async () => {
    node_funcs.getExecFile.mockRejectedValue('boom');
    const res = makeRes();
    await Service.execution_get_file(makeArgs({ execution_id: 'x1', file_id: 'f1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting a file of an execution', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('FileService.execution_get_files', () => {
  test('returns files with total count header (provided pagination)', async () => {
    node_funcs.getExecFiles.mockResolvedValue({ total: 4, files: [{ id: 1 }] });
    const res = makeRes();
    await Service.execution_get_files(makeArgs({ execution_id: 'x1', offset: 2, limit: 3 }), res, makeNext());
    expect(node_funcs.getExecFiles).toHaveBeenCalledWith('x1', 2, 3);
    expect(res.set).toHaveBeenCalledWith('x-total-count', 4);
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
  });

  test('defaults pagination to undefined', async () => {
    node_funcs.getExecFiles.mockResolvedValue({ total: 0, files: [] });
    const res = makeRes();
    await Service.execution_get_files(makeArgs({ execution_id: 'x1', offset: 0, limit: 0 }), res, makeNext());
    expect(node_funcs.getExecFiles).toHaveBeenCalledWith('x1', undefined, undefined);
  });

  test('returns 400 on failure', async () => {
    node_funcs.getExecFiles.mockRejectedValue('boom');
    const res = makeRes();
    await Service.execution_get_files(makeArgs({ execution_id: 'x1', offset: 0, limit: 0 }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting files of an execution', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('FileService.execution_upload_file', () => {
  test('uploads a file to an execution', async () => {
    node_funcs.addFileExec.mockResolvedValue({ id: 'f1' });
    const res = makeRes();
    await Service.execution_upload_file(makeArgs({ execution_id: 'x1', file_metadata: { name: 'a' } }), res, makeNext());
    expect(node_funcs.addFileExec).toHaveBeenCalledWith('x1', { name: 'a' });
    expect(res.json).toHaveBeenCalledWith({ id: 'f1' });
  });

  test('returns 400 on failure', async () => {
    node_funcs.addFileExec.mockRejectedValue('boom');
    const res = makeRes();
    await Service.execution_upload_file(makeArgs({ execution_id: 'x1', file_metadata: {} }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting files of an execution', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('FileService.element_post_comment_file', () => {
  test('adds a file to a comment', async () => {
    node_funcs.addFileComment.mockResolvedValue({ id: 'f1' });
    const res = makeRes();
    await Service.element_post_comment_file(makeArgs({ execution_id: 'x1', elem_id: 'e1', conversation_id: 'c1', comment_id: 'm1', file_metadata: { name: 'a' } }), res, makeNext());
    expect(node_funcs.addFileComment).toHaveBeenCalledWith('x1', 'e1', 'c1', 'm1', { name: 'a' });
    expect(res.json).toHaveBeenCalledWith({ id: 'f1' });
  });

  test('returns 400 on failure', async () => {
    node_funcs.addFileComment.mockRejectedValue('boom');
    const res = makeRes();
    await Service.element_post_comment_file(makeArgs({ execution_id: 'x1', elem_id: 'e1', conversation_id: 'c1', comment_id: 'm1', file_metadata: {} }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when adding a file to a comment', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('FileService.element_get_comment_file', () => {
  test('returns a comment file', async () => {
    node_funcs.getCommentFile.mockResolvedValue({ id: 'f1' });
    const res = makeRes();
    await Service.element_get_comment_file(makeArgs({ execution_id: 'x1', elem_id: 'e1', conversation_id: 'c1', comment_id: 'm1', file_id: 'f1' }), res, makeNext());
    expect(node_funcs.getCommentFile).toHaveBeenCalledWith('x1', 'e1', 'c1', 'm1', 'f1');
    expect(res.json).toHaveBeenCalledWith({ id: 'f1' });
  });

  test('returns 400 on failure', async () => {
    node_funcs.getCommentFile.mockRejectedValue('boom');
    const res = makeRes();
    await Service.element_get_comment_file(makeArgs({ execution_id: 'x1', elem_id: 'e1', conversation_id: 'c1', comment_id: 'm1', file_id: 'f1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting a file of a comment', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('FileService.element_get_comment_files', () => {
  test('returns comment files with total count header (provided pagination)', async () => {
    node_funcs.getCommentFiles.mockResolvedValue({ total: 6, files: [{ id: 1 }] });
    const res = makeRes();
    await Service.element_get_comment_files(makeArgs({ execution_id: 'x1', elem_id: 'e1', conversation_id: 'c1', comment_id: 'm1', offset: 1, limit: 2 }), res, makeNext());
    expect(node_funcs.getCommentFiles).toHaveBeenCalledWith('x1', 'e1', 'c1', 'm1', 1, 2);
    expect(res.set).toHaveBeenCalledWith('x-total-count', 6);
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
  });

  test('defaults pagination to undefined', async () => {
    node_funcs.getCommentFiles.mockResolvedValue({ total: 0, files: [] });
    const res = makeRes();
    await Service.element_get_comment_files(makeArgs({ execution_id: 'x1', elem_id: 'e1', conversation_id: 'c1', comment_id: 'm1', offset: 0, limit: 0 }), res, makeNext());
    expect(node_funcs.getCommentFiles).toHaveBeenCalledWith('x1', 'e1', 'c1', 'm1', undefined, undefined);
  });

  test('returns 400 on failure', async () => {
    node_funcs.getCommentFiles.mockRejectedValue('boom');
    const res = makeRes();
    await Service.element_get_comment_files(makeArgs({ execution_id: 'x1', elem_id: 'e1', conversation_id: 'c1', comment_id: 'm1', offset: 0, limit: 0 }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting files of a comment', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('FileService.element_delete_comment_file', () => {
  test('deletes a comment file', async () => {
    node_funcs.deleteCommentFile.mockResolvedValue({ ok: true });
    const res = makeRes();
    await Service.element_delete_comment_file(makeArgs({ execution_id: 'x1', elem_id: 'e1', comment_id: 'm1', conversation_id: 'c1', file_id: 'f1' }), res, makeNext());
    expect(node_funcs.deleteCommentFile).toHaveBeenCalledWith('x1', 'e1', 'c1', 'm1', 'f1');
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test('returns 400 on failure', async () => {
    node_funcs.deleteCommentFile.mockRejectedValue('boom');
    const res = makeRes();
    await Service.element_delete_comment_file(makeArgs({ execution_id: 'x1', elem_id: 'e1', comment_id: 'm1', conversation_id: 'c1', file_id: 'f1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when deleting a file from a comment', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
