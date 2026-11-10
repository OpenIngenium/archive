'use strict';

/**
 * Factory helpers that emulate the small slice of the arangojs API used by the
 * service/business-logic modules. Nothing here opens a real connection.
 */

/** Build a cursor whose all()/next() resolve to the provided rows. */
function makeCursor(rows = []) {
  let index = 0;
  return {
    all: jest.fn().mockResolvedValue(rows),
    next: jest.fn().mockImplementation(() => Promise.resolve(rows[index++])),
    hasNext: jest.fn().mockImplementation(() => index < rows.length)
  };
}

/** Build a mock arango collection with the commonly used methods. */
function makeCollection(overrides = {}) {
  return Object.assign(
    {
      byExample: jest.fn().mockResolvedValue(makeCursor()),
      document: jest.fn().mockResolvedValue({}),
      save: jest.fn().mockResolvedValue({ _id: 'c/1', _key: '1' }),
      update: jest.fn().mockResolvedValue({ _id: 'c/1', _key: '1' }),
      replace: jest.fn().mockResolvedValue({ _id: 'c/1', _key: '1' }),
      remove: jest.fn().mockResolvedValue({}),
      import: jest.fn().mockResolvedValue({}),
      exists: jest.fn().mockResolvedValue(true)
    },
    overrides
  );
}

/** Build a mock arango database object. */
function makeDatabase(overrides = {}) {
  return Object.assign(
    {
      useDatabase: jest.fn(),
      useBasicAuth: jest.fn(),
      listDatabases: jest.fn().mockResolvedValue(['_system']),
      createDatabase: jest.fn().mockResolvedValue({}),
      collection: jest.fn(() => makeCollection()),
      query: jest.fn().mockResolvedValue(makeCursor())
    },
    overrides
  );
}

module.exports = { makeCursor, makeCollection, makeDatabase };
