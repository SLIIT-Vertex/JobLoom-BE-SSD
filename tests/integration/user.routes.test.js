import 'dotenv/config';
import { jest, describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';

// ESM: static imports run before jest.mock(). Mock first, then load the app so user.service gets the stub.
await jest.unstable_mockModule('../../src/services/sms.service.js', () => ({
  sendOtp: jest.fn().mockResolvedValue({ success: true }),
  sendSms: jest.fn().mockResolvedValue({ success: true }),
}));

const request = (await import('supertest')).default;
const mongoose = (await import('mongoose')).default;
const { default: app } = await import('../../src/server.js');
const { default: User } = await import('../../src/modules/users/user.model.js');
const { default: RevokedToken } = await import('../../src/modules/users/revoked-token.model.js');
const { decodeToken, generateToken } = await import('../../src/utils/jwt.utils.js');
const { clearAuthRateLimitStore } =
  await import('../../src/middleware/auth-rate-limit.middleware.js');

describe('User Routes - Integration Tests', () => {
  beforeAll(async () => {
    const testDbUri = process.env.MONGO_TEST_URI || 'mongodb://localhost:27017/jobloom-test';
    await mongoose.connect(testDbUri);
  });

  afterAll(async () => {
    await User.deleteMany({});
    await RevokedToken.deleteMany({});
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    clearAuthRateLimitStore();
    await User.deleteMany({});
    await RevokedToken.deleteMany({});
  });

  test('should rate limit repeated failed login attempts', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(app)
        .post('/api/users/login')
        .send({ email: 'missing@test.com', password: 'wrongpassword' });

      expect(response.status).toBe(401);
    }

    const blockedResponse = await request(app)
      .post('/api/users/login')
      .send({ email: 'missing@test.com', password: 'wrongpassword' });

    expect(blockedResponse.status).toBe(429);
    expect(blockedResponse.body.code).toBe('RATE_LIMITED');
    expect(blockedResponse.headers['retry-after']).toBeDefined();
    expect(blockedResponse.headers['ratelimit-limit']).toBe('5');
  });

  describe('Registration and Verification Flow', () => {
    const userData = {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@test.com',
      phone: '94712345678',
      password: 'password123',
      role: 'job_seeker',
      location: {
        village: 'Kottawa',
        district: 'Colombo',
        province: 'Western',
      },
    };

    test('should register user and then verify with OTP', async () => {
      // 1. Register
      const regRes = await request(app).post('/api/users/register').send(userData);
      expect(regRes.status).toBe(201);
      expect(regRes.body.isVerified).toBe(false);

      // Get OTP from DB (since it's mocked in SMS service)
      const user = await User.findOne({ email: userData.email });
      const otp = user.verificationOtp;
      expect(otp).toBeDefined();

      // 2. Verify OTP
      const verifyRes = await request(app)
        .post('/api/users/verify-registration')
        .send({ phone: userData.phone, otp });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.token).toBeDefined();

      const updatedUser = await User.findOne({ email: userData.email });
      expect(updatedUser.isVerified).toBe(true);
    });

    test('should fail verification with wrong OTP', async () => {
      await request(app).post('/api/users/register').send(userData);

      const res = await request(app)
        .post('/api/users/verify-registration')
        .send({ phone: userData.phone, otp: '000000' });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Invalid or expired OTP');
    });

    test('should allow employer registration', async () => {
      const res = await request(app)
        .post('/api/users/register')
        .send({
          ...userData,
          email: 'employer@test.com',
          phone: '94712345679',
          role: 'employer',
        });

      expect(res.status).toBe(201);
      expect(res.body.role).toBe('employer');
      expect(await User.findOne({ email: 'employer@test.com' })).not.toBeNull();
    });

    test('should ignore server-owned account fields during registration', async () => {
      const res = await request(app)
        .post('/api/users/register')
        .send({
          ...userData,
          email: 'mass-assignment@test.com',
          phone: '94712345671',
          isVerified: true,
          isActive: false,
          passwordResetOtp: 'attacker-controlled',
          passwordResetOtpExpires: new Date(Date.now() + 60_000).toISOString(),
        });

      expect(res.status).toBe(201);

      const user = await User.findOne({ email: 'mass-assignment@test.com' });
      expect(user.isVerified).toBe(false);
      expect(user.isActive).toBe(true);
      expect(user.passwordResetOtp).toBeNull();
      expect(user.passwordResetOtpExpires).toBeNull();
    });

    test('should reject public registration with the admin role', async () => {
      const res = await request(app)
        .post('/api/users/register')
        .send({
          ...userData,
          firstName: 'Attack',
          lastName: 'User',
          email: 'attack@test.com',
          phone: '94712345670',
          role: 'admin',
        });

      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'role' })])
      );
      expect(await User.findOne({ email: 'attack@test.com' })).toBeNull();
    });
  });

  describe('Forgot Password Flow', () => {
    beforeEach(async () => {
      // Create a user first
      await User.create({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com',
        phone: '94788888888',
        password: 'password123',
        role: 'job_seeker',
        location: { village: 'A', district: 'B', province: 'C' },
        isVerified: true,
      });
    });

    test('should handle forgot password, verify OTP, and reset password', async () => {
      const phone = '94788888888';

      // 1. Forgot password
      const forgotRes = await request(app).post('/api/users/forgot-password').send({ phone });

      expect(forgotRes.status).toBe(200);

      const user = await User.findOne({ phone });
      const otp = user.passwordResetOtp;

      // 2. Verify OTP
      const verifyRes = await request(app)
        .post('/api/users/verify-password-reset')
        .send({ phone, otp });

      expect(verifyRes.status).toBe(200);
      const resetToken = verifyRes.body.resetToken;
      expect(resetToken).toBeDefined();

      // 3. Reset password
      const resetRes = await request(app)
        .post('/api/users/reset-password')
        .send({ phone, resetToken, password: 'newpassword123' });

      expect(resetRes.status).toBe(200);

      // 4. Verify login with new password
      const loginRes = await request(app)
        .post('/api/users/login')
        .send({ email: 'john@test.com', password: 'newpassword123' });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.token).toBeDefined();
    });
  });

  describe('Logout Flow', () => {
    const createUser = (email, phone) =>
      User.create({
        firstName: 'Logout',
        lastName: 'Tester',
        email,
        phone,
        password: 'password123',
        role: 'job_seeker',
        location: { village: 'A', district: 'B', province: 'C' },
        isVerified: true,
      });

    const login = async (email) => {
      const response = await request(app)
        .post('/api/users/login')
        .send({ email, password: 'password123' });

      expect(response.status).toBe(200);
      return response.body.token;
    };

    test('should revoke the current JWT and reject its reuse', async () => {
      await createUser('logout@test.com', '94711111111');
      const token = await login('logout@test.com');
      const claims = decodeToken(token);

      expect(claims).toEqual(
        expect.objectContaining({
          userId: expect.any(String),
          jti: expect.any(String),
          exp: expect.any(Number),
        })
      );

      const beforeLogout = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${token}`);
      expect(beforeLogout.status).toBe(200);

      const logout = await request(app)
        .post('/api/users/logout')
        .set('Authorization', `Bearer ${token}`);
      expect(logout.status).toBe(200);
      expect(logout.body.message).toBe('Logged out successfully');

      const revocation = await RevokedToken.findOne({ jti: claims.jti });
      expect(revocation).not.toBeNull();
      expect(revocation.expiresAt.getTime()).toBe(claims.exp * 1000);

      const afterLogout = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${token}`);
      expect(afterLogout.status).toBe(401);
    });

    test('should not revoke a different user session', async () => {
      await createUser('first@test.com', '94711111112');
      await createUser('second@test.com', '94711111113');
      const firstToken = await login('first@test.com');
      const secondToken = await login('second@test.com');

      await request(app).post('/api/users/logout').set('Authorization', `Bearer ${firstToken}`);

      const secondSession = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${secondToken}`);
      expect(secondSession.status).toBe(200);
      expect(secondSession.body.email).toBe('second@test.com');
    });

    test('should reject logout without authentication', async () => {
      const response = await request(app).post('/api/users/logout');
      expect(response.status).toBe(401);
    });

    test('should safely reject a second logout with the revoked token', async () => {
      await createUser('twice@test.com', '94711111114');
      const token = await login('twice@test.com');

      const firstLogout = await request(app)
        .post('/api/users/logout')
        .set('Authorization', `Bearer ${token}`);
      const secondLogout = await request(app)
        .post('/api/users/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(firstLogout.status).toBe(200);
      expect(secondLogout.status).toBe(401);
      expect(await RevokedToken.countDocuments()).toBe(1);
    });

    test('should ignore an expired revocation record before TTL cleanup', async () => {
      await createUser('stale-revocation@test.com', '94711111116');
      const token = await login('stale-revocation@test.com');
      const { jti } = decodeToken(token);

      await RevokedToken.create({
        jti,
        expiresAt: new Date(Date.now() - 1_000),
      });

      const response = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(200);
    });

    test('should reject the revoked JWT on admin authentication routes', async () => {
      const admin = await createUser('admin@test.com', '94711111115');
      admin.role = 'admin';
      await admin.save();
      const token = await login('admin@test.com');

      await request(app).post('/api/users/logout').set('Authorization', `Bearer ${token}`);

      const response = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(401);
    });

    test('should continue rejecting malformed and expired tokens', async () => {
      const malformed = await request(app)
        .get('/api/users/me')
        .set('Authorization', 'Bearer not-a-jwt');
      expect(malformed.status).toBe(401);

      const originalExpiry = process.env.JWT_EXPIRES_IN;
      let expiredToken;

      try {
        process.env.JWT_EXPIRES_IN = '-1s';
        expiredToken = generateToken({
          userId: new mongoose.Types.ObjectId().toString(),
          email: 'expired@test.com',
          role: 'job_seeker',
        });
      } finally {
        if (originalExpiry === undefined) {
          delete process.env.JWT_EXPIRES_IN;
        } else {
          process.env.JWT_EXPIRES_IN = originalExpiry;
        }
      }

      const expired = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${expiredToken}`);
      expect(expired.status).toBe(401);
    });
  });

  // V4 — Profile IDOR / Sensitive Data Exposure (fix regression tests)

  describe('GET /api/users/profile/:id', () => {
    const createUser = (overrides = {}) =>
      User.create({
        firstName: 'Profile',
        lastName: 'Tester',
        email: overrides.email,
        phone: overrides.phone,
        password: 'password123',
        role: 'job_seeker',
        location: { village: 'A', district: 'B', province: 'C' },
        isVerified: true,
        ...overrides,
      });

    const login = async (email) => {
      const response = await request(app)
        .post('/api/users/login')
        .send({ email, password: 'password123' });
      expect(response.status).toBe(200);
      return response.body.token;
    };

    test('should return the full profile including sensitive fields when viewing your own profile', async () => {
      const owner = await createUser({
        email: 'owner@test.com',
        phone: '94711120001',
        passwordResetOtp: '999888',
        passwordResetOtpExpires: new Date(Date.now() + 60_000),
      });
      const token = await login('owner@test.com');

      const res = await request(app)
        .get(`/api/users/profile/${owner._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.phone).toBe('94711120001');
      expect(res.body.passwordResetOtp).toBe('999888');
    });

    test("SECURITY: should NOT expose another user's OTP, phone, or location", async () => {
      const victim = await createUser({
        email: 'victim@test.com',
        phone: '94711120002',
        passwordResetOtp: '123456',
        passwordResetOtpExpires: new Date(Date.now() + 60_000),
      });
      await createUser({ email: 'attacker@test.com', phone: '94711120003' });
      const attackerToken = await login('attacker@test.com');

      const res = await request(app)
        .get(`/api/users/profile/${victim._id}`)
        .set('Authorization', `Bearer ${attackerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.passwordResetOtp).toBeUndefined();
      expect(res.body.verificationOtp).toBeUndefined();
      expect(res.body.passwordResetOtpExpires).toBeUndefined();
      expect(res.body.phone).toBeUndefined();
      expect(res.body.location).toBeUndefined();
      expect(res.body.password).toBeUndefined();
    });

    test("SECURITY: should still return public-safe fields for another user's profile", async () => {
      const victim = await createUser({ email: 'victim2@test.com', phone: '94711120004' });
      await createUser({ email: 'attacker2@test.com', phone: '94711120005' });
      const attackerToken = await login('attacker2@test.com');

      const res = await request(app)
        .get(`/api/users/profile/${victim._id}`)
        .set('Authorization', `Bearer ${attackerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.firstName).toBe('Profile');
      expect(res.body.role).toBe('job_seeker');
    });

    test("should return the full profile when an admin views another user's profile", async () => {
      const victim = await createUser({
        email: 'victim3@test.com',
        phone: '94711120006',
        passwordResetOtp: '555555',
        passwordResetOtpExpires: new Date(Date.now() + 60_000),
      });
      const admin = await createUser({ email: 'admin-viewer@test.com', phone: '94711120007' });
      admin.role = 'admin';
      await admin.save();
      const adminToken = await login('admin-viewer@test.com');

      const res = await request(app)
        .get(`/api/users/profile/${victim._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.passwordResetOtp).toBe('555555');
      expect(res.body.phone).toBe('94711120006');
    });

    test('should return 401 without authentication', async () => {
      const victim = await createUser({ email: 'victim4@test.com', phone: '94711120008' });

      const res = await request(app).get(`/api/users/profile/${victim._id}`);

      expect(res.status).toBe(401);
    });
  });
});
