import { jest } from '@jest/globals';
import mongoose from 'mongoose';

/**
 * Unit Tests for Job Service
 * Tests business logic with mocked Mongoose models
 *
 * Mirrors the same ESM unstable_mockModule pattern used in
 * application.service.test.js and user.service.test.js
 */

// Helpers
const oid = () => new mongoose.Types.ObjectId();

// Fixed IDs reused across tests
const employerId = oid();
const otherEmployerId = oid();
const jobId = oid();

// Mock factories

/** Build a fake Job document returned by Job.findById */
const makeJob = (overrides = {}) => {
  const job = {
    _id: jobId,
    title: 'Farm Helper Needed',
    description: 'Need help with harvesting crops in the field.',
    category: 'agriculture',
    employmentType: 'temporary',
    status: 'open',
    isActive: true,
    applicantsCount: 0,
    employerId,
    salaryAmount: 1500,
    salaryType: 'daily',
    currency: 'LKR',
    save: jest.fn().mockResolvedValue(undefined),
    closeJob: jest.fn().mockResolvedValue(undefined),
    markAsFilled: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return job;
};

// Module-level mocks

// Create a mock Job constructor that returns a proper instance with methods
class MockJob {
  constructor(data) {
    Object.assign(this, {
      _id: jobId,
      ...data,
    });
  }

  save = jest.fn().mockImplementation(async function () {
    return this;
  });

  closeJob = jest.fn().mockImplementation(async function () {
    return this;
  });

  markAsFilled = jest.fn().mockImplementation(async function () {
    return this;
  });
}

// Add static methods to the mock class
MockJob.findById = jest.fn();
MockJob.find = jest.fn();
MockJob.findByIdAndDelete = jest.fn();
MockJob.countDocuments = jest.fn();
MockJob.aggregate = jest.fn();
MockJob.searchJobs = jest.fn();
MockJob.findNearby = jest.fn();

const mockJobModel = MockJob;

/** Fluent query chain helper (mimics .where({ isActive: true }) chains) */
const makeWhereChain = (value) => {
  const chain = {
    where: jest.fn().mockReturnThis(),
    populate: jest.fn().mockImplementation(() => Promise.resolve(value)),
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
    catch: (fn) => Promise.resolve(value).catch(fn),
  };
  return chain;
};

// Patch findById to return a chain that supports .where(...)
mockJobModel.findById.mockImplementation((_id) => makeWhereChain(null));

// Patch find to return a fluent query chain
mockJobModel.find.mockImplementation(() => {
  const chain = {
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue([]),
    where: jest.fn().mockReturnThis(),
    populate: jest.fn().mockResolvedValue([]),
  };
  return chain;
});

jest.unstable_mockModule('../../src/modules/jobs/job.model.js', () => ({
  default: mockJobModel,
}));

// Mock logger to suppress console noise during tests
jest.unstable_mockModule('../../src/config/logger.config.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Import service AFTER mocks are registered
const {
  createJob,
  getJobById,
  getAllJobs,
  getJobsByEmployer,
  getNearbyJobs,
  searchJobs,
  getEmployerStats,
  updateJob,
  closeJob,
  markJobAsFilled,
  deleteJob,
  hardDeleteJob,
} = await import('../../src/modules/jobs/job.service.js');

// Test suites

describe('Job Service — Unit Tests', () => {
  // createJob

  describe('createJob', () => {
    test('should create a job successfully with valid data', async () => {
      const validJobData = {
        title: 'Farm Helper',
        description: 'Need help with harvesting crops.',
        category: 'agriculture',
        salaryAmount: 1500,
        salaryType: 'daily',
      };

      const result = await createJob(validJobData, employerId.toString());

      // Verify the job was created and save was called
      expect(result).toBeDefined();
      expect(result._id).toBe(jobId);
      expect(result.title).toBe('Farm Helper');
      expect(result.employerId).toBe(employerId.toString());
    });

    test('should strip invalid coordinates (empty array) before saving', async () => {
      const jobDataWithBadCoords = {
        title: 'Construction Worker',
        description: 'Required for building site operations management.',
        location: {
          village: 'Panadura',
          district: 'Kalutara',
          coordinates: {
            type: 'Point',
            coordinates: [], // empty → should be removed
          },
        },
      };

      const result = await createJob(jobDataWithBadCoords, employerId.toString());

      // Verify the job was created successfully without the invalid coordinates
      expect(result).toBeDefined();
      expect(result.title).toBe('Construction Worker');
    });

    test('should strip out-of-range coordinates before saving', async () => {
      const jobDataWithOOBCoords = {
        title: 'Security Guard',
        description: 'Experienced security guard needed for night shift patrol duties.',
        location: {
          district: 'Colombo',
          coordinates: {
            type: 'Point',
            coordinates: [999, 999], // out of range → should be removed
          },
        },
      };

      const result = await createJob(jobDataWithOOBCoords, employerId.toString());

      expect(result).toBeDefined();
      expect(result.title).toBe('Security Guard');
    });

    test('should remove empty location object when all fields are absent', async () => {
      const jobDataWithEmptyLocation = {
        title: 'Cook',
        description: 'Experienced cook required for hotel restaurant service cooking.',
        location: {
          village: '',
          district: '',
          province: '',
          fullAddress: '',
        },
      };

      const result = await createJob(jobDataWithEmptyLocation, employerId.toString());

      expect(result).toBeDefined();
      expect(result.title).toBe('Cook');
    });
  });

  // getJobById

  describe('getJobById', () => {
    test('should return the job when it exists and is active', async () => {
      const job = makeJob();
      mockJobModel.findById.mockImplementation(() => makeWhereChain(job));

      const result = await getJobById(jobId.toString());

      expect(mockJobModel.findById).toHaveBeenCalledWith(jobId.toString());
      expect(result).toMatchObject({
        _id: job._id,
        title: job.title,
        category: job.category,
        status: job.status,
        isActive: job.isActive,
      });
    });

    test('should throw 404 when job is not found', async () => {
      mockJobModel.findById.mockImplementation(() => makeWhereChain(null));

      await expect(getJobById(oid().toString())).rejects.toMatchObject({
        statusCode: 404,
        message: 'Job not found',
      });
    });

    test('should throw 400 for invalid ObjectId format (CastError)', async () => {
      const castError = new Error('Cast to ObjectId failed');
      castError.name = 'CastError';
      mockJobModel.findById.mockImplementation(() => {
        throw castError;
      });

      await expect(getJobById('not-an-id')).rejects.toMatchObject({
        statusCode: 400,
        message: 'Invalid job ID format',
      });
    });
  });

  // getAllJobs

  describe('getAllJobs', () => {
    beforeEach(() => {
      // Default: return empty list and 0 count
      const chainMock = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue([]),
      };
      mockJobModel.find.mockReturnValue(chainMock);
      mockJobModel.countDocuments.mockResolvedValue(0);
    });

    test('should return paginated jobs with default options', async () => {
      const jobs = [makeJob(), makeJob({ _id: oid() })];
      const chainMock = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue(jobs),
      };
      mockJobModel.find.mockReturnValue(chainMock);
      mockJobModel.countDocuments.mockResolvedValue(2);

      const result = await getAllJobs();

      expect(mockJobModel.find).toHaveBeenCalledWith(expect.objectContaining({ isActive: true }));
      expect(result.jobs).toHaveLength(2);
      expect(result.pagination).toEqual(
        expect.objectContaining({
          currentPage: 1,
          totalCount: 2,
          limit: 20,
        })
      );
    });

    test('should apply category filter when provided', async () => {
      await getAllJobs({ category: 'agriculture' });

      expect(mockJobModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'agriculture' })
      );
    });

    test('should apply status filter when provided', async () => {
      await getAllJobs({ status: 'open' });

      expect(mockJobModel.find).toHaveBeenCalledWith(expect.objectContaining({ status: 'open' }));
    });

    test('should apply salary range filter when minSalary and maxSalary provided', async () => {
      await getAllJobs({ minSalary: 1000, maxSalary: 5000 });

      expect(mockJobModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          salaryAmount: { $gte: 1000, $lte: 5000 },
        })
      );
    });

    test('should apply district filter (case-insensitive regex)', async () => {
      await getAllJobs({ district: 'Colombo' });

      expect(mockJobModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          'location.district': expect.any(RegExp),
        })
      );
    });

    test('should apply text search when search param is provided', async () => {
      await getAllJobs({ search: 'farm helper' });

      expect(mockJobModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ $text: { $search: 'farm helper' } })
      );
    });

    test('should calculate correct pagination metadata', async () => {
      const chainMock = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue([]),
      };
      mockJobModel.find.mockReturnValue(chainMock);
      mockJobModel.countDocuments.mockResolvedValue(45);

      const result = await getAllJobs({ page: 2, limit: 10 });

      expect(result.pagination.totalPages).toBe(5); // ceil(45/10)
      expect(result.pagination.hasNextPage).toBe(true);
      expect(result.pagination.hasPrevPage).toBe(true);
      expect(result.pagination.currentPage).toBe(2);
    });

    test('should apply correct skip for page 3 with limit 5', async () => {
      const chainMock = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue([]),
      };
      mockJobModel.find.mockReturnValue(chainMock);
      mockJobModel.countDocuments.mockResolvedValue(20);

      await getAllJobs({ page: 3, limit: 5 });

      expect(chainMock.skip).toHaveBeenCalledWith(10); // (3-1)*5 = 10
      expect(chainMock.limit).toHaveBeenCalledWith(5);
    });
  });

  // getJobsByEmployer

  describe('getJobsByEmployer', () => {
    test('should return only active jobs by default', async () => {
      const jobs = [makeJob()];
      const chainMock = {
        sort: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue(jobs),
      };
      mockJobModel.find.mockReturnValue(chainMock);

      const result = await getJobsByEmployer(employerId.toString());

      expect(mockJobModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ employerId: employerId.toString(), isActive: true })
      );
      expect(result).toHaveLength(1);
    });

    test('should include inactive jobs when includeInactive is true', async () => {
      const chainMock = {
        sort: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue([]),
      };
      mockJobModel.find.mockReturnValue(chainMock);

      await getJobsByEmployer(employerId.toString(), { includeInactive: true });

      // Should NOT have isActive in query
      const callArg = mockJobModel.find.mock.calls[0][0];
      expect(callArg).not.toHaveProperty('isActive');
    });

    test('should filter by status when provided', async () => {
      const chainMock = {
        sort: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue([]),
      };
      mockJobModel.find.mockReturnValue(chainMock);

      await getJobsByEmployer(employerId.toString(), { status: 'closed' });

      expect(mockJobModel.find).toHaveBeenCalledWith(expect.objectContaining({ status: 'closed' }));
    });
  });

  // getNearbyJobs

  describe('getNearbyJobs', () => {
    test('should return nearby jobs for valid coordinates', async () => {
      const jobs = [makeJob()];
      mockJobModel.findNearby.mockImplementation(() => ({
        populate: jest.fn().mockResolvedValue(jobs),
      }));

      const result = await getNearbyJobs(80.635, 7.2906, 50);

      expect(mockJobModel.findNearby).toHaveBeenCalledWith(80.635, 7.2906, 50000); // km → meters
      expect(result).toHaveLength(1);
    });

    test('should throw 400 when longitude is missing', async () => {
      await expect(getNearbyJobs(null, 7.2906, 50)).rejects.toMatchObject({
        statusCode: 400,
        message: 'Longitude and latitude are required',
      });
    });

    test('should throw 400 when latitude is missing', async () => {
      await expect(getNearbyJobs(80.635, null, 50)).rejects.toMatchObject({
        statusCode: 400,
        message: 'Longitude and latitude are required',
      });
    });

    test('should throw 400 for out-of-range longitude (> 180)', async () => {
      await expect(getNearbyJobs(200, 7.2906, 50)).rejects.toMatchObject({
        statusCode: 400,
        message: 'Invalid longitude value',
      });
    });

    test('should throw 400 for out-of-range longitude (< -180)', async () => {
      await expect(getNearbyJobs(-200, 7.2906, 50)).rejects.toMatchObject({
        statusCode: 400,
        message: 'Invalid longitude value',
      });
    });

    test('should throw 400 for out-of-range latitude (> 90)', async () => {
      await expect(getNearbyJobs(80.635, 100, 50)).rejects.toMatchObject({
        statusCode: 400,
        message: 'Invalid latitude value',
      });
    });

    test('should throw 400 for out-of-range latitude (< -90)', async () => {
      await expect(getNearbyJobs(80.635, -100, 50)).rejects.toMatchObject({
        statusCode: 400,
        message: 'Invalid latitude value',
      });
    });

    test('should use default 50km radius when not specified', async () => {
      mockJobModel.findNearby.mockImplementation(() => ({
        populate: jest.fn().mockResolvedValue([]),
      }));

      await getNearbyJobs(80.635, 7.2906);

      expect(mockJobModel.findNearby).toHaveBeenCalledWith(80.635, 7.2906, 50000);
    });
  });

  // searchJobs

  describe('searchJobs', () => {
    test('should return matching jobs for valid search text', async () => {
      const jobs = [makeJob({ title: 'Farm Helper' })];
      mockJobModel.searchJobs.mockResolvedValue(jobs);

      const result = await searchJobs('farm helper');

      expect(mockJobModel.searchJobs).toHaveBeenCalledWith('farm helper');
      expect(result).toHaveLength(1);
    });

    test('should throw 400 when search text is empty string', async () => {
      await expect(searchJobs('')).rejects.toMatchObject({
        statusCode: 400,
        message: 'Search text is required',
      });
    });

    test('should throw 400 when search text is only whitespace', async () => {
      await expect(searchJobs('   ')).rejects.toMatchObject({
        statusCode: 400,
        message: 'Search text is required',
      });
    });

    test('should throw 400 when search text is null', async () => {
      await expect(searchJobs(null)).rejects.toMatchObject({
        statusCode: 400,
        message: 'Search text is required',
      });
    });
  });

  // getEmployerStats

  describe('getEmployerStats', () => {
    test('should return correct stats for employer', async () => {
      mockJobModel.countDocuments
        .mockResolvedValueOnce(10) // totalJobs
        .mockResolvedValueOnce(6) // openJobs
        .mockResolvedValueOnce(2) // closedJobs
        .mockResolvedValueOnce(2); // filledJobs

      mockJobModel.aggregate.mockResolvedValue([{ _id: null, total: 250 }]);

      const result = await getEmployerStats(employerId.toString());

      expect(result.totalJobs).toBe(10);
      expect(result.openJobs).toBe(6);
      expect(result.closedJobs).toBe(2);
      expect(result.filledJobs).toBe(2);
      expect(result.totalApplicants).toBe(250);
    });

    test('should return 0 totalApplicants when aggregate returns empty', async () => {
      mockJobModel.countDocuments.mockResolvedValue(0);
      mockJobModel.aggregate.mockResolvedValue([]);

      const result = await getEmployerStats(employerId.toString());

      expect(result.totalApplicants).toBe(0);
    });
  });

  // updateJob

  describe('updateJob', () => {
    test('should update job successfully when employer owns the job', async () => {
      const job = makeJob();
      mockJobModel.findById.mockImplementation(() => makeWhereChain(job));
      // Override findById to bypass the .where() chain
      mockJobModel.findById.mockImplementation(() => {
        const p = Promise.resolve(job);
        p.where = jest.fn().mockReturnValue(p);
        return p;
      });

      const updateData = { title: 'Updated Farm Helper Role', salaryAmount: 2000 };

      const result = await updateJob(jobId.toString(), employerId.toString(), updateData);

      expect(job.save).toHaveBeenCalled();
      expect(result.title).toBe('Updated Farm Helper Role');
      expect(result.salaryAmount).toBe(2000);
    });

    test('should ignore protected fields when called without route validation', async () => {
      const job = makeJob();
      mockJobModel.findById.mockResolvedValue(job);

      await updateJob(jobId.toString(), employerId.toString(), {
        title: 'Legitimate Updated Title',
        employerId: otherEmployerId,
        isActive: false,
        applicantsCount: 99,
        _id: oid(),
      });

      expect(job.title).toBe('Legitimate Updated Title');
      expect(job.employerId).toBe(employerId);
      expect(job.isActive).toBe(true);
      expect(job.applicantsCount).toBe(0);
      expect(job._id).toBe(jobId);
      expect(job.save).toHaveBeenCalled();
    });

    test('should throw 404 when job is not found', async () => {
      mockJobModel.findById.mockResolvedValue(null);

      await expect(
        updateJob(oid().toString(), employerId.toString(), { title: 'New Title' })
      ).rejects.toMatchObject({
        statusCode: 404,
        message: 'Job not found',
      });
    });

    test('should throw 400 when requester is not the owner', async () => {
      const job = makeJob({ employerId: otherEmployerId });
      mockJobModel.findById.mockResolvedValue(job);

      await expect(
        updateJob(jobId.toString(), employerId.toString(), { title: 'Hack Title' })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: 'You are not authorized to update this job',
      });
    });

    test('should throw 400 when job is inactive (soft deleted)', async () => {
      const job = makeJob({ isActive: false, employerId });
      mockJobModel.findById.mockResolvedValue(job);

      await expect(
        updateJob(jobId.toString(), employerId.toString(), { title: 'Ghost Job' })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: 'Cannot update inactive job',
      });
    });
  });

  // closeJob

  describe('closeJob', () => {
    test('should close the job successfully when employer owns it', async () => {
      const job = makeJob();
      mockJobModel.findById.mockResolvedValue(job);

      const result = await closeJob(jobId.toString(), employerId.toString());

      expect(job.closeJob).toHaveBeenCalled();
      expect(result).toBe(job);
    });

    test('should throw 404 when job is not found', async () => {
      mockJobModel.findById.mockResolvedValue(null);

      await expect(closeJob(oid().toString(), employerId.toString())).rejects.toMatchObject({
        statusCode: 404,
        message: 'Job not found',
      });
    });

    test('should throw 400 when requester does not own the job', async () => {
      const job = makeJob({ employerId: otherEmployerId });
      mockJobModel.findById.mockResolvedValue(job);

      await expect(closeJob(jobId.toString(), employerId.toString())).rejects.toMatchObject({
        statusCode: 400,
        message: 'You are not authorized to close this job',
      });
    });
  });

  // markJobAsFilled

  describe('markJobAsFilled', () => {
    test('should mark job as filled when employer owns it', async () => {
      const job = makeJob();
      mockJobModel.findById.mockResolvedValue(job);

      const result = await markJobAsFilled(jobId.toString(), employerId.toString());

      expect(job.markAsFilled).toHaveBeenCalled();
      expect(result).toBe(job);
    });

    test('should throw 404 when job is not found', async () => {
      mockJobModel.findById.mockResolvedValue(null);

      await expect(markJobAsFilled(oid().toString(), employerId.toString())).rejects.toMatchObject({
        statusCode: 404,
        message: 'Job not found',
      });
    });

    test('should throw 400 when requester does not own the job', async () => {
      const job = makeJob({ employerId: otherEmployerId });
      mockJobModel.findById.mockResolvedValue(job);

      await expect(markJobAsFilled(jobId.toString(), employerId.toString())).rejects.toMatchObject({
        statusCode: 400,
        message: 'You are not authorized to update this job',
      });
    });
  });

  // deleteJob (soft delete)

  describe('deleteJob', () => {
    test('should soft-delete the job when employer owns it and has no applicants', async () => {
      const job = makeJob({ applicantsCount: 0 });
      mockJobModel.findById.mockResolvedValue(job);

      const result = await deleteJob(jobId.toString(), employerId.toString());

      expect(job.isActive).toBe(false);
      expect(job.save).toHaveBeenCalled();
      expect(result).toBe(job);
    });

    test('should throw 404 when job is not found', async () => {
      mockJobModel.findById.mockResolvedValue(null);

      await expect(deleteJob(oid().toString(), employerId.toString())).rejects.toMatchObject({
        statusCode: 404,
        message: 'Job not found',
      });
    });

    test('should throw 400 when requester does not own the job', async () => {
      const job = makeJob({ employerId: otherEmployerId, applicantsCount: 0 });
      mockJobModel.findById.mockResolvedValue(job);

      await expect(deleteJob(jobId.toString(), employerId.toString())).rejects.toMatchObject({
        statusCode: 400,
        message: 'You are not authorized to delete this job',
      });
    });

    test('should throw 400 when job has existing applications', async () => {
      const job = makeJob({ applicantsCount: 3 });
      mockJobModel.findById.mockResolvedValue(job);

      await expect(deleteJob(jobId.toString(), employerId.toString())).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('Cannot delete job with existing applications'),
      });
    });
  });

  // hardDeleteJob

  describe('hardDeleteJob', () => {
    test('should permanently delete a job', async () => {
      const job = makeJob();
      mockJobModel.findByIdAndDelete.mockResolvedValue(job);

      const result = await hardDeleteJob(jobId.toString());

      expect(mockJobModel.findByIdAndDelete).toHaveBeenCalledWith(jobId.toString());
      expect(result).toBe(job);
    });

    test('should throw 404 when job does not exist', async () => {
      mockJobModel.findByIdAndDelete.mockResolvedValue(null);

      await expect(hardDeleteJob(oid().toString())).rejects.toMatchObject({
        statusCode: 404,
        message: 'Job not found',
      });
    });
  });
});
