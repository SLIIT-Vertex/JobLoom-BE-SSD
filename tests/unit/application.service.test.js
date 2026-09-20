import { jest } from '@jest/globals';
import mongoose from 'mongoose';

/**
 * Unit Tests for Application Service
 * Tests business logic with mocked Mongoose models
 */

// Helpers
const oid = () => new mongoose.Types.ObjectId();

// Fixed IDs reused across tests
const seekerId = oid();
const employerId = oid();
const jobId = oid();
const applicationId = oid();

// Mock factories

/** Build a fake Job document returned by Job.findById */
const makeJob = (overrides = {}) => ({
  _id: jobId,
  title: 'Node.js Developer',
  status: 'open',
  employerId,
  ...overrides,
});

/** Build a fake Application document with save / populate stubs */
const makeApplication = (overrides = {}) => {
  const app = {
    _id: applicationId,
    jobId,
    jobSeekerId: seekerId,
    employerId,
    status: 'pending',
    isActive: true,
    statusHistory: [],
    save: jest.fn().mockResolvedValue(undefined),
    populate: jest.fn().mockResolvedValue(undefined),
    toObject: jest.fn().mockReturnValue({
      _id: applicationId,
      jobId,
      jobSeekerId: { _id: seekerId },
      employerId: { _id: employerId },
      status: 'pending',
      isActive: true,
    }),
    ...overrides,
  };
  return app;
};

// Module-level mocks
// We must use unstable_mockModule because the project is ESM.

/**
 * Wraps a value in a thenable chain that supports .active().
 * Used because the service chains .active() on findById/find/countDocuments.
 */
const withActiveChain = (value) => {
  const chain = {};
  chain.active = jest.fn().mockReturnValue(chain);
  chain.then = (resolve, reject) => Promise.resolve(value).then(resolve, reject);
  chain.catch = (fn) => Promise.resolve(value).catch(fn);
  return chain;
};

const mockApplicationModel = {
  create: jest.fn(),
  findById: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  countDocuments: jest.fn(),
  aggregate: jest.fn(),
};

// Wrap findById so mockResolvedValue returns a chain with .active()
const findByIdFn = mockApplicationModel.findById;
findByIdFn.mockResolvedValue = function (value) {
  findByIdFn.mockImplementation(() => withActiveChain(value));
};

// Wrap find so mockReturnValue returns a chain with .active() in the fluent API
const findFn = mockApplicationModel.find;
findFn.mockImplementation((_query) => {
  const baseChain = {
    active: jest.fn().mockReturnValue(baseChain),
    populate: jest.fn().mockReturnValue(baseChain),
    sort: jest.fn().mockReturnValue(baseChain),
    skip: jest.fn().mockReturnValue(baseChain),
    limit: jest.fn().mockResolvedValue([]),
  };
  return baseChain;
});

// Wrap countDocuments so mockResolvedValue returns a chain with .active()
const countDocumentsFn = mockApplicationModel.countDocuments;
countDocumentsFn.mockResolvedValue = function (value) {
  countDocumentsFn.mockImplementation(() => withActiveChain(value));
};

const mockJobModel = {
  findById: jest.fn(),
};

jest.unstable_mockModule('../../src/modules/applications/application.model.js', () => ({
  default: mockApplicationModel,
}));

jest.unstable_mockModule('../../src/modules/jobs/job.model.js', () => ({
  default: mockJobModel,
}));

const sendInterviewScheduledEmail = jest.fn().mockResolvedValue({ sent: true });
const sendEmployerInterviewScheduledEmail = jest.fn().mockResolvedValue({ sent: true });
const sendInterviewCancelledEmail = jest.fn().mockResolvedValue({ sent: true });
const sendEmployerInterviewCancelledEmail = jest.fn().mockResolvedValue({ sent: true });
const sendApplicationDecisionEmail = jest.fn().mockResolvedValue({ sent: true });
const sendEmployerApplicationDecisionEmail = jest.fn().mockResolvedValue({ sent: true });

