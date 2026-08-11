'use strict';

const CONFIG_PATH = '../../config';

describe('config', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {};
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test('uses defaults when environment variables are not set', () => {
    const config = require(CONFIG_PATH);

    expect(config.version).toBe('');
    expect(config.api_version).toBe('v5');
    expect(config.database_name).toBe('ingenium');
    expect(config.db_url).toBe('http://localhost:8529');
    expect(config.db_password).toBe('somepassword');
    expect(config.db_user).toBe('root');
    expect(config.execution_id_prefix).toBe('clipper-ingenium-');
    expect(config.procedure_id_prefix).toBe('clipper-procedure-');
    expect(config.public_pem).toBe('');
  });

  test('derives version from ARCHIVE_ING_IMAGE tag', () => {
    process.env.ARCHIVE_ING_IMAGE =
      'artifactory/core_server:r13_1_1';
    const config = require(CONFIG_PATH);
    expect(config.version).toBe('r13.1.1');
  });

  test('reads overrides from the environment', () => {
    process.env.ARANGODBURL = 'http://db:9999';
    process.env.ARANGO_ROOT_PASSWORD = 'secret';
    process.env.ARANGO_USER = 'admin';
    process.env.EXECUTION_ID_PREFIX = 'exec-';
    process.env.PROCEDURE_ID_PREFIX = 'proc-';
    process.env.PUBLIC_PEM = 'PEMDATA';

    const config = require(CONFIG_PATH);

    expect(config.db_url).toBe('http://db:9999');
    expect(config.db_password).toBe('secret');
    expect(config.db_user).toBe('admin');
    expect(config.execution_id_prefix).toBe('exec-');
    expect(config.procedure_id_prefix).toBe('proc-');
    expect(config.public_pem).toBe('PEMDATA');
  });
});
