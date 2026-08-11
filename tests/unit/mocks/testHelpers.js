'use strict';

/**
 * Reusable helpers for building deterministic Express-style test doubles.
 * These never perform real I/O; they only record interactions.
 */

/**
 * Build a mock Express response object.
 * status(), json(), send(), end(), set() and setHeader() are all jest mocks.
 * status() is chainable so `res.status(200).json(...)` works.
 */
function makeRes() {
  const res = {};
  res.statusCode = 200;
  res.status = jest.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn(() => res);
  res.send = jest.fn(() => res);
  res.end = jest.fn(() => res);
  res.set = jest.fn(() => res);
  res.setHeader = jest.fn(() => res);
  return res;
}

/**
 * Build a mock request whose swagger params mirror the shape controllers
 * and services expect: { key: { value: ... } }.
 */
function makeReq(params = {}, headers = {}) {
  const swaggerParams = {};
  for (const key of Object.keys(params)) {
    swaggerParams[key] = { value: params[key] };
  }
  return {
    swagger: { params: swaggerParams },
    headers,
    params: {},
    body: {}
  };
}

/**
 * Build swagger-style params directly ({ key: { value } }) for service tests.
 */
function makeArgs(params = {}) {
  const args = {};
  for (const key of Object.keys(params)) {
    args[key] = { value: params[key] };
  }
  return args;
}

function makeNext() {
  return jest.fn();
}

module.exports = { makeRes, makeReq, makeArgs, makeNext };
