'use strict';

jest.mock('../../../api/base_funcs');
jest.mock('../../../api/procedure_funcs');

const base_funcs = require('../../../api/base_funcs');
const procedure_funcs = require('../../../api/procedure_funcs');
const Service = require('../../../controllers/ProcedureCommentService');
const { makeArgs, makeRes, makeNext } = require('../mocks/testHelpers');

const HEADERS = { authorization: 'Bearer token' };

beforeEach(() => {
  base_funcs.push_error.mockImplementation((msg, err) => ({ message: msg, err }));
  base_funcs.getUserName.mockReturnValue('alice');
});

describe('ProcedureCommentService.procedure_element_add_conversation', () => {
  test('checks the working copy then adds a conversation', async () => {
    procedure_funcs.checkElementNotVersioned.mockResolvedValue(undefined);
    procedure_funcs.addConversation.mockResolvedValue({ id: 'c1' });
    const res = makeRes();
    await Service.procedure_element_add_conversation(makeArgs({ procedure_id: 'p1', version: 2, elem_id: 'e1', conversation: { a: 1 } }), res, makeNext(), HEADERS);
    expect(procedure_funcs.checkElementNotVersioned).toHaveBeenCalledWith('p1', 'e1', 'Cannot add comment to a working copy of procedure');
    expect(procedure_funcs.addConversation).toHaveBeenCalledWith('p1', 2, 'e1', { a: 1 }, 'alice');
    expect(res.json).toHaveBeenCalledWith({ id: 'c1' });
  });

  test('returns 400 on failure', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    procedure_funcs.checkElementNotVersioned.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_element_add_conversation(makeArgs({ procedure_id: 'p1', version: 2, elem_id: 'e1', conversation: {} }), res, makeNext(), HEADERS);
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when adding a conversation', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
    spy.mockRestore();
  });
});

