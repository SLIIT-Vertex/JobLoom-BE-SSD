import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import {
  clearAuthRateLimitStore,
  createAuthRateLimiter,
} from '../../src/middleware/auth-rate-limit.middleware.js';

const createResponse = () => {
  const listeners = {};
  return {
    statusCode: 200,
    setHeader: jest.fn(),
    on: jest.fn((event, callback) => {
      listeners[event] = callback;
    }),
    status: jest.fn(function setStatus(statusCode) {
      this.statusCode = statusCode;
      return this;
    }),
    json: jest.fn(function sendJson() {
      return this;
    }),
    finish() {
      listeners.finish?.();
    },
  };
};

describe('authentication rate-limit middleware', () => {
  beforeEach(() => clearAuthRateLimitStore());

  test('blocks requests after the configured limit', () => {
    const limiter = createAuthRateLimiter({
      policyName: 'unit_block',
      maxAttempts: 2,
      windowMs: 60_000,
      message: 'Slow down.',
    });
    const req = { ip: '192.0.2.1' };
    const next = jest.fn();

    limiter(req, createResponse(), next);
    limiter(req, createResponse(), next);
    const blockedResponse = createResponse();
    limiter(req, blockedResponse, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(blockedResponse.status).toHaveBeenCalledWith(429);
    expect(blockedResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'RATE_LIMITED', message: 'Slow down.' })
    );
    expect(blockedResponse.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(Number));
  });

  test('does not count successful requests when configured', () => {
    const limiter = createAuthRateLimiter({
      policyName: 'unit_success',
      maxAttempts: 1,
      windowMs: 60_000,
      message: 'Slow down.',
      skipSuccessfulRequests: true,
    });
    const req = { ip: '192.0.2.2' };
    const next = jest.fn();

    const successfulResponse = createResponse();
    limiter(req, successfulResponse, next);
    successfulResponse.finish();

    const nextResponse = createResponse();
    limiter(req, nextResponse, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(nextResponse.status).not.toHaveBeenCalled();
  });
});
