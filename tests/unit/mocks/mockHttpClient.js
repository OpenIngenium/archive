'use strict';

/**
 * Minimal HTTP client test double. Resolves with a configurable response and
 * records every request so tests can assert on outbound calls without any
 * real network I/O.
 */
function makeHttpClient(defaultResponse = { statusCode: 200, body: {} }) {
  const requests = [];
  const request = jest.fn((options) => {
    requests.push(options);
    return Promise.resolve(defaultResponse);
  });
  return { request, requests };
}

module.exports = { makeHttpClient };
