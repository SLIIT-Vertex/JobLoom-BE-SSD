import 'dotenv/config';
import { jest, describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';

const uploadBufferToCloudinary = jest.fn(async () => ({
  url: 'https://res.cloudinary.com/test/image/upload/v1/jobloom_uploads/test.png',
  public_id: 'jobloom_uploads/test',
  resource_type: 'image',
}));

await jest.unstable_mockModule('../../src/services/upload.service.js', () => ({
  uploadBufferToCloudinary,
  uploadToCloudinary: jest.fn(),
  uploadFileToCloudinary: jest.fn(),
}));

const request = (await import('supertest')).default;
const mongoose = (await import('mongoose')).default;
const { default: app } = await import('../../src/server.js');
const { default: User } = await import('../../src/modules/users/user.model.js');

const testPng = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../postman/test-files/upload-test.png'
);

describe('Upload Routes - Integration Tests', () => {
  let authToken;

  const createUserAndLogin = async () => {
    const password = 'password123';

    await User.create({
      firstName: 'Upload',
      lastName: 'Tester',
      email: 'upload-auth@test.com',
      password,
      role: 'job_seeker',
      phone: '94770000901',
      location: {
        village: 'Test Village',
        district: 'Colombo',
        province: 'Western',
      },
      isVerified: true,
    });

    const loginRes = await request(app).post('/api/users/login').send({
      email: 'upload-auth@test.com',
      password,
    });

    return loginRes.body.token;
  };

  beforeAll(async () => {
    const testDbUri = process.env.MONGO_TEST_URI || 'mongodb://localhost:27017/jobloom-test';
    await mongoose.connect(testDbUri);
  }, 10000);

  afterAll(async () => {
    await User.deleteMany({});
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    uploadBufferToCloudinary.mockReset();
    uploadBufferToCloudinary.mockResolvedValue({
      url: 'https://res.cloudinary.com/test/image/upload/v1/jobloom_uploads/test.png',
      public_id: 'jobloom_uploads/test',
      resource_type: 'image',
    });
    authToken = await createUserAndLogin();
  });

  describe('POST /api/upload', () => {
    test('should return 401 without authentication', async () => {
      const res = await request(app).post('/api/upload').attach('file', testPng);

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/no token/i);
      expect(uploadBufferToCloudinary).not.toHaveBeenCalled();
    });

    test('should return 401 with an invalid token', async () => {
      const res = await request(app)
        .post('/api/upload')
        .set('Authorization', 'Bearer not-a-real-token')
        .attach('file', testPng);

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/token failed/i);
      expect(uploadBufferToCloudinary).not.toHaveBeenCalled();
    });

    test('should upload when a valid token is present', async () => {
      const res = await request(app)
        .post('/api/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testPng);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('url');
      expect(res.body.url).toMatch(/^https?:\/\//);
      expect(uploadBufferToCloudinary).toHaveBeenCalledTimes(1);
    });
  });
});