describe('ProcedureCommentService.procedure_element_get_conversations', () => {
  test('sets total count header when data is present', async () => {
    procedure_funcs.getConversations.mockResolvedValue({ total: 5, conversations: [{ id: 1 }] });
    const res = makeRes();
    await Service.procedure_element_get_conversations(makeArgs({ procedure_id: 'p1', elem_id: 'e1', offset: 2, limit: 3 }), res, makeNext(), HEADERS);
    expect(procedure_funcs.getConversations).toHaveBeenCalledWith('p1', 'e1', 2, 3);
    expect(res.set).toHaveBeenCalledWith('x-total-count', 5);
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
  });

  test('defaults offset/limit to undefined and total to 0', async () => {
    procedure_funcs.getConversations.mockResolvedValue({ conversations: [] });
    const res = makeRes();
    await Service.procedure_element_get_conversations(makeArgs({ procedure_id: 'p1', elem_id: 'e1', offset: 0, limit: 0 }), res, makeNext(), HEADERS);
    expect(procedure_funcs.getConversations).toHaveBeenCalledWith('p1', 'e1', undefined, undefined);
    expect(res.set).toHaveBeenCalledWith('x-total-count', 0);
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.getConversations.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_element_get_conversations(makeArgs({ procedure_id: 'p1', elem_id: 'e1', offset: 0, limit: 0 }), res, makeNext(), HEADERS);
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting conversations', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureCommentService.procedure_element_get_conversation', () => {
  test('returns the conversation', async () => {
    procedure_funcs.getConversation.mockResolvedValue({ id: 'c1' });
    const res = makeRes();
    await Service.procedure_element_get_conversation(makeArgs({ procedure_id: 'p1', elem_id: 'e1', conversation_id: 'c1' }), res, makeNext());
    expect(procedure_funcs.getConversation).toHaveBeenCalledWith('p1', 'e1', 'c1');
    expect(res.json).toHaveBeenCalledWith({ id: 'c1' });
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.getConversation.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_element_get_conversation(makeArgs({ procedure_id: 'p1', elem_id: 'e1', conversation_id: 'c1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting a conversation', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureCommentService.procedure_element_update_conversation', () => {
  test('updates the conversation', async () => {
    procedure_funcs.updateConversation.mockResolvedValue({ id: 'c1' });
    const res = makeRes();
    await Service.procedure_element_update_conversation(makeArgs({ procedure_id: 'p1', version: 2, elem_id: 'e1', conversation_id: 'c1', conversation: { a: 1 } }), res, makeNext(), HEADERS);
    expect(procedure_funcs.updateConversation).toHaveBeenCalledWith('p1', 2, 'e1', 'c1', { a: 1 }, 'alice');
    expect(res.json).toHaveBeenCalledWith({ id: 'c1' });
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.updateConversation.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_element_update_conversation(makeArgs({ procedure_id: 'p1', version: 2, elem_id: 'e1', conversation_id: 'c1', conversation: {} }), res, makeNext(), HEADERS);
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when updating a conversation', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureCommentService.procedure_element_delete_conversation', () => {
  test('deletes and returns 204', async () => {
    procedure_funcs.deleteConversation.mockResolvedValue({});
    const res = makeRes();
    await Service.procedure_element_delete_conversation(makeArgs({ procedure_id: 'p1', version: 2, elem_id: 'e1', conversation_id: 'c1' }), res, makeNext());
    expect(procedure_funcs.deleteConversation).toHaveBeenCalledWith('p1', 2, 'e1', 'c1');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalledTimes(1);
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.deleteConversation.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_element_delete_conversation(makeArgs({ procedure_id: 'p1', version: 2, elem_id: 'e1', conversation_id: 'c1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when deleting a conversation', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureCommentService.procedure_element_add_comment', () => {
  test('adds a comment', async () => {
    procedure_funcs.addComment.mockResolvedValue({ id: 'm1' });
    const res = makeRes();
    await Service.procedure_element_add_comment(makeArgs({ procedure_id: 'p1', elem_id: 'e1', conversation_id: 'c1', comment: { a: 1 } }), res, makeNext(), HEADERS);
    expect(procedure_funcs.addComment).toHaveBeenCalledWith('p1', 'e1', 'c1', { a: 1 }, 'alice');
    expect(res.json).toHaveBeenCalledWith({ id: 'm1' });
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.addComment.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_element_add_comment(makeArgs({ procedure_id: 'p1', elem_id: 'e1', conversation_id: 'c1', comment: {} }), res, makeNext(), HEADERS);
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when adding a comment', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureCommentService.procedure_element_get_comments', () => {
  test('sets total count header when data is present', async () => {
    procedure_funcs.getComments.mockResolvedValue({ total: 2, comments: [{ id: 1 }] });
    const res = makeRes();
    await Service.procedure_element_get_comments(makeArgs({ procedure_id: 'p1', elem_id: 'e1', conversation_id: 'c1', offset: 1, limit: 2 }), res, makeNext());
    expect(procedure_funcs.getComments).toHaveBeenCalledWith('p1', 'e1', 'c1', 1, 2);
    expect(res.set).toHaveBeenCalledWith('x-total-count', 2);
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
  });

  test('defaults offset/limit to undefined and total to 0', async () => {
    procedure_funcs.getComments.mockResolvedValue({ comments: [] });
    const res = makeRes();
    await Service.procedure_element_get_comments(makeArgs({ procedure_id: 'p1', elem_id: 'e1', conversation_id: 'c1', offset: 0, limit: 0 }), res, makeNext());
    expect(procedure_funcs.getComments).toHaveBeenCalledWith('p1', 'e1', 'c1', undefined, undefined);
    expect(res.set).toHaveBeenCalledWith('x-total-count', 0);
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.getComments.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_element_get_comments(makeArgs({ procedure_id: 'p1', elem_id: 'e1', conversation_id: 'c1', offset: 0, limit: 0 }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting comments', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureCommentService.procedure_element_get_comment', () => {
  test('returns the comment', async () => {
    procedure_funcs.getComment.mockResolvedValue({ id: 'm1' });
    const res = makeRes();
    await Service.procedure_element_get_comment(makeArgs({ procedure_id: 'p1', elem_id: 'e1', conversation_id: 'c1', comment_id: 'm1' }), res, makeNext());
    expect(procedure_funcs.getComment).toHaveBeenCalledWith('p1', 'e1', 'c1', 'm1');
    expect(res.json).toHaveBeenCalledWith({ id: 'm1' });
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.getComment.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_element_get_comment(makeArgs({ procedure_id: 'p1', elem_id: 'e1', conversation_id: 'c1', comment_id: 'm1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting a comment', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureCommentService.procedure_element_update_comment', () => {
  test('updates the comment', async () => {
    procedure_funcs.updateComment.mockResolvedValue({ id: 'm1' });
    const res = makeRes();
    await Service.procedure_element_update_comment(makeArgs({ procedure_id: 'p1', elem_id: 'e1', conversation_id: 'c1', comment_id: 'm1', comment: { a: 1 } }), res, makeNext(), HEADERS);
    expect(procedure_funcs.updateComment).toHaveBeenCalledWith('p1', 'e1', 'c1', 'm1', { a: 1 }, 'alice');
    expect(res.json).toHaveBeenCalledWith({ id: 'm1' });
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.updateComment.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_element_update_comment(makeArgs({ procedure_id: 'p1', elem_id: 'e1', conversation_id: 'c1', comment_id: 'm1', comment: {} }), res, makeNext(), HEADERS);
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when updating a comment', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('ProcedureCommentService.procedure_element_delete_comment', () => {
  test('deletes and returns 204', async () => {
    procedure_funcs.deleteComment.mockResolvedValue({});
    const res = makeRes();
    await Service.procedure_element_delete_comment(makeArgs({ procedure_id: 'p1', elem_id: 'e1', conversation_id: 'c1', comment_id: 'm1' }), res, makeNext());
    expect(procedure_funcs.deleteComment).toHaveBeenCalledWith('p1', 'e1', 'c1', 'm1');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalledTimes(1);
  });

  test('returns 400 on failure', async () => {
    procedure_funcs.deleteComment.mockRejectedValue('boom');
    const res = makeRes();
    await Service.procedure_element_delete_comment(makeArgs({ procedure_id: 'p1', elem_id: 'e1', conversation_id: 'c1', comment_id: 'm1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when deleting a comment', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
