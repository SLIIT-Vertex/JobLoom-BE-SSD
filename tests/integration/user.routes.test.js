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

describe('User Routes - Integration Tests', () => {
  beforeAll(async () => {
    const testDbUri = process.env.MONGO_TEST_URI || 'mongodb://localhost:27017/jobloom-test';
    await mongoose.connect(testDbUri);
  });

  afterAll(async () => {
    await User.deleteMany({});
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await User.deleteMany({});
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
});
