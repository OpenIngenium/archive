'use strict';

jest.mock('jsonwebtoken');

const jwt = require('jsonwebtoken');
const base_funcs = require('../../../api/base_funcs');
const node_funcs = require('../../../api/node_funcs');

describe('node_funcs logging helpers', () => {
  const originalLevel = base_funcs.log.level;
  afterEach(() => {
    base_funcs.log.level = originalLevel;
  });

  test('getLogging returns the current level in upper case', () => {
    base_funcs.log.level = 'info';
    expect(node_funcs.getLogging()).toEqual({ level: 'INFO' });
  });

  test('updateLogging lowercases and applies the new level', () => {
    node_funcs.updateLogging({ level: 'TRACE' });
    expect(base_funcs.log.level).toBe('trace');
    expect(node_funcs.getLogging()).toEqual({ level: 'TRACE' });
  });
});

describe('node_funcs.parse_token', () => {
  test('extracts the token portion of a bearer header', () => {
    expect(node_funcs.parse_token('Bearer abc.def')).toBe('abc.def');
  });

  test('returns an empty string when the header is not space-delimited', () => {
    expect(node_funcs.parse_token('malformed')).toBe('');
  });
});

describe('node_funcs.parse_username', () => {
  test('returns an empty string when there is no authorization header', () => {
    expect(node_funcs.parse_username('')).toBe('');
  });

  test('verifies the token and returns the username claim', () => {
    jwt.verify.mockReturnValue({ username: 'carol' });
    expect(node_funcs.parse_username('Bearer tok')).toBe('carol');
    expect(jwt.verify).toHaveBeenCalledWith('tok', expect.anything(), { algorithms: ['RS256'] });
  });
});
