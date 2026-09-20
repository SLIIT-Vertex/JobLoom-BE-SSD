import { describe, test, expect, afterEach } from '@jest/globals';
import envConfig, { validateRequiredEnvVars } from '../../src/config/env.config.js';
import { generateToken, verifyToken } from '../../src/utils/jwt.utils.js';

const originalJwtSecret = process.env.JWT_SECRET;

describe('security configuration', () => {
  afterEach(() => {
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }
  });

  test('requires both the database URI and JWT secret', () => {
    expect(() => validateRequiredEnvVars({ MONGODB_URI: 'mongodb://localhost/jobloom' })).toThrow(
      /JWT_SECRET/
    );
  });

  test.each([
    'short-secret',
    'your_jwt_secret',
    'your-super-secret-jwt-key-change-in-production',
    '<replace-with-a-unique-random-secret>',
  ])('rejects an insecure JWT secret: %s', (jwtSecret) => {
    expect(() =>
      validateRequiredEnvVars({
        MONGODB_URI: 'mongodb://localhost/jobloom',
        JWT_SECRET: jwtSecret,
      })
    ).toThrow(/JWT_SECRET/);
  });

  test('uses the configured secret to sign and verify tokens', () => {
    process.env.JWT_SECRET = 'unit-test-secret-that-is-longer-than-32-characters';

    const token = generateToken({
      userId: 'user-123',
      email: 'user@example.com',
      role: 'job_seeker',
    });

    expect(verifyToken(token)).toEqual(
      expect.objectContaining({ userId: 'user-123', email: 'user@example.com' })
    );
  });

  test('does not provide a fallback when JWT_SECRET is missing', () => {
    delete process.env.JWT_SECRET;
    expect(() => envConfig.jwtSecret).toThrow(/JWT_SECRET/);
  });
});
