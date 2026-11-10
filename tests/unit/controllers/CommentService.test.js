'use strict';

jest.mock('../../../api/base_funcs');
jest.mock('../../../api/node_funcs');

const base_funcs = require('../../../api/base_funcs');
const node_funcs = require('../../../api/node_funcs');
const Service = require('../../../controllers/CommentService');
const { makeArgs, makeRes, makeNext } = require('../mocks/testHelpers');

const HEADERS = { authorization: 'Bearer token' };

beforeEach(() => {
  base_funcs.push_error.mockImplementation((msg, err) => ({ message: msg, err }));
  base_funcs.getUserName.mockReturnValue('alice');
});

describe('CommentService.element_add_conversation', () => {
  test('adds a conversation using the resolved user name', async () => {
    node_funcs.addConversation.mockResolvedValue({ conversation_id: 'c1' });
    const res = makeRes();
    await Service.element_add_conversation(makeArgs({ execution_id: 'x1', elem_id: 'e1', conversation: { a: 1 } }), res, makeNext(), HEADERS);
    expect(base_funcs.getUserName).toHaveBeenCalledWith('Bearer token');
    expect(node_funcs.addConversation).toHaveBeenCalledWith('x1', 'e1', { a: 1 }, 'alice');
    expect(res.json).toHaveBeenCalledWith({ conversation_id: 'c1' });
  });

  test('returns 400 on failure', async () => {
    node_funcs.addConversation.mockRejectedValue('boom');
    const res = makeRes();
    await Service.element_add_conversation(makeArgs({ execution_id: 'x1', elem_id: 'e1', conversation: {} }), res, makeNext(), HEADERS);
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when adding a conversation', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('CommentService.element_get_conversations', () => {
  test('sets total count header when data is present', async () => {
    node_funcs.getConversations.mockResolvedValue({ total: 5, conversations: [{ id: 1 }] });
    const res = makeRes();
    await Service.element_get_conversations(makeArgs({ execution_id: 'x1', elem_id: 'e1', offset: 2, limit: 3 }), res, makeNext(), HEADERS);
    expect(node_funcs.getConversations).toHaveBeenCalledWith('x1', 'e1', 2, 3);
    expect(res.set).toHaveBeenCalledWith('x-total-count', 5);
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
  });

  test('defaults offset/limit to undefined and total to 0', async () => {
    node_funcs.getConversations.mockResolvedValue({ conversations: [] });
    const res = makeRes();
    await Service.element_get_conversations(makeArgs({ execution_id: 'x1', elem_id: 'e1', offset: 0, limit: 0 }), res, makeNext(), HEADERS);
    expect(node_funcs.getConversations).toHaveBeenCalledWith('x1', 'e1', undefined, undefined);
    expect(res.set).toHaveBeenCalledWith('x-total-count', 0);
  });

  test('returns 400 on failure', async () => {
    node_funcs.getConversations.mockRejectedValue('boom');
    const res = makeRes();
    await Service.element_get_conversations(makeArgs({ execution_id: 'x1', elem_id: 'e1', offset: 0, limit: 0 }), res, makeNext(), HEADERS);
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting conversations', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('CommentService.element_get_conversation', () => {
  test('returns the conversation', async () => {
    node_funcs.getConversation.mockResolvedValue({ id: 'c1' });
    const res = makeRes();
    await Service.element_get_conversation(makeArgs({ execution_id: 'x1', elem_id: 'e1', conversation_id: 'c1' }), res, makeNext());
    expect(node_funcs.getConversation).toHaveBeenCalledWith('x1', 'e1', 'c1');
    expect(res.json).toHaveBeenCalledWith({ id: 'c1' });
  });

  test('returns 400 on failure', async () => {
    node_funcs.getConversation.mockRejectedValue('boom');
    const res = makeRes();
    await Service.element_get_conversation(makeArgs({ execution_id: 'x1', elem_id: 'e1', conversation_id: 'c1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting a comment', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('CommentService.element_update_conversation', () => {
  test('updates the conversation', async () => {
    node_funcs.updateConversation.mockResolvedValue({ id: 'c1' });
    const res = makeRes();
    await Service.element_update_conversation(makeArgs({ execution_id: 'x1', elem_id: 'e1', conversation_id: 'c1', conversation: { a: 1 } }), res, makeNext(), HEADERS);
    expect(node_funcs.updateConversation).toHaveBeenCalledWith('x1', 'e1', 'c1', { a: 1 }, 'alice');
    expect(res.json).toHaveBeenCalledWith({ id: 'c1' });
  });

  test('returns 400 on failure', async () => {
    node_funcs.updateConversation.mockRejectedValue('boom');
    const res = makeRes();
    await Service.element_update_conversation(makeArgs({ execution_id: 'x1', elem_id: 'e1', conversation_id: 'c1', conversation: {} }), res, makeNext(), HEADERS);
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when updating a conversation', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('CommentService.element_delete_conversation', () => {
  test('deletes and returns 204', async () => {
    node_funcs.deleteConversation.mockResolvedValue({});
    const res = makeRes();
    await Service.element_delete_conversation(makeArgs({ execution_id: 'x1', elem_id: 'e1', conversation_id: 'c1' }), res, makeNext());
    expect(node_funcs.deleteConversation).toHaveBeenCalledWith('x1', 'e1', 'c1');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalledTimes(1);
  });

  test('returns 400 on failure', async () => {
    node_funcs.deleteConversation.mockRejectedValue('boom');
    const res = makeRes();
    await Service.element_delete_conversation(makeArgs({ execution_id: 'x1', elem_id: 'e1', conversation_id: 'c1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when deleting a comment', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('CommentService.element_add_comment', () => {
  test('adds a comment', async () => {
    node_funcs.addComment.mockResolvedValue({ comment_id: 'm1' });
    const res = makeRes();
    await Service.element_add_comment(makeArgs({ execution_id: 'x1', elem_id: 'e1', conversation_id: 'c1', comment: { a: 1 } }), res, makeNext(), HEADERS);
    expect(node_funcs.addComment).toHaveBeenCalledWith('x1', 'e1', 'c1', { a: 1 }, 'alice');
    expect(res.json).toHaveBeenCalledWith({ comment_id: 'm1' });
  });

  test('returns 400 on failure', async () => {
    node_funcs.addComment.mockRejectedValue('boom');
    const res = makeRes();
    await Service.element_add_comment(makeArgs({ execution_id: 'x1', elem_id: 'e1', conversation_id: 'c1', comment: {} }), res, makeNext(), HEADERS);
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when adding a comment', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('CommentService.element_get_comments', () => {
  test('sets total count header when data is present', async () => {
    node_funcs.getComments.mockResolvedValue({ total: 2, comments: [{ id: 1 }] });
    const res = makeRes();
    await Service.element_get_comments(makeArgs({ execution_id: 'x1', elem_id: 'e1', conversation_id: 'c1', offset: 1, limit: 2 }), res, makeNext());
    expect(node_funcs.getComments).toHaveBeenCalledWith('x1', 'e1', 'c1', 1, 2);
    expect(res.set).toHaveBeenCalledWith('x-total-count', 2);
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
  });

  test('defaults offset/limit to undefined and total to 0', async () => {
    node_funcs.getComments.mockResolvedValue({ comments: [] });
    const res = makeRes();
    await Service.element_get_comments(makeArgs({ execution_id: 'x1', elem_id: 'e1', conversation_id: 'c1', offset: 0, limit: 0 }), res, makeNext());
    expect(node_funcs.getComments).toHaveBeenCalledWith('x1', 'e1', 'c1', undefined, undefined);
    expect(res.set).toHaveBeenCalledWith('x-total-count', 0);
  });

  test('returns 400 on failure', async () => {
    node_funcs.getComments.mockRejectedValue('boom');
    const res = makeRes();
    await Service.element_get_comments(makeArgs({ execution_id: 'x1', elem_id: 'e1', conversation_id: 'c1', offset: 0, limit: 0 }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting comments', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('CommentService.element_get_comment', () => {
  test('returns the comment', async () => {
    node_funcs.getComment.mockResolvedValue({ id: 'm1' });
    const res = makeRes();
    await Service.element_get_comment(makeArgs({ execution_id: 'x1', elem_id: 'e1', conversation_id: 'c1', comment_id: 'm1' }), res, makeNext());
    expect(node_funcs.getComment).toHaveBeenCalledWith('x1', 'e1', 'c1', 'm1');
    expect(res.json).toHaveBeenCalledWith({ id: 'm1' });
  });

  test('returns 400 on failure', async () => {
    node_funcs.getComment.mockRejectedValue('boom');
    const res = makeRes();
    await Service.element_get_comment(makeArgs({ execution_id: 'x1', elem_id: 'e1', conversation_id: 'c1', comment_id: 'm1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when getting a comment', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('CommentService.element_update_comment', () => {
  test('updates the comment', async () => {
    node_funcs.updateComment.mockResolvedValue({ id: 'm1' });
    const res = makeRes();
    await Service.element_update_comment(makeArgs({ execution_id: 'x1', elem_id: 'e1', conversation_id: 'c1', comment_id: 'm1', comment: { a: 1 } }), res, makeNext(), HEADERS);
    expect(node_funcs.updateComment).toHaveBeenCalledWith('x1', 'e1', 'c1', 'm1', { a: 1 }, 'alice');
    expect(res.json).toHaveBeenCalledWith({ id: 'm1' });
  });

  test('returns 400 on failure', async () => {
    node_funcs.updateComment.mockRejectedValue('boom');
    const res = makeRes();
    await Service.element_update_comment(makeArgs({ execution_id: 'x1', elem_id: 'e1', conversation_id: 'c1', comment_id: 'm1', comment: {} }), res, makeNext(), HEADERS);
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when updating a comment', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('CommentService.element_delete_comment', () => {
  test('deletes and returns 204', async () => {
    node_funcs.deleteComment.mockResolvedValue({});
    const res = makeRes();
    await Service.element_delete_comment(makeArgs({ execution_id: 'x1', elem_id: 'e1', conversation_id: 'c1', comment_id: 'm1' }), res, makeNext());
    expect(node_funcs.deleteComment).toHaveBeenCalledWith('x1', 'e1', 'c1', 'm1');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalledTimes(1);
  });

  test('returns 400 on failure', async () => {
    node_funcs.deleteComment.mockRejectedValue('boom');
    const res = makeRes();
    await Service.element_delete_comment(makeArgs({ execution_id: 'x1', elem_id: 'e1', conversation_id: 'c1', comment_id: 'm1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when deleting a comment', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
