'use strict';

// Only the JWT collaborator is mocked; every other helper under test runs for real.
// arangojs connects lazily, so requiring the module performs no real I/O.
jest.mock('jsonwebtoken');

const jwt = require('jsonwebtoken');
const base_funcs = require('../../../api/base_funcs');

describe('base_funcs.push_error', () => {
  test('wraps a string error into message + details', () => {
    const result = base_funcs.push_error('outer', 'inner failure');
    expect(result).toEqual({ message: 'outer', details: ['inner failure'] });
  });

  test('preserves an existing details array and appends the error message', () => {
    const err = { message: 'boom', details: ['first'] };
    const result = base_funcs.push_error('outer', err);
    expect(result.message).toBe('outer');
    expect(result.details).toEqual(['first', 'boom']);
  });

  test('inspects a non-string error message', () => {
    const err = { message: { code: 42 } };
    const result = base_funcs.push_error('outer', err);
    expect(result.message).toBe('outer');
    expect(result.details).toEqual([require('util').inspect({ code: 42 })]);
  });

  test('falls back to inspecting the error when there is no message', () => {
    const err = { code: 7 };
    const result = base_funcs.push_error('outer', err);
    expect(result.message).toBe('outer');
    expect(result.details).toEqual([require('util').inspect(err)]);
  });

  test('handles non-serializable errors via the fallback branch', () => {
    const circular = {};
    circular.self = circular;
    const result = base_funcs.push_error('outer', circular);
    expect(result.message).toBe('outer');
    expect(result.details).toEqual([require('util').inspect(circular)]);
  });
});

describe('base_funcs.sanitize_internal_attrs', () => {
  test('removes arango internal attributes', () => {
    const obj = { _id: 'c/1', _key: '1', _rev: 'r', keep: true };
    expect(base_funcs.sanitize_internal_attrs(obj)).toEqual({ keep: true });
  });
});

describe('base_funcs.sanitize_internal_attrs_recursive', () => {
  test('recurses into children and run_records', () => {
    const obj = {
      _id: 'c/1', _key: '1', _rev: 'r', name: 'root',
      children: [{ _id: 'c/2', _key: '2', _rev: 'r2', name: 'child' }],
      run_records: [{ _id: 'c/3', _key: '3', _rev: 'r3', name: 'run' }]
    };
    const result = base_funcs.sanitize_internal_attrs_recursive(obj);
    expect(result).toEqual({
      name: 'root',
      children: [{ name: 'child' }],
      run_records: [{ name: 'run' }]
    });
  });
});

describe('base_funcs.get_sj_error_message', () => {
  test('returns a string arango error message', () => {
    const err = { response: { body: { errorMessage: 'not found' } } };
    expect(base_funcs.get_sj_error_message(err)).toBe('not found');
  });

  test('inspects a non-string arango error message', () => {
    const err = { response: { body: { errorMessage: { nested: true } } } };
    expect(base_funcs.get_sj_error_message(err)).toBe(require('util').inspect({ nested: true }));
  });

  test('returns empty string when body has no errorMessage', () => {
    const err = { response: { body: {} } };
    expect(base_funcs.get_sj_error_message(err)).toBe('');
  });

  test('inspects the whole error when there is no response', () => {
    const err = new Error('raw');
    expect(base_funcs.get_sj_error_message(err)).toBe(require('util').inspect(err));
  });
});

describe('base_funcs.isRedlineElement', () => {
  test.each(['ADDED', 'DELETED', 'MODIFIED', 'MODIFYING', 'MODIFYING_OLD'])(
    'returns true for procedure_modification_status %s',
    (status) => {
      expect(base_funcs.isRedlineElement({ procedure_modification_status: status })).toBe(true);
    }
  );

  test('returns false for other statuses', () => {
    expect(base_funcs.isRedlineElement({ procedure_modification_status: 'NONE' })).toBe(false);
  });
});

describe('base_funcs.isInRunForScore', () => {
  test('returns false when the target parent has no elem_id (an execution)', () => {
    expect(base_funcs.isInRunForScore({})).toBe(false);
  });

  test('returns true when the element is marked run_for_score', () => {
    expect(base_funcs.isInRunForScore({ elem_id: 'e1', run_for_score: true })).toBe(true);
  });

  test('reads run_for_score from a procedure section execution_user_input', () => {
    expect(base_funcs.isInRunForScore({
      elem_id: 'e1', elem_type: 'PROCEDURE_SECTION', execution_user_input: { run_for_score: true }
    })).toBe(true);
  });

  test('returns false for a procedure section without run_for_score input', () => {
    expect(base_funcs.isInRunForScore({
      elem_id: 'e1', elem_type: 'PROCEDURE_SECTION', execution_user_input: {}
    })).toBe(false);
  });

  test('returns false for a non-scored regular element', () => {
    expect(base_funcs.isInRunForScore({ elem_id: 'e1', elem_type: 'STEP' })).toBe(false);
  });
});

describe('base_funcs.getUserName', () => {
  test('returns an empty string when there is no authorization header', () => {
    expect(base_funcs.getUserName('')).toBe('');
  });

  test('decodes the username from a bearer token', () => {
    jwt.verify.mockReturnValue({ username: 'bob' });
    expect(base_funcs.getUserName('Bearer tok')).toBe('bob');
    expect(jwt.verify).toHaveBeenCalledWith('tok', expect.anything(), { algorithms: ['RS256'] });
  });

  test('returns an empty string when the token has no username claim', () => {
    jwt.verify.mockReturnValue({ scopes: [] });
    expect(base_funcs.getUserName('Bearer tok')).toBe('');
  });
});

describe('base_funcs.execution_meta_data_template', () => {
  test('exposes the default execution meta data shape', () => {
    expect(base_funcs.execution_meta_data_template).toMatchObject({
      status: 'NONE',
      status_message: '',
      error: {}
    });
  });
});
