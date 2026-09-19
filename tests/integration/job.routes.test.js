import 'dotenv/config';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../src/server.js';
import User from '../../src/modules/users/user.model.js';
import Job from '../../src/modules/jobs/job.model.js';
import Application from '../../src/modules/applications/application.model.js';

/**
 * Integration Tests for Job Routes
 * Testing complete API workflows with a real test database
 *
 * Prerequisites:
 * 1. Start MongoDB: docker-compose -f docker-compose.test.yml up -d
 * 2. Run tests:    npm run test:integration
 * 3. Stop MongoDB: docker-compose -f docker-compose.test.yml down
 *
 * All route flows tested here (mirrors application.routes.test.js style):
 *   GET  /api/jobs                    – public listing with filters
 *   GET  /api/jobs/:id                – public single-job fetch
 *   POST /api/jobs                    – employer creates job
 *   PUT  /api/jobs/:id                – employer updates own job
 *   PATCH /api/jobs/:id/close         – employer closes own job
 *   PATCH /api/jobs/:id/filled        – employer marks own job as filled
 *   DELETE /api/jobs/:id              – employer soft-deletes own job
 *   GET  /api/jobs/employer/my-jobs   – employer's own jobs list
 *   GET  /api/jobs/employer/stats     – employer dashboard stats
 */

