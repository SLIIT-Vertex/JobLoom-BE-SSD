import 'dotenv/config';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../src/server.js';
import User from '../../src/modules/users/user.model.js';
import Job from '../../src/modules/jobs/job.model.js';
import Application from '../../src/modules/applications/application.model.js';
import Review from '../../src/modules/reviews/review.model.js';

/**
 * Integration Tests for Application Routes
 * Testing complete API workflows with a real test database
 *
 * Prerequisites:
 * 1. Start MongoDB: docker-compose -f docker-compose.test.yml up -d
 * 2. Run tests: npm run test:integration
 * 3. Stop MongoDB: docker-compose -f docker-compose.test.yml down
 */

describe('Application Routes - Integration Tests', () => {
  let employerToken;
  let jobSeekerToken;
  let employerId;
  let jobSeekerId;
  let jobId;

  const createUserAndLogin = async ({ firstName, lastName, email, role, phone }) => {
    const password = 'password123';

    const user = await User.create({
      firstName,
      lastName,
      email,
      password,
      role,
      phone,
      location: {
        village: 'Test Village',
        district: 'Colombo',
        province: 'Western',
      },
      isVerified: true,
    });

    const loginRes = await request(app).post('/api/users/login').send({ email, password });

    return { token: loginRes.body.token, userId: user._id.toString() };
  };

  // Setup & teardown

  beforeAll(async () => {
    const testDbUri = process.env.MONGO_TEST_URI || 'mongodb://localhost:27017/jobloom-test';
    console.log('Connecting to test database:', testDbUri);
    await mongoose.connect(testDbUri);
  }, 10000);

  afterAll(async () => {
    await User.deleteMany({});
    await Job.deleteMany({});
    await Application.deleteMany({});
    await Review.deleteMany({});
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clear collections
    await User.deleteMany({});
    await Job.deleteMany({});
    await Application.deleteMany({});
    await Review.deleteMany({});

    // Create verified users and login
    const employer = await createUserAndLogin({
      firstName: 'John',
      lastName: 'Employer',
      email: 'employer@test.com',
      role: 'employer',
      phone: '94770000031',
    });

    employerToken = employer.token;
    employerId = employer.userId;

    const jobSeeker = await createUserAndLogin({
      firstName: 'Jane',
      lastName: 'Worker',
      email: 'worker@test.com',
      role: 'job_seeker',
      phone: '94770000032',
    });

    jobSeekerToken = jobSeeker.token;
    jobSeekerId = jobSeeker.userId;

    // Create an open job directly in DB
    const job = await Job.create({
      employerId,
      title: 'Farm Helper Needed',
      description: 'Need help with harvesting',
      status: 'open',
    });
    jobId = job._id;
  });

  // POST /api/applications

  describe('POST /api/applications', () => {
    test('should allow a job seeker to apply for a job', async () => {
      const res = await request(app)
        .post('/api/applications')
        .set('Authorization', `Bearer ${jobSeekerToken}`)
        .send({
          jobId: jobId.toString(),
          coverLetter: 'I have 3 years of farming experience.',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.application).toHaveProperty('_id');
      expect(res.body.data.application.status).toBe('pending');
      expect(res.body.data.application.jobSeekerId).toHaveProperty('firstName', 'Jane');
    });

    test('should return 409 for duplicate application', async () => {
      // First application
      await request(app)
        .post('/api/applications')
        .set('Authorization', `Bearer ${jobSeekerToken}`)
        .send({ jobId: jobId.toString() });

      // Duplicate attempt
      const res = await request(app)
        .post('/api/applications')
        .set('Authorization', `Bearer ${jobSeekerToken}`)
        .send({ jobId: jobId.toString() });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('already applied');
    });

    test('should return 404 when job does not exist', async () => {
      const fakeJobId = new mongoose.Types.ObjectId();

      const res = await request(app)
        .post('/api/applications')
        .set('Authorization', `Bearer ${jobSeekerToken}`)
        .send({ jobId: fakeJobId.toString() });

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Job not found');
    });

    test('should return 400 when job is not open', async () => {
      await Job.findByIdAndUpdate(jobId, { status: 'closed' });

      const res = await request(app)
        .post('/api/applications')
        .set('Authorization', `Bearer ${jobSeekerToken}`)
        .send({ jobId: jobId.toString() });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('no longer accepting');
    });

    test('should return 400 when employer applies to own job', async () => {
      // Register a user who is both employer-role but we use the employer token
      // The employer tries to apply — but POST requires job_seeker role, so 403
      const res = await request(app)
        .post('/api/applications')
        .set('Authorization', `Bearer ${employerToken}`)
        .send({ jobId: jobId.toString() });

      // Role middleware blocks employers from this route
      expect(res.status).toBe(403);
    });

    test('should return 401 without authentication', async () => {
      const res = await request(app).post('/api/applications').send({ jobId: jobId.toString() });

      expect(res.status).toBe(401);
    });
  });

  // GET /api/applications/my-applications

  describe('GET /api/applications/my-applications', () => {
    test('should return the job seekers applications with pagination', async () => {
      // Create two applications directly in DB
      const job2 = await Job.create({
        employerId,
        title: 'Second Job',
        description: 'Another opportunity with enough detail for validation to pass.',
        status: 'open',
      });

      await Application.create([
        { jobId, jobSeekerId, employerId, status: 'pending' },
        { jobId: job2._id, jobSeekerId, employerId, status: 'reviewed' },
      ]);

      const res = await request(app)
        .get('/api/applications/my-applications')
        .set('Authorization', `Bearer ${jobSeekerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.applications).toHaveLength(2);
      expect(res.body.data.pagination).toEqual(expect.objectContaining({ total: 2, page: 1 }));
    });

    test('should filter by status', async () => {
      await Application.create([{ jobId, jobSeekerId, employerId, status: 'pending' }]);

      const res = await request(app)
        .get('/api/applications/my-applications')
        .query({ status: 'reviewed' })
        .set('Authorization', `Bearer ${jobSeekerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.applications).toHaveLength(0);
    });

    test('should respect page and limit params', async () => {
      // Create 3 applications
      const jobs = await Job.create([
        {
          employerId,
          title: 'Job A',
          description: 'Detailed description for job A to satisfy schema validation rules.',
          status: 'open',
        },
        {
          employerId,
          title: 'Job B',
          description: 'Detailed description for job B to satisfy schema validation rules.',
          status: 'open',
        },
        {
          employerId,
          title: 'Job C',
          description: 'Detailed description for job C to satisfy schema validation rules.',
          status: 'open',
        },
      ]);

      await Application.create(
        jobs.map((j) => ({ jobId: j._id, jobSeekerId, employerId, status: 'pending' }))
      );

      const res = await request(app)
        .get('/api/applications/my-applications')
        .query({ page: 1, limit: 2 })
        .set('Authorization', `Bearer ${jobSeekerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.applications).toHaveLength(2);
      expect(res.body.data.pagination.total).toBe(3);
      expect(res.body.data.pagination.pages).toBe(2);
    });

    test('should return 403 for employer role', async () => {
      const res = await request(app)
        .get('/api/applications/my-applications')
        .set('Authorization', `Bearer ${employerToken}`);

      expect(res.status).toBe(403);
    });
  });

  // GET /api/applications/job/:jobId

  describe('GET /api/applications/job/:jobId', () => {
    test('should let the employer view applicants for their job', async () => {
      await Application.create({ jobId, jobSeekerId, employerId, status: 'pending' });

      const res = await request(app)
        .get(`/api/applications/job/${jobId}`)
        .set('Authorization', `Bearer ${employerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.applications).toHaveLength(1);
      expect(res.body.data.applications[0].jobSeekerId).toHaveProperty('firstName', 'Jane');
    });

    test('should return 403 when a different employer requests', async () => {
      const other = await createUserAndLogin({
        firstName: 'Other',
        lastName: 'Boss',
        email: 'other-employer@test.com',
        role: 'employer',
        phone: '94770000033',
      });

      const otherToken = other.token;

      const res = await request(app)
        .get(`/api/applications/job/${jobId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('not authorized');
    });

    test('should return 403 for job seeker role', async () => {
      const res = await request(app)
        .get(`/api/applications/job/${jobId}`)
        .set('Authorization', `Bearer ${jobSeekerToken}`);

      expect(res.status).toBe(403);
    });
  });

  // PATCH /api/applications/:id/status

  describe('PATCH /api/applications/:id/status', () => {
    let applicationId;

    beforeEach(async () => {
      const application = await Application.create({
        jobId,
        jobSeekerId,
        employerId,
        status: 'pending',
      });
      applicationId = application._id;
    });

    test('should let the employer transition pending → reviewed', async () => {
      const res = await request(app)
        .patch(`/api/applications/${applicationId}/status`)
        .set('Authorization', `Bearer ${employerToken}`)
        .send({ status: 'reviewed' });

      expect(res.status).toBe(200);
      expect(res.body.data.application.status).toBe('reviewed');
    });

    test('should let the employer transition pending → accepted', async () => {
      const res = await request(app)
        .patch(`/api/applications/${applicationId}/status`)
        .set('Authorization', `Bearer ${employerToken}`)
        .send({ status: 'accepted' });

      expect(res.status).toBe(200);
      expect(res.body.data.application.status).toBe('accepted');
    });

    test('should save employer notes alongside status change', async () => {
      const res = await request(app)
        .patch(`/api/applications/${applicationId}/status`)
        .set('Authorization', `Bearer ${employerToken}`)
        .send({ status: 'reviewed', employerNotes: 'Strong candidate' });

      expect(res.status).toBe(200);
      expect(res.body.data.application.employerNotes).toBe('Strong candidate');
    });

    test('should return 400 for invalid transition (accepted → pending)', async () => {
      // First move to accepted
      await Application.findByIdAndUpdate(applicationId, { status: 'accepted' });

      const res = await request(app)
        .patch(`/api/applications/${applicationId}/status`)
        .set('Authorization', `Bearer ${employerToken}`)
        .send({ status: 'pending' });

      // 'pending' is not in the validation enum, so express-validator rejects it
      expect([400, 422]).toContain(res.status);
    });

    test('should return 400 for invalid transition (rejected → accepted)', async () => {
      await Application.findByIdAndUpdate(applicationId, { status: 'rejected' });

      const res = await request(app)
        .patch(`/api/applications/${applicationId}/status`)
        .set('Authorization', `Bearer ${employerToken}`)
        .send({ status: 'accepted' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Cannot transition');
    });

    test('should return 403 when a non-owner employer updates', async () => {
      const other = await createUserAndLogin({
        firstName: 'Other',
        lastName: 'Employer',
        email: 'other-emp@test.com',
        role: 'employer',
        phone: '94770000034',
      });

      const otherToken = other.token;

      const res = await request(app)
        .patch(`/api/applications/${applicationId}/status`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ status: 'reviewed' });

      expect(res.status).toBe(403);
    });

    test('should return 403 when a job seeker tries to update status', async () => {
      const res = await request(app)
        .patch(`/api/applications/${applicationId}/status`)
        .set('Authorization', `Bearer ${jobSeekerToken}`)
        .send({ status: 'reviewed' });

      expect(res.status).toBe(403);
    });
  });

  // PATCH /api/applications/:id/withdraw

  describe('PATCH /api/applications/:id/withdraw', () => {
    let applicationId;

    beforeEach(async () => {
      const application = await Application.create({
        jobId,
        jobSeekerId,
        employerId,
        status: 'pending',
      });
      applicationId = application._id;
    });

    test('should let the job seeker withdraw a pending application', async () => {
      const res = await request(app)
        .patch(`/api/applications/${applicationId}/withdraw`)
        .set('Authorization', `Bearer ${jobSeekerToken}`)
        .send({ withdrawalReason: 'Found another job' });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('withdrawn');

      // Verify in DB
      const updated = await Application.findById(applicationId);
      expect(updated.status).toBe('withdrawn');
      expect(updated.withdrawalReason).toBe('Found another job');
    });

    test('should fail to withdraw after acceptance', async () => {
      await Application.findByIdAndUpdate(applicationId, { status: 'accepted' });

      const res = await request(app)
        .patch(`/api/applications/${applicationId}/withdraw`)
        .set('Authorization', `Bearer ${jobSeekerToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Cannot withdraw');
    });

    test('should fail to withdraw after rejection', async () => {
      await Application.findByIdAndUpdate(applicationId, { status: 'rejected' });

      const res = await request(app)
        .patch(`/api/applications/${applicationId}/withdraw`)
        .set('Authorization', `Bearer ${jobSeekerToken}`)
        .send({});

      expect(res.status).toBe(400);
    });

    test('should return 403 when another job seeker tries to withdraw', async () => {
      const other = await createUserAndLogin({
        firstName: 'Bob',
        lastName: 'Seeker',
        email: 'bob@test.com',
        role: 'job_seeker',
        phone: '94770000035',
      });

      const otherToken = other.token;

      const res = await request(app)
        .patch(`/api/applications/${applicationId}/withdraw`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({});

      expect(res.status).toBe(403);
    });

    test('should return 403 when employer tries to withdraw', async () => {
      const res = await request(app)
        .patch(`/api/applications/${applicationId}/withdraw`)
        .set('Authorization', `Bearer ${employerToken}`)
        .send({});

      // Role middleware blocks employers from this route
      expect(res.status).toBe(403);
    });
  });

  // GET /api/applications/check/:jobId/:userId

  describe('GET /api/applications/check/:jobId/:userId (review eligibility)', () => {
    test('should return true when an accepted application exists (self-check)', async () => {
      await Application.create({
        jobId,
        jobSeekerId,
        employerId,
        status: 'accepted',
      });

      const res = await request(app)
        .get(`/api/applications/check/${jobId}/${jobSeekerId}`)
        .set('Authorization', `Bearer ${jobSeekerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.hasAcceptedApplication).toBe(true);
      // V5 fix: the raw application document is no longer returned, only the flag.
      expect(res.body.data.application).toBeUndefined();
    });

    test('should return false when no accepted application exists (self-check)', async () => {
      await Application.create({
        jobId,
        jobSeekerId,
        employerId,
        status: 'pending',
      });

      const res = await request(app)
        .get(`/api/applications/check/${jobId}/${jobSeekerId}`)
        .set('Authorization', `Bearer ${jobSeekerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.hasAcceptedApplication).toBe(false);
    });

    test('should return false when no application exists at all (self-check)', async () => {
      const res = await request(app)
        .get(`/api/applications/check/${jobId}/${jobSeekerId}`)
        .set('Authorization', `Bearer ${jobSeekerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.hasAcceptedApplication).toBe(false);
    });

    // V5 — Public Application Disclosure (fix regression tests)

    test('SECURITY: should reject an unauthenticated request with 401', async () => {
      await Application.create({
        jobId,
        jobSeekerId,
        employerId,
        status: 'accepted',
      });

      const res = await request(app).get(`/api/applications/check/${jobId}/${jobSeekerId}`);

      expect(res.status).toBe(401);
    });

    test("SECURITY: should reject a request checking a different user's eligibility with 403", async () => {
      await Application.create({
        jobId,
        jobSeekerId,
        employerId,
        status: 'accepted',
      });

      // employer is authenticated, but tries to check the job seeker's eligibility
      const res = await request(app)
        .get(`/api/applications/check/${jobId}/${jobSeekerId}`)
        .set('Authorization', `Bearer ${employerToken}`);

      expect(res.status).toBe(403);
    });

    test('SECURITY: should never leak the raw application document, even on a valid self-check', async () => {
      await Application.create({
        jobId,
        jobSeekerId,
        employerId,
        status: 'accepted',
        employerNotes: 'Confidential note that must never be exposed via this endpoint',
      });

      const res = await request(app)
        .get(`/api/applications/check/${jobId}/${jobSeekerId}`)
        .set('Authorization', `Bearer ${jobSeekerToken}`);

      expect(res.status).toBe(200);
      expect(Object.keys(res.body.data)).toEqual(['hasAcceptedApplication']);
    });

    test("should allow an admin to check any user's eligibility", async () => {
      const admin = await createUserAndLogin({
        firstName: 'Admin',
        lastName: 'User',
        email: 'admin-check@test.com',
        role: 'job_seeker',
        phone: '94770000099',
      });
      await User.findByIdAndUpdate(admin.userId, { role: 'admin' });
      const adminLoginRes = await request(app)
        .post('/api/users/login')
        .send({ email: 'admin-check@test.com', password: 'password123' });
      const adminToken = adminLoginRes.body.token;

      await Application.create({
        jobId,
        jobSeekerId,
        employerId,
        status: 'accepted',
      });

      const res = await request(app)
        .get(`/api/applications/check/${jobId}/${jobSeekerId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.hasAcceptedApplication).toBe(true);
    });
  });

  // GET /api/applications/:id

  describe('GET /api/applications/:id', () => {
    let applicationId;

    beforeEach(async () => {
      const application = await Application.create({
        jobId,
        jobSeekerId,
        employerId,
        status: 'pending',
      });
      applicationId = application._id;
    });

    test('should let the job seeker view their own application', async () => {
      const res = await request(app)
        .get(`/api/applications/${applicationId}`)
        .set('Authorization', `Bearer ${jobSeekerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.application).toBeDefined();
    });

    test('should let the employer view the application', async () => {
      const res = await request(app)
        .get(`/api/applications/${applicationId}`)
        .set('Authorization', `Bearer ${employerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.application).toBeDefined();
    });

    test('should return 403 for an unrelated user', async () => {
      const other = await createUserAndLogin({
        firstName: 'Other',
        lastName: 'Person',
        email: 'other@test.com',
        role: 'job_seeker',
        phone: '94770000036',
      });

      const otherToken = other.token;

      const res = await request(app)
        .get(`/api/applications/${applicationId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(403);
    });

    test('should return 404 for non-existent application', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const res = await request(app)
        .get(`/api/applications/${fakeId}`)
        .set('Authorization', `Bearer ${jobSeekerToken}`);

      expect(res.status).toBe(404);
    });

    test('should return 401 without authentication', async () => {
      const res = await request(app).get(`/api/applications/${applicationId}`);

      expect(res.status).toBe(401);
    });
  });

  // PATCH /api/applications/:id/interview

  describe('PATCH /api/applications/:id/interview', () => {
    let applicationId;

    beforeEach(async () => {
      const application = await Application.create({
        jobId,
        jobSeekerId,
        employerId,
        status: 'shortlisted',
      });
      applicationId = application._id;
    });

    const futureIso = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    test('virtual interview: response includes jitsiRoomName', async () => {
      const res = await request(app)
        .patch(`/api/applications/${applicationId}/interview`)
        .set('Authorization', `Bearer ${employerToken}`)
        .send({
          interviewDate: futureIso(),
          interviewType: 'virtual',
          interviewDuration: 30,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.application.interviewType).toBe('virtual');
      expect(res.body.data.application.jitsiRoomName).toBeTruthy();
      expect(typeof res.body.data.application.jitsiRoomName).toBe('string');
    });

    test('in-person interview: no jitsiRoomName', async () => {
      const res = await request(app)
        .patch(`/api/applications/${applicationId}/interview`)
        .set('Authorization', `Bearer ${employerToken}`)
        .send({
          interviewDate: futureIso(),
          interviewType: 'in_person',
          interviewDuration: 30,
          interviewLocation: '123 Galle Rd, Colombo',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.application.interviewType).toBe('in_person');
      expect(res.body.data.application.jitsiRoomName).toBeFalsy();
      expect(res.body.data.application.interviewLocation).toContain('Galle');
    });

    test('rejects in_person without interviewLocation', async () => {
      const res = await request(app)
        .patch(`/api/applications/${applicationId}/interview`)
        .set('Authorization', `Bearer ${employerToken}`)
        .send({
          interviewDate: futureIso(),
          interviewType: 'in_person',
          interviewDuration: 30,
        });

      expect([400, 422]).toContain(res.status);
      expect(res.body.message).toBeTruthy();
    });

    test('rejects past interview date', async () => {
      const res = await request(app)
        .patch(`/api/applications/${applicationId}/interview`)
        .set('Authorization', `Bearer ${employerToken}`)
        .send({
          interviewDate: new Date(Date.now() - 86_400_000).toISOString(),
          interviewType: 'virtual',
          interviewDuration: 30,
        });

      expect(res.status).toBe(400);
      const raw = res.body.error;
      const details = Array.isArray(raw) ? raw : raw?.details;
      const fieldMsg = Array.isArray(details) ? details.map((d) => d.message).join(' ') : '';
      expect(`${res.body.message} ${fieldMsg}`).toMatch(/future|past/i);
    });

    test('rejects scheduling when application is not shortlisted', async () => {
      await Application.findByIdAndUpdate(applicationId, { status: 'pending' });

      const res = await request(app)
        .patch(`/api/applications/${applicationId}/interview`)
        .set('Authorization', `Bearer ${employerToken}`)
        .send({
          interviewDate: futureIso(),
          interviewType: 'virtual',
          interviewDuration: 30,
        });

      expect(res.status).toBe(400);
      expect(String(res.body.message)).toMatch(/shortlist/i);
    });
  });

  // GET /api/applications/:id/interview-join-context

  describe('GET /api/applications/:id/interview-join-context', () => {
    let applicationId;

    beforeEach(async () => {
      const application = await Application.create({
        jobId,
        jobSeekerId,
        employerId,
        status: 'shortlisted',
      });
      applicationId = application._id;
      const when = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      await Application.findByIdAndUpdate(applicationId, {
        interviewDate: when,
        interviewType: 'virtual',
        interviewDuration: 30,
        jitsiRoomName: 'jobloom-integration-test-room',
      });
    });

    test('returns 200 for employer with roomName and role', async () => {
      const res = await request(app)
        .get(`/api/applications/${applicationId}/interview-join-context`)
        .set('Authorization', `Bearer ${employerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.roomName).toBe('jobloom-integration-test-room');
      expect(res.body.data.role).toBe('employer');
      expect(res.body.data.displayName).toContain('John');
    });

    test('returns 200 for job seeker on the application', async () => {
      const res = await request(app)
        .get(`/api/applications/${applicationId}/interview-join-context`)
        .set('Authorization', `Bearer ${jobSeekerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.role).toBe('job_seeker');
      expect(res.body.data.displayName).toContain('Jane');
    });

    test('returns 403 for unrelated authenticated user', async () => {
      const other = await createUserAndLogin({
        firstName: 'Stranger',
        lastName: 'User',
        email: 'stranger-join@test.com',
        role: 'job_seeker',
        phone: '94770000099',
      });

      const res = await request(app)
        .get(`/api/applications/${applicationId}/interview-join-context`)
        .set('Authorization', `Bearer ${other.token}`);

      expect(res.status).toBe(403);
    });

    test('returns 400 for in-person interview (no video room)', async () => {
      await Application.findByIdAndUpdate(applicationId, {
        interviewType: 'in_person',
        interviewLocation: 'Office',
        jitsiRoomName: undefined,
      });

      const res = await request(app)
        .get(`/api/applications/${applicationId}/interview-join-context`)
        .set('Authorization', `Bearer ${employerToken}`);

      expect(res.status).toBe(400);
    });
  });

  // DELETE /api/applications/:id/interview

  describe('DELETE /api/applications/:id/interview', () => {
    let applicationId;

    beforeEach(async () => {
      const application = await Application.create({
        jobId,
        jobSeekerId,
        employerId,
        status: 'shortlisted',
        interviewDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        interviewType: 'virtual',
        interviewDuration: 30,
        jitsiRoomName: 'room-to-clear',
      });
      applicationId = application._id;
    });

    test('employer can cancel interview and fields are cleared', async () => {
      const res = await request(app)
        .delete(`/api/applications/${applicationId}/interview`)
        .set('Authorization', `Bearer ${employerToken}`);

      expect(res.status).toBe(200);

      const updated = await Application.findById(applicationId).lean();
      expect(updated.interviewDate).toBeUndefined();
      expect(updated.interviewType).toBeUndefined();
      expect(updated.jitsiRoomName).toBeUndefined();
    });

    test('returns 400 when no interview scheduled', async () => {
      await Application.findByIdAndUpdate(applicationId, {
        $unset: {
          interviewDate: 1,
          interviewType: 1,
          jitsiRoomName: 1,
          interviewDuration: 1,
        },
      });

      const res = await request(app)
        .delete(`/api/applications/${applicationId}/interview`)
        .set('Authorization', `Bearer ${employerToken}`);

      expect(res.status).toBe(400);
    });
  });

  // Full workflow: apply → review → accept → withdraw fails

  describe('Full application lifecycle', () => {
    test('apply → employer accepts → seeker cannot withdraw', async () => {
      // 1. Job seeker applies
      const applyRes = await request(app)
        .post('/api/applications')
        .set('Authorization', `Bearer ${jobSeekerToken}`)
        .send({ jobId: jobId.toString() });

      expect(applyRes.status).toBe(201);
      const applicationId = applyRes.body.data.application._id;

      // 2. Employer accepts
      const acceptRes = await request(app)
        .patch(`/api/applications/${applicationId}/status`)
        .set('Authorization', `Bearer ${employerToken}`)
        .send({ status: 'accepted' });

      expect(acceptRes.status).toBe(200);
      expect(acceptRes.body.data.application.status).toBe('accepted');

      // 3. Job seeker tries to withdraw — should fail
      const withdrawRes = await request(app)
        .patch(`/api/applications/${applicationId}/withdraw`)
        .set('Authorization', `Bearer ${jobSeekerToken}`)
        .send({});

      expect(withdrawRes.status).toBe(400);
      expect(withdrawRes.body.message).toContain('Cannot withdraw');

      // 4. Check endpoint confirms eligibility for reviews (caller must be the checked user)
      const checkRes = await request(app)
        .get(`/api/applications/check/${jobId}/${jobSeekerId}`)
        .set('Authorization', `Bearer ${jobSeekerToken}`);

      expect(checkRes.status).toBe(200);
      expect(checkRes.body.data.hasAcceptedApplication).toBe(true);
    });
  });
});