jest.unstable_mockModule('../../src/services/email.service.js', () => ({
  sendInterviewScheduledEmail,
  sendEmployerInterviewScheduledEmail,
  sendInterviewCancelledEmail,
  sendEmployerInterviewCancelledEmail,
  sendApplicationDecisionEmail,
  sendEmployerApplicationDecisionEmail,
}));

// Import service AFTER mocks are registered
const {
  applyForJob,
  getApplicationById,
  getMyApplications,
  getJobApplications,
  updateApplicationStatus,
  withdrawApplication,
  getApplicationStats,
  checkApplicationEligibility,
} = await import('../../src/modules/applications/application.service.js');

// Test suites

describe('Application Service — Unit Tests', () => {
  beforeEach(() => {
    // jest.config has resetMocks: true — restore async email stubs each test
    sendInterviewScheduledEmail.mockResolvedValue({ sent: true });
    sendEmployerInterviewScheduledEmail.mockResolvedValue({ sent: true });
    sendInterviewCancelledEmail.mockResolvedValue({ sent: true });
    sendEmployerInterviewCancelledEmail.mockResolvedValue({ sent: true });
    sendApplicationDecisionEmail.mockResolvedValue({ sent: true });
    sendEmployerApplicationDecisionEmail.mockResolvedValue({ sent: true });
  });

  // applyForJob

  describe('applyForJob', () => {
    test('should create an application successfully', async () => {
      const job = makeJob();
      mockJobModel.findById.mockResolvedValue(job);

      const createdApp = makeApplication();
      mockApplicationModel.create.mockResolvedValue(createdApp);

      const result = await applyForJob(seekerId, {
        jobId,
        coverLetter: 'I am a great fit',
        resumeUrl: 'https://example.com/resume.pdf',
      });

      expect(mockJobModel.findById).toHaveBeenCalledWith(jobId);
      expect(mockApplicationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId,
          jobSeekerId: seekerId,
          employerId: job.employerId,
          status: 'pending',
        })
      );
      expect(createdApp.populate).toHaveBeenCalled();
      expect(result).toBe(createdApp);
    });

    test('should throw 404 when job is not found', async () => {
      mockJobModel.findById.mockResolvedValue(null);

      await expect(applyForJob(seekerId, { jobId: oid() })).rejects.toMatchObject({
        statusCode: 404,
        message: 'Job not found',
      });
    });

    test('should throw 400 when job is not open', async () => {
      mockJobModel.findById.mockResolvedValue(makeJob({ status: 'closed' }));

      await expect(applyForJob(seekerId, { jobId })).rejects.toMatchObject({
        statusCode: 400,
        message: 'This job is no longer accepting applications',
      });
    });

    test('should throw 409 on duplicate application', async () => {
      mockJobModel.findById.mockResolvedValue(makeJob());

      const duplicateError = new Error('Duplicate');
      duplicateError.code = 11000;
      mockApplicationModel.create.mockRejectedValue(duplicateError);

      await expect(applyForJob(seekerId, { jobId })).rejects.toMatchObject({
        statusCode: 409,
        message: 'You have already applied for this job',
      });
    });

    test('should throw 400 when seeker is the employer', async () => {
      // The seeker ID matches the job's employerId
      mockJobModel.findById.mockResolvedValue(makeJob({ employerId: seekerId }));

      await expect(applyForJob(seekerId, { jobId })).rejects.toMatchObject({
        statusCode: 400,
        message: 'You cannot apply to your own job posting',
      });
    });
  });

  // withdrawApplication

  describe('withdrawApplication', () => {
    test('should withdraw a pending application successfully', async () => {
      const app = makeApplication({ status: 'pending' });
      mockApplicationModel.findById.mockResolvedValue(app);

      const result = await withdrawApplication(applicationId, seekerId, 'Found another job');

      expect(app.status).toBe('withdrawn');
      expect(app.withdrawalReason).toBe('Found another job');
      expect(app.save).toHaveBeenCalled();
      expect(result).toEqual({ message: 'Application withdrawn successfully' });
    });

    test('should throw 403 when requester is not the applicant', async () => {
      const app = makeApplication({ status: 'pending' });
      mockApplicationModel.findById.mockResolvedValue(app);

      const otherUser = oid();

      await expect(withdrawApplication(applicationId, otherUser)).rejects.toMatchObject({
        statusCode: 403,
        message: 'You are not authorized to withdraw this application',
      });
    });

    test('should throw 400 when application is already accepted', async () => {
      const app = makeApplication({ status: 'accepted' });
      mockApplicationModel.findById.mockResolvedValue(app);

      await expect(withdrawApplication(applicationId, seekerId)).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    test('should throw 400 when application is already rejected', async () => {
      const app = makeApplication({ status: 'rejected' });
      mockApplicationModel.findById.mockResolvedValue(app);

      await expect(withdrawApplication(applicationId, seekerId)).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  // updateApplicationStatus

  describe('updateApplicationStatus', () => {
    beforeEach(() => {
      sendApplicationDecisionEmail.mockClear();
    });

    test.each([
      ['pending', 'reviewed'],
      ['pending', 'shortlisted'],
      ['pending', 'accepted'],
      ['pending', 'rejected'],
      ['reviewed', 'shortlisted'],
      ['reviewed', 'accepted'],
      ['reviewed', 'rejected'],
      ['shortlisted', 'accepted'],
      ['shortlisted', 'rejected'],
    ])('should allow valid transition from %s → %s', async (from, to) => {
      const app = makeApplication({ status: from });
      mockApplicationModel.findById.mockResolvedValue(app);

      const result = await updateApplicationStatus(applicationId, employerId, to);

      expect(app.status).toBe(to);
      expect(app.save).toHaveBeenCalled();
      expect(app.populate).toHaveBeenCalled();
      expect(result).toBe(app);
    });

    test.each([
      ['accepted', 'pending'],
      ['accepted', 'reviewed'],
      ['rejected', 'pending'],
      ['rejected', 'accepted'],
      ['withdrawn', 'pending'],
    ])('should reject invalid transition from %s → %s', async (from, to) => {
      const app = makeApplication({ status: from });
      mockApplicationModel.findById.mockResolvedValue(app);

      await expect(updateApplicationStatus(applicationId, employerId, to)).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    test('should throw 403 when requester is not the employer', async () => {
      const app = makeApplication({ status: 'pending' });
      mockApplicationModel.findById.mockResolvedValue(app);

      const otherUser = oid();

      await expect(
        updateApplicationStatus(applicationId, otherUser, 'reviewed')
      ).rejects.toMatchObject({
        statusCode: 403,
        message: 'You are not authorized to update this application',
      });
    });

    test('should set reviewedAt on first review', async () => {
      const app = makeApplication({ status: 'pending', reviewedAt: undefined });
      mockApplicationModel.findById.mockResolvedValue(app);

      await updateApplicationStatus(applicationId, employerId, 'reviewed');

      expect(app.reviewedAt).toBeInstanceOf(Date);
    });

    test('should save employerNotes when provided', async () => {
      const app = makeApplication({ status: 'pending' });
      mockApplicationModel.findById.mockResolvedValue(app);

      await updateApplicationStatus(applicationId, employerId, 'reviewed', 'Great candidate');

      expect(app.employerNotes).toBe('Great candidate');
    });

    test('should throw 404 when application is not found', async () => {
      mockApplicationModel.findById.mockResolvedValue(null);

      await expect(
        updateApplicationStatus(applicationId, employerId, 'reviewed')
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    test('should not send decision email when transitioning to reviewed', async () => {
      const app = makeApplication({ status: 'pending' });
      mockApplicationModel.findById.mockResolvedValue(app);

      await updateApplicationStatus(applicationId, employerId, 'reviewed');

      expect(sendApplicationDecisionEmail).not.toHaveBeenCalled();
    });

    test('should send decision email when transitioning to accepted', async () => {
      const app = makeApplication({ status: 'shortlisted' });
      app.populate = jest.fn().mockImplementation(async function mockPop() {
        this.jobSeekerId = {
          email: 'seeker@test.com',
          firstName: 'Jane',
          lastName: 'Doe',
        };
        this.jobId = { title: 'Backend Developer' };
        this.employerId = {
          firstName: 'Acme',
          lastName: 'Recruiter',
          email: 'employer@test.com',
        };
        return this;
      });
      mockApplicationModel.findById.mockResolvedValue(app);

      await updateApplicationStatus(applicationId, employerId, 'accepted');

      expect(sendApplicationDecisionEmail).toHaveBeenCalledTimes(1);
      expect(sendApplicationDecisionEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'seeker@test.com',
          outcome: 'accepted',
          jobTitle: 'Backend Developer',
          seekerName: 'Jane Doe',
          employerName: 'Acme Recruiter',
          applicationUrl: expect.stringContaining(`/my-applications/${applicationId}`),
        })
      );
      expect(sendEmployerApplicationDecisionEmail).toHaveBeenCalledTimes(1);
      expect(sendEmployerApplicationDecisionEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'employer@test.com',
          outcome: 'accepted',
          seekerName: 'Jane Doe',
          employerName: 'Acme Recruiter',
          employerApplicationUrl: expect.stringContaining(
            `/employer/applications/${applicationId}`
          ),
        })
      );
    });

    test('should send decision email when transitioning to rejected', async () => {
      const app = makeApplication({ status: 'shortlisted' });
      app.populate = jest.fn().mockImplementation(async function mockPop() {
        this.jobSeekerId = {
          email: 'seeker2@test.com',
          firstName: 'John',
          lastName: 'Smith',
        };
        this.jobId = { title: 'QA Engineer' };
        this.employerId = {
          firstName: 'Hire',
          lastName: 'Co',
          email: 'hireco@test.com',
        };
        return this;
      });
      mockApplicationModel.findById.mockResolvedValue(app);

      await updateApplicationStatus(applicationId, employerId, 'rejected');

      expect(sendApplicationDecisionEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'seeker2@test.com',
          outcome: 'rejected',
          jobTitle: 'QA Engineer',
        })
      );
      expect(sendEmployerApplicationDecisionEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'hireco@test.com',
          outcome: 'rejected',
        })
      );
    });
  });

  // getMyApplications

  describe('getMyApplications', () => {
    test('should return paginated applications with defaults', async () => {
      const apps = [makeApplication(), makeApplication({ _id: oid() })];

      // Build a fluent query chain mock (service chains .active() first)
      const chainMock = {
        active: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(apps),
      };

      mockApplicationModel.find.mockReturnValue(chainMock);
      mockApplicationModel.countDocuments.mockResolvedValue(2);

      const result = await getMyApplications(seekerId);

      expect(mockApplicationModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ jobSeekerId: seekerId })
      );
      expect(chainMock.skip).toHaveBeenCalledWith(0); // page 1
      expect(chainMock.limit).toHaveBeenCalledWith(20); // default limit
      expect(result.applications).toHaveLength(2);
      expect(result.pagination).toEqual({
        total: 2,
        page: 1,
        limit: 20,
        pages: 1,
      });
    });

    test('should apply status filter when provided', async () => {
      const chainMock = {
        active: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([]),
      };

      mockApplicationModel.find.mockReturnValue(chainMock);
      mockApplicationModel.countDocuments.mockResolvedValue(0);

      await getMyApplications(seekerId, { status: 'pending', page: 2, limit: 5 });

      expect(mockApplicationModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending' })
      );
      expect(chainMock.skip).toHaveBeenCalledWith(5); // (page 2 - 1) * 5
      expect(chainMock.limit).toHaveBeenCalledWith(5);
    });

    test('should calculate correct number of pages', async () => {
      const chainMock = {
        active: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([]),
      };

      mockApplicationModel.find.mockReturnValue(chainMock);
      mockApplicationModel.countDocuments.mockResolvedValue(23);

      const result = await getMyApplications(seekerId, { page: 1, limit: 10 });

      expect(result.pagination.pages).toBe(3); // ceil(23/10)
    });
  });

  // getJobApplications

  describe('getJobApplications', () => {
    test('should return applications when employer owns the job', async () => {
      mockJobModel.findById.mockResolvedValue(makeJob());

      const apps = [makeApplication()];
      const chainMock = {
        active: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(apps),
      };

      mockApplicationModel.find.mockReturnValue(chainMock);
      mockApplicationModel.countDocuments.mockResolvedValue(1);

      const result = await getJobApplications(jobId, employerId);

      expect(result.applications).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
    });

    test('should throw 403 when requester is not the job employer', async () => {
      mockJobModel.findById.mockResolvedValue(makeJob());

      const otherUser = oid();

      await expect(getJobApplications(jobId, otherUser)).rejects.toMatchObject({
        statusCode: 403,
        message: 'You are not authorized to view applications for this job',
      });
    });

    test('should throw 404 when job does not exist', async () => {
      mockJobModel.findById.mockResolvedValue(null);

      await expect(getJobApplications(oid(), employerId)).rejects.toMatchObject({
        statusCode: 404,
        message: 'Job not found',
      });
    });
  });

  // getApplicationById

  describe('getApplicationById', () => {
    /**
     * Build a thenable Mongoose query chain so that
     * Application.findById(...).active().populate(...).populate(...).populate(...)
     * resolves to `result` when awaited.
     */
    const makeQueryChain = (result) => {
      const chain = {};
      chain.active = jest.fn().mockReturnValue(chain);
      chain.populate = jest.fn().mockReturnValue(chain);
      chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
      chain.catch = (fn) => Promise.resolve(result).catch(fn);
      return chain;
    };

    /** Populated application with both private fields present */
    const makePopulatedApp = (overrides = {}) => ({
      _id: applicationId,
      jobSeekerId: { _id: seekerId },
      employerId: { _id: employerId },
      status: 'pending',
      isActive: true,
      employerNotes: 'Strong candidate',
      notes: 'Ask about remote work',
      toObject: jest.fn().mockReturnValue({
        _id: applicationId,
        status: 'pending',
        isActive: true,
        employerNotes: 'Strong candidate',
        notes: 'Ask about remote work',
      }),
      ...overrides,
    });

    test('should return application with employerNotes stripped for job seeker', async () => {
      const app = makePopulatedApp();
      mockApplicationModel.findById.mockReturnValue(makeQueryChain(app));

      const result = await getApplicationById(applicationId, seekerId, 'jobseeker');

      expect(result).not.toHaveProperty('employerNotes');
      expect(result).toHaveProperty('notes', 'Ask about remote work');
    });

    test('should return application with notes stripped for employer', async () => {
      const app = makePopulatedApp();
      mockApplicationModel.findById.mockReturnValue(makeQueryChain(app));

      const result = await getApplicationById(applicationId, employerId, 'employer');

      expect(result).not.toHaveProperty('notes');
      expect(result).toHaveProperty('employerNotes', 'Strong candidate');
    });

    test('should return the full document for an admin without stripping either field', async () => {
      const app = makePopulatedApp();
      mockApplicationModel.findById.mockReturnValue(makeQueryChain(app));

      const result = await getApplicationById(applicationId, oid(), 'admin');

      // Admin receives the raw Mongoose document, not a plain object
      expect(result).toBe(app);
    });

    test('should throw 403 when requester is unrelated to the application', async () => {
      const app = makePopulatedApp();
      mockApplicationModel.findById.mockReturnValue(makeQueryChain(app));

      await expect(getApplicationById(applicationId, oid(), 'jobseeker')).rejects.toMatchObject({
        statusCode: 403,
        message: 'You are not authorized to view this application',
      });
    });

    test('should throw 404 when application does not exist', async () => {
      mockApplicationModel.findById.mockReturnValue(makeQueryChain(null));

      await expect(getApplicationById(applicationId, seekerId, 'jobseeker')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  // getApplicationStats

  describe('getApplicationStats', () => {
    test('should return correct per-status counts and total', async () => {
      mockJobModel.findById.mockResolvedValue(makeJob());
      mockApplicationModel.aggregate.mockResolvedValue([
        { _id: 'pending', count: 5 },
        { _id: 'reviewed', count: 2 },
        { _id: 'shortlisted', count: 1 },
      ]);

      const result = await getApplicationStats(jobId, employerId);

      expect(result.pending).toBe(5);
      expect(result.reviewed).toBe(2);
      expect(result.shortlisted).toBe(1);
      expect(result.accepted).toBe(0);
      expect(result.rejected).toBe(0);
      expect(result.withdrawn).toBe(0);
      expect(result.total).toBe(8);
    });

    test('should return all zeros when no applications exist', async () => {
      mockJobModel.findById.mockResolvedValue(makeJob());
      mockApplicationModel.aggregate.mockResolvedValue([]);

      const result = await getApplicationStats(jobId, employerId);

      expect(result.total).toBe(0);
      expect(result.pending).toBe(0);
      expect(result.accepted).toBe(0);
    });

    test('should throw 404 when job does not exist', async () => {
      mockJobModel.findById.mockResolvedValue(null);

      await expect(getApplicationStats(oid(), employerId)).rejects.toMatchObject({
        statusCode: 404,
        message: 'Job not found',
      });
    });

    test('should throw 403 when requester does not own the job', async () => {
      mockJobModel.findById.mockResolvedValue(makeJob());

      await expect(getApplicationStats(jobId, oid())).rejects.toMatchObject({
        statusCode: 403,
        message: 'You are not authorized to view stats for this job',
      });
    });
  });

  // checkApplicationEligibility

  describe('checkApplicationEligibility', () => {
    test('should return hasAcceptedApplication true when an accepted application exists (self-check)', async () => {
      mockApplicationModel.findOne.mockResolvedValue(makeApplication({ status: 'accepted' }));

      const result = await checkApplicationEligibility(jobId, seekerId, seekerId, 'job_seeker');

      expect(result.hasAcceptedApplication).toBe(true);
    });

    test('should return hasAcceptedApplication false when no accepted application exists (self-check)', async () => {
      mockApplicationModel.findOne.mockResolvedValue(null);

      const result = await checkApplicationEligibility(jobId, seekerId, seekerId, 'job_seeker');

      expect(result.hasAcceptedApplication).toBe(false);
    });

    test('should query using both jobSeekerId and employerId via $or', async () => {
      const userId = oid();
      mockApplicationModel.findOne.mockResolvedValue(null);

      await checkApplicationEligibility(jobId, userId, userId, 'job_seeker');

      expect(mockApplicationModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId,
          status: 'accepted',
          $or: expect.arrayContaining([{ jobSeekerId: userId }, { employerId: userId }]),
        })
      );
    });

    // V5 — Public Application Disclosure (fix regression tests)

    test('SECURITY: should never return the raw application document', async () => {
      const app = makeApplication({
        status: 'accepted',
        employerNotes: 'Confidential — must not be returned by this endpoint',
      });
      mockApplicationModel.findOne.mockResolvedValue(app);

      const result = await checkApplicationEligibility(jobId, seekerId, seekerId, 'job_seeker');

      expect(result).toEqual({ hasAcceptedApplication: true });
      expect(result.application).toBeUndefined();
    });

    test('SECURITY: should throw 403 when requester is checking a different user without admin role', async () => {
      const otherUserId = oid();

      await expect(
        checkApplicationEligibility(jobId, seekerId, otherUserId, 'employer')
      ).rejects.toMatchObject({
        statusCode: 403,
        message: 'You are not authorized to check this application',
      });
      expect(mockApplicationModel.findOne).not.toHaveBeenCalled();
    });

    test('SECURITY: should throw 403 when no requester is supplied (unauthenticated call)', async () => {
      await expect(checkApplicationEligibility(jobId, seekerId)).rejects.toMatchObject({
        statusCode: 403,
      });
      expect(mockApplicationModel.findOne).not.toHaveBeenCalled();
    });

    test("should allow an admin requester to check a different user's eligibility", async () => {
      const adminId = oid();
      mockApplicationModel.findOne.mockResolvedValue(makeApplication({ status: 'accepted' }));

      const result = await checkApplicationEligibility(jobId, seekerId, adminId, 'admin');

      expect(result.hasAcceptedApplication).toBe(true);
    });
  });
});