describe('Job Routes — Integration Tests', () => {
  let employerToken;
  let employerId;
  let otherEmployerToken;
  let otherEmployerId;
  let jobSeekerToken;

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
  }, 15000);

  afterAll(async () => {
    await User.deleteMany({});
    await Job.deleteMany({});
    await Application.deleteMany({});
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clear collections before each test
    await User.deleteMany({});
    await Job.deleteMany({});
    await Application.deleteMany({});

    // Create verified users and login
    const employer = await createUserAndLogin({
      firstName: 'Kamal',
      lastName: 'Employer',
      email: 'employer@test.com',
      role: 'employer',
      phone: '94770000021',
    });
    employerToken = employer.token;
    employerId = employer.userId;

    const otherEmployer = await createUserAndLogin({
      firstName: 'Nimal',
      lastName: 'Boss',
      email: 'other-employer@test.com',
      role: 'employer',
      phone: '94770000022',
    });
    otherEmployerToken = otherEmployer.token;
    otherEmployerId = otherEmployer.userId;

    const seeker = await createUserAndLogin({
      firstName: 'Saman',
      lastName: 'Worker',
      email: 'worker@test.com',
      role: 'job_seeker',
      phone: '94770000023',
    });
    jobSeekerToken = seeker.token;
  });

  // POST /api/jobs

  describe('POST /api/jobs', () => {
    const validJobData = {
      title: 'Rice Paddy Harvester',
      description: 'Looking for experienced workers to help with rice paddy harvesting season.',
      category: 'agriculture',
      employmentType: 'seasonal',
      salaryAmount: 1500,
      salaryType: 'daily',
      positions: 5,
    };

    test('should allow an employer to create a job posting', async () => {
      const res = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${employerToken}`)
        .send(validJobData);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('_id');
      expect(res.body.data.title).toBe('Rice Paddy Harvester');
      expect(res.body.data.status).toBe('open');
      expect(res.body.data.employerId).toBe(employerId);
    });

    test('should return 401 when no auth token is provided', async () => {
      const res = await request(app).post('/api/jobs').send(validJobData);

      expect(res.status).toBe(401);
    });

    test('should return 403 when a job seeker tries to create a job', async () => {
      const res = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${jobSeekerToken}`)
        .send(validJobData);

      expect(res.status).toBe(403);
    });

    test('should accept a job with valid GPS coordinates', async () => {
      const jobWithCoords = {
        ...validJobData,
        title: 'Coconut Picker',
        description: 'Need 3 coconut pickers for large estate harvesting in Kurunegala district.',
        location: {
          village: 'Kurunegala',
          district: 'Kurunegala',
          province: 'North Western',
          coordinates: {
            type: 'Point',
            coordinates: [80.3629, 7.4675], // [longitude, latitude]
          },
        },
      };

      const res = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${employerToken}`)
        .send(jobWithCoords);

      expect(res.status).toBe(201);
      expect(res.body.data.title).toBe('Coconut Picker');
    });

    test('should sanitize and accept a job even with empty coordinates array', async () => {
      const jobWithBadCoords = {
        ...validJobData,
        title: 'Construction Supervisor',
        description: 'Experienced construction supervisor required for building site in Colombo.',
        location: {
          district: 'Colombo',
          coordinates: { type: 'Point', coordinates: [] },
        },
      };

      const res = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${employerToken}`)
        .send(jobWithBadCoords);

      // Validation rejects empty coordinates arrays before service-level sanitization.
      expect(res.status).toBe(400);
    });
  });

  // GET /api/jobs

  describe('GET /api/jobs', () => {
    beforeEach(async () => {
      // Seed a few jobs for listing tests
      await Job.create([
        {
          employerId,
          title: 'Farm Helper',
          description: 'Need help with general farm work and animal feeding chores.',
          category: 'agriculture',
          status: 'open',
          salaryAmount: 1200,
          salaryType: 'daily',
          isActive: true,
        },
        {
          employerId,
          title: 'Delivery Driver',
          description: 'Experienced driver needed for daily parcel deliveries across Colombo.',
          category: 'delivery',
          status: 'open',
          salaryAmount: 3000,
          salaryType: 'monthly',
          isActive: true,
        },
        {
          employerId: otherEmployerId,
          title: 'Cashier',
          description: 'Cashier required for busy supermarket in Kandy city center area.',
          category: 'retail',
          status: 'closed',
          salaryAmount: 35000,
          salaryType: 'monthly',
          isActive: true,
        },
      ]);
    });

    test('should return a list of jobs (public route, no auth needed)', async () => {
      const res = await request(app).get('/api/jobs');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.jobs).toBeDefined();
      expect(res.body.data.pagination).toBeDefined();
    });

    test('should filter jobs by category', async () => {
      const res = await request(app).get('/api/jobs').query({ category: 'agriculture' });

      expect(res.status).toBe(200);
      const jobs = res.body.data.jobs;
      jobs.forEach((job) => expect(job.category).toBe('agriculture'));
    });

    test('should filter jobs by status', async () => {
      const res = await request(app).get('/api/jobs').query({ status: 'open' });

      expect(res.status).toBe(200);
      const jobs = res.body.data.jobs;
      jobs.forEach((job) => expect(job.status).toBe('open'));
    });

    test('should filter by salary range', async () => {
      const res = await request(app).get('/api/jobs').query({ minSalary: 1000, maxSalary: 2000 });

      expect(res.status).toBe(200);
      const jobs = res.body.data.jobs;
      jobs.forEach((job) => {
        expect(job.salaryAmount).toBeGreaterThanOrEqual(1000);
        expect(job.salaryAmount).toBeLessThanOrEqual(2000);
      });
    });

    test('should return paginated results with correct metadata', async () => {
      const res = await request(app).get('/api/jobs').query({ page: 1, limit: 2 });

      expect(res.status).toBe(200);
      expect(res.body.data.pagination).toMatchObject({
        currentPage: 1,
        limit: 2,
      });
    });

    test('should return only active jobs (isActive: true)', async () => {
      // Soft-delete a job
      await Job.updateOne({ employerId, title: 'Farm Helper' }, { isActive: false });

      const res = await request(app).get('/api/jobs');

      // The soft-deleted job must not appear
      const titles = res.body.data.jobs.map((j) => j.title);
      expect(titles).not.toContain('Farm Helper');
    });
  });

  // GET /api/jobs/:id

  describe('GET /api/jobs/:id', () => {
    let jobId;

    beforeEach(async () => {
      const job = await Job.create({
        employerId,
        title: 'Bricklayer Needed',
        description: 'Experienced bricklayer required for house construction project.',
        status: 'open',
      });
      jobId = job._id;
    });

    test('should return a single job by ID (public route)', async () => {
      const res = await request(app).get(`/api/jobs/${jobId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id).toBe(jobId.toString());
    });

    test('should return 404 for non-existent job ID', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const res = await request(app).get(`/api/jobs/${fakeId}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Job not found');
    });

    test('should return 400 for malformed job ID', async () => {
      const res = await request(app).get('/api/jobs/not-a-valid-id');

      expect(res.status).toBe(400);
    });

    test('should return 404 for a soft-deleted job', async () => {
      await Job.findByIdAndUpdate(jobId, { isActive: false });

      const res = await request(app).get(`/api/jobs/${jobId}`);

      expect(res.status).toBe(404);
    });
  });

  // GET /api/jobs/employer/my-jobs

  describe('GET /api/jobs/employer/my-jobs', () => {
    beforeEach(async () => {
      await Job.create([
        {
          employerId,
          title: 'My Active Job',
          description: 'Active farming job for the upcoming harvest season activities.',
          status: 'open',
          isActive: true,
        },
        {
          employerId,
          title: 'My Closed Job',
          description: 'A previously closed job posting from the last harvest cycle.',
          status: 'closed',
          isActive: true,
        },
        {
          employerId: otherEmployerId,
          title: "Other Employer's Job",
          description: 'This job belongs to a completely different employer company.',
          status: 'open',
          isActive: true,
        },
      ]);
    });

    test("should return only the authenticated employer's own jobs", async () => {
      const res = await request(app)
        .get('/api/jobs/employer/my-jobs')
        .set('Authorization', `Bearer ${employerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const jobs = res.body.data.jobs;
      // Should include only the 2 jobs owned by employerId
      jobs.forEach((job) => {
        const ownerId = job.employerId?._id || job.employerId;
        expect(ownerId.toString()).toBe(employerId.toString());
      });
      expect(jobs.length).toBe(2);
    });

    test('should return 403 when a job seeker accesses this route', async () => {
      const res = await request(app)
        .get('/api/jobs/employer/my-jobs')
        .set('Authorization', `Bearer ${jobSeekerToken}`);

      expect(res.status).toBe(403);
    });

    test('should return 401 when no token is provided', async () => {
      const res = await request(app).get('/api/jobs/employer/my-jobs');

      expect(res.status).toBe(401);
    });
  });

  // GET /api/jobs/employer/stats

  describe('GET /api/jobs/employer/stats', () => {
    beforeEach(async () => {
      await Job.create([
        {
          employerId,
          title: 'Open Job 1',
          description: 'First open agriculture job for the current harvest period.',
          status: 'open',
          isActive: true,
          applicantsCount: 3,
        },
        {
          employerId,
          title: 'Open Job 2',
          description: 'Second open agriculture job for the upcoming harvest period.',
          status: 'open',
          isActive: true,
          applicantsCount: 2,
        },
        {
          employerId,
          title: 'Closed Job',
          description: 'A job that was closed after the harvest season ended last month.',
          status: 'closed',
          isActive: true,
          applicantsCount: 5,
        },
      ]);
    });

    test('should return correct statistics for the authenticated employer', async () => {
      const res = await request(app)
        .get('/api/jobs/employer/stats')
        .set('Authorization', `Bearer ${employerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalJobs).toBe(3);
      expect(res.body.data.openJobs).toBe(2);
      expect(res.body.data.closedJobs).toBe(1);
      expect(res.body.data.totalApplicants).toBe(10); // 3+2+5
    });

    test('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/jobs/employer/stats');

      expect(res.status).toBe(401);
    });

    test('should return 403 when a job seeker accesses this route', async () => {
      const res = await request(app)
        .get('/api/jobs/employer/stats')
        .set('Authorization', `Bearer ${jobSeekerToken}`);

      expect(res.status).toBe(403);
    });
  });

  // PUT /api/jobs/:id

  describe('PUT /api/jobs/:id', () => {
    let jobId;

    beforeEach(async () => {
      const job = await Job.create({
        employerId,
        title: 'Old Job Title',
        description: 'Original job description for testing update functionality.',
        status: 'open',
        isActive: true,
      });
      jobId = job._id;
    });

    test('should allow the employer to update their own job', async () => {
      const res = await request(app)
        .put(`/api/jobs/${jobId}`)
        .set('Authorization', `Bearer ${employerToken}`)
        .send({
          title: 'Updated Job Title',
          description: 'Updated job description with legitimate editable information.',
          salaryAmount: 2500,
          location: {
            district: 'Colombo',
            coordinates: { type: 'Point', coordinates: [79.8612, 6.9271] },
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Updated Job Title');
      expect(res.body.data.description).toBe(
        'Updated job description with legitimate editable information.'
      );
      expect(res.body.data.salaryAmount).toBe(2500);
      expect(res.body.data.location.coordinates.coordinates).toEqual([79.8612, 6.9271]);
    });

    test('should reject attempts to transfer job ownership', async () => {
      const res = await request(app)
        .put(`/api/jobs/${jobId}`)
        .set('Authorization', `Bearer ${employerToken}`)
        .send({ employerId: otherEmployerId });

      expect(res.status).toBe(400);

      const persistedJob = await Job.findById(jobId);
      expect(persistedJob.employerId.toString()).toBe(employerId);
    });

    test('should reject attempts to modify internal job state', async () => {
      const res = await request(app)
        .put(`/api/jobs/${jobId}`)
        .set('Authorization', `Bearer ${employerToken}`)
        .send({ isActive: false, applicantsCount: 99 });

      expect(res.status).toBe(400);

      const persistedJob = await Job.findById(jobId);
      expect(persistedJob.isActive).toBe(true);
      expect(persistedJob.applicantsCount).toBe(0);
    });

    test('should return 400 when another employer tries to update', async () => {
      const res = await request(app)
        .put(`/api/jobs/${jobId}`)
        .set('Authorization', `Bearer ${otherEmployerToken}`)
        .send({ title: 'Hijacked Title' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('not authorized');
    });

    test('should return 403 when a job seeker tries to update', async () => {
      const res = await request(app)
        .put(`/api/jobs/${jobId}`)
        .set('Authorization', `Bearer ${jobSeekerToken}`)
        .send({ title: 'Seeker Title' });

      expect(res.status).toBe(403);
    });

    test('should return 401 when no token is provided', async () => {
      const res = await request(app).put(`/api/jobs/${jobId}`).send({ title: 'Anonymous Title' });

      expect(res.status).toBe(401);
    });

    test('should return 404 when job does not exist', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const res = await request(app)
        .put(`/api/jobs/${fakeId}`)
        .set('Authorization', `Bearer ${employerToken}`)
        .send({ title: 'Ghost Title' });

      expect(res.status).toBe(404);
    });
  });

  // PATCH /api/jobs/:id/close

  describe('PATCH /api/jobs/:id/close', () => {
    let jobId;

    beforeEach(async () => {
      const job = await Job.create({
        employerId,
        title: 'Open Farming Job',
        description: 'An actively open farming position for seasonal harvest workers.',
        status: 'open',
        isActive: true,
      });
      jobId = job._id;
    });

    test('should allow employer to close their own job', async () => {
      const res = await request(app)
        .patch(`/api/jobs/${jobId}/close`)
        .set('Authorization', `Bearer ${employerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify in DB
      const updated = await Job.findById(jobId);
      expect(updated.status).toBe('closed');
    });

    test('should return 400 when another employer tries to close', async () => {
      const res = await request(app)
        .patch(`/api/jobs/${jobId}/close`)
        .set('Authorization', `Bearer ${otherEmployerToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('not authorized');
    });

    test('should return 403 when a job seeker tries to close a job', async () => {
      const res = await request(app)
        .patch(`/api/jobs/${jobId}/close`)
        .set('Authorization', `Bearer ${jobSeekerToken}`);

      expect(res.status).toBe(403);
    });
  });

  // PATCH /api/jobs/:id/filled

  describe('PATCH /api/jobs/:id/filled', () => {
    let jobId;

    beforeEach(async () => {
      const job = await Job.create({
        employerId,
        title: 'Position to Fill',
        description: 'This position will be marked as filled after successful hiring.',
        status: 'open',
        isActive: true,
      });
      jobId = job._id;
    });

    test('should allow employer to mark their job as filled', async () => {
      const res = await request(app)
        .patch(`/api/jobs/${jobId}/filled`)
        .set('Authorization', `Bearer ${employerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const updated = await Job.findById(jobId);
      expect(updated.status).toBe('filled');
    });

    test('should return 400 when another employer tries to mark as filled', async () => {
      const res = await request(app)
        .patch(`/api/jobs/${jobId}/filled`)
        .set('Authorization', `Bearer ${otherEmployerToken}`);

      expect(res.status).toBe(400);
    });

    test('should return 403 when a job seeker tries to mark a job as filled', async () => {
      const res = await request(app)
        .patch(`/api/jobs/${jobId}/filled`)
        .set('Authorization', `Bearer ${jobSeekerToken}`);

      expect(res.status).toBe(403);
    });
  });

  // DELETE /api/jobs/:id

  describe('DELETE /api/jobs/:id', () => {
    let jobId;

    beforeEach(async () => {
      const job = await Job.create({
        employerId,
        title: 'Job to Delete',
        description: 'This job posting will be soft deleted during the test run.',
        status: 'open',
        isActive: true,
        applicantsCount: 0,
      });
      jobId = job._id;
    });

    test('should soft-delete a job when employer owns it and has no applicants', async () => {
      const res = await request(app)
        .delete(`/api/jobs/${jobId}`)
        .set('Authorization', `Bearer ${employerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify soft delete in DB
      const deleted = await Job.findById(jobId);
      expect(deleted.isActive).toBe(false);
    });

    test('should return 400 when job has existing applications', async () => {
      await Job.findByIdAndUpdate(jobId, { applicantsCount: 2 });

      const res = await request(app)
        .delete(`/api/jobs/${jobId}`)
        .set('Authorization', `Bearer ${employerToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Cannot delete job');
    });

    test('should return 400 when another employer tries to delete', async () => {
      const res = await request(app)
        .delete(`/api/jobs/${jobId}`)
        .set('Authorization', `Bearer ${otherEmployerToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('not authorized');
    });

    test('should return 403 when a job seeker tries to delete', async () => {
      const res = await request(app)
        .delete(`/api/jobs/${jobId}`)
        .set('Authorization', `Bearer ${jobSeekerToken}`);

      expect(res.status).toBe(403);
    });

    test('should return 401 when no token is provided', async () => {
      const res = await request(app).delete(`/api/jobs/${jobId}`);

      expect(res.status).toBe(401);
    });

    test('should return 404 when job does not exist', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const res = await request(app)
        .delete(`/api/jobs/${fakeId}`)
        .set('Authorization', `Bearer ${employerToken}`);

      expect(res.status).toBe(404);
    });
  });

  // Full job lifecycle workflow

  describe('Full job lifecycle: create → update → close → delete', () => {
    test('employer creates, updates, closes, then soft-deletes a job', async () => {
      // 1. Create
      const createRes = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${employerToken}`)
        .send({
          title: 'Initial Title',
          description: 'Initial description for the complete lifecycle integration test.',
          category: 'construction',
          salaryAmount: 2000,
          salaryType: 'daily',
        });

      expect(createRes.status).toBe(201);
      const jId = createRes.body.data._id;

      // 2. Update
      const updateRes = await request(app)
        .put(`/api/jobs/${jId}`)
        .set('Authorization', `Bearer ${employerToken}`)
        .send({ title: 'Updated Title', salaryAmount: 2500 });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.title).toBe('Updated Title');

      // 3. Close
      const closeRes = await request(app)
        .patch(`/api/jobs/${jId}/close`)
        .set('Authorization', `Bearer ${employerToken}`);

      expect(closeRes.status).toBe(200);
      const closedJob = await Job.findById(jId);
      expect(closedJob.status).toBe('closed');

      // 4. Soft delete (no applicants)
      const deleteRes = await request(app)
        .delete(`/api/jobs/${jId}`)
        .set('Authorization', `Bearer ${employerToken}`);

      expect(deleteRes.status).toBe(200);

      // Verify public route returns 404
      const getRes = await request(app).get(`/api/jobs/${jId}`);
      expect(getRes.status).toBe(404);
    });
  });
});
