import mongoose from 'mongoose';
import Job from './job.model.js';
import axios from 'axios';
import { BadRequestException, NotFoundException } from '../../models/http-exception.js';
import logger from '../../config/logger.config.js';
import envConfig from '../../config/env.config.js';
import { sanitizeJobDescription } from './job-description-sanitize.js';

const JOB_WRITABLE_FIELDS = [
  'title',
  'description',
  'category',
  'categoryLabel',
  'jobRole',
  'employmentType',
  'location',
  'salaryType',
  'salaryAmount',
  'currency',
  'skillsRequired',
  'experienceRequired',
  'positions',
  'startDate',
  'endDate',
];

const pickWritableJobFields = (jobData) => {
  const writableData = {};

  for (const field of JOB_WRITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(jobData, field)) {
      writableData[field] = jobData[field];
    }
  }

  return writableData;
};

/**
 * Job Service
 * Business logic for job management
 */

const EMPLOYER_POPULATE_SELECT = 'firstName lastName email companyName profileImage';

const buildEmployerCompanyName = (employer) => {
  if (!employer || typeof employer !== 'object') return 'Unknown employer';
  const explicit = employer.companyName || employer.company;
  if (explicit && String(explicit).trim()) return String(explicit).trim();
  const fullName = [employer.firstName, employer.lastName].filter(Boolean).join(' ').trim();
  if (fullName) return fullName;
  if (employer.email) return employer.email;
  return 'Unknown employer';
};

const normalizeJobEmployer = (jobDoc) => {
  const job = typeof jobDoc?.toObject === 'function' ? jobDoc.toObject() : { ...jobDoc };
  const employer = job?.employerId && typeof job.employerId === 'object' ? job.employerId : null;

  if (employer) {
    job.employer = {
      ...employer,
      companyName: buildEmployerCompanyName(employer),
    };
  }

  return job;
};

const calculateDistanceKm = (lat1, lng1, lat2, lng2) => {
  const toRad = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
};

const hasAllowedHtmlTags = (text = '') => /<\/?(p|h3|ul|li|strong)\b/i.test(text);

const normalizeToAllowedHtml = (rawText = '') => {
  const text = String(rawText || '').trim();
  if (!text) return '';
  if (hasAllowedHtmlTags(text)) return text;

  const cleaned = text
    .replace(/^```(?:html)?/i, '')
    .replace(/```$/i, '')
    .replace(/\r/g, '')
    .trim();

  const lines = cleaned
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const overview = [];
  const responsibilities = [];
  const requirements = [];
  const benefits = [];
  let section = 'overview';

  for (const line of lines) {
    const normalized = line.replace(/\*\*/g, '').replace(/:$/, '').trim();
    const lower = normalized.toLowerCase();

    if (lower.includes('key responsibilities') || lower === 'responsibilities') {
      section = 'responsibilities';
      continue;
    }
    if (lower.includes('qualifications') || lower.includes('requirements')) {
      section = 'requirements';
      continue;
    }
    if (lower.includes('why join') || lower.includes('benefits')) {
      section = 'benefits';
      continue;
    }
    if (lower.includes('how to apply')) {
      continue;
    }

    const item = line
      .replace(/^[-*]\s+/, '')
      .replace(/\*\*/g, '')
      .trim();
    if (!item) continue;

    if (/^[-*]\s+/.test(line)) {
      if (section === 'responsibilities') responsibilities.push(item);
      else if (section === 'requirements') requirements.push(item);
      else if (section === 'benefits') benefits.push(item);
      else overview.push(item);
      continue;
    }

    if (section === 'overview') overview.push(item);
    else if (section === 'responsibilities') responsibilities.push(item);
    else if (section === 'requirements') requirements.push(item);
    else if (section === 'benefits') benefits.push(item);
  }

  const overviewText = overview.join(' ');
  const toList = (items, fallbackItems = []) => {
    const data = items.length > 0 ? items : fallbackItems;
    return `<ul>${data.map((item) => `<li>${item}</li>`).join('')}</ul>`;
  };

  return [
    '<h3>Job Overview</h3>',
    `<p>${overviewText || 'We are looking for a motivated candidate to join our team.'}</p>`,
    '<h3>Key Responsibilities</h3>',
    toList(responsibilities, ['Perform day-to-day duties related to the role.']),
    '<h3>Requirements</h3>',
    toList(requirements, ['Good communication and collaboration skills.']),
    '<h3>Benefits</h3>',
    toList(benefits, ['Supportive team environment and growth opportunities.']),
  ].join('');
};

/**
 * Create a new job posting
 * @param {Object} jobData - Job information
 * @param {String} employerId - ID of the employer creating the job
 * @returns {Promise<Object>} Created job
 */
export const createJob = async (jobData, employerId) => {
  try {
    // Deep clean coordinates - remove if empty or invalid
    if (jobData.location) {
      // Check and clean coordinates
      if (jobData.location.coordinates) {
        const coords = jobData.location.coordinates.coordinates;
        // Remove coordinates if:
        // - coordinates array doesn't exist
        // - coordinates is not an array
        // - coordinates array is empty
        // - coordinates array doesn't have exactly 2 elements
        // - coordinates are not numbers
        // - coordinates are NaN
        // - coordinates are out of valid range
        if (
          !coords ||
          !Array.isArray(coords) ||
          coords.length === 0 ||
          coords.length !== 2 ||
          typeof coords[0] !== 'number' ||
          typeof coords[1] !== 'number' ||
          isNaN(coords[0]) ||
          isNaN(coords[1]) ||
          coords[0] < -180 ||
          coords[0] > 180 ||
          coords[1] < -90 ||
          coords[1] > 90
        ) {
          // Completely remove invalid coordinates
          delete jobData.location.coordinates;
        }
      }

      // Also check if coordinates object exists but is malformed
      if (
        jobData.location.coordinates &&
        (!jobData.location.coordinates.coordinates ||
          !Array.isArray(jobData.location.coordinates.coordinates) ||
          jobData.location.coordinates.coordinates.length === 0)
      ) {
        delete jobData.location.coordinates;
      }

      // Remove empty location fields
      if (
        !jobData.location.village &&
        !jobData.location.district &&
        !jobData.location.province &&
        !jobData.location.fullAddress &&
        !jobData.location.coordinates
      ) {
        delete jobData.location;
      }
    }

    // Final safety check: ensure coordinates are completely removed if invalid
    // This is the LAST line of defense before creating the Mongoose model
    if (jobData.location && jobData.location.coordinates) {
      const finalCoords = jobData.location.coordinates.coordinates;
      // Remove if: missing, not array, empty array, wrong length, or invalid values
      if (
        !finalCoords ||
        !Array.isArray(finalCoords) ||
        finalCoords.length === 0 ||
        finalCoords.length !== 2 ||
        typeof finalCoords[0] !== 'number' ||
        typeof finalCoords[1] !== 'number' ||
        isNaN(finalCoords[0]) ||
        isNaN(finalCoords[1])
      ) {
        // Force remove coordinates completely - use multiple methods
        jobData.location.coordinates = undefined;
        delete jobData.location.coordinates;
        // Also remove from the location object entirely
        if (
          jobData.location.coordinates === undefined ||
          (jobData.location.coordinates &&
            jobData.location.coordinates.coordinates &&
            jobData.location.coordinates.coordinates.length === 0)
        ) {
          delete jobData.location.coordinates;
        }
      }
    }

    // Log before creating model to debug
    if (jobData.location && jobData.location.coordinates) {
      logger.warn('WARNING: Coordinates still present before model creation:', {
        coordinates: jobData.location.coordinates,
      });
    }

    // ULTIMATE FINAL CHECK: Remove coordinates with empty array
    // This is the absolute last check before creating the Mongoose model
    if (jobData.location) {
      if (jobData.location.coordinates) {
        const coordsArray = jobData.location.coordinates.coordinates;
        // If coordinates array is empty, remove the entire coordinates object
        if (Array.isArray(coordsArray) && coordsArray.length === 0) {
          logger.error('CRITICAL: Found empty coordinates array, removing:', {
            coordinates: jobData.location.coordinates,
          });
          delete jobData.location.coordinates;
          jobData.location.coordinates = undefined;
        }
      }
    }

    // Log skills data before creating model
    logger.info('Job data before model creation:', {
      hasSkillsRequired: !!jobData.skillsRequired,
      skillsRequired: jobData.skillsRequired,
      skillsRequiredType: Array.isArray(jobData.skillsRequired)
        ? 'array'
        : typeof jobData.skillsRequired,
      skillsRequiredLength: Array.isArray(jobData.skillsRequired)
        ? jobData.skillsRequired.length
        : 'N/A',
    });

    const createData = pickWritableJobFields(jobData);

    if (typeof createData.description === 'string') {
      createData.description = sanitizeJobDescription(createData.description);
    }

    // Ownership, lifecycle state, counters, timestamps, and document IDs are server-owned.
    const job = new Job({
      ...createData,
      employerId,
    });

    // Save to database
    await job.save();

    // Log after save to verify skills were saved
    logger.info('Job saved with skills:', {
      jobId: job._id,
      skillsRequired: job.skillsRequired,
      skillsRequiredLength: job.skillsRequired?.length || 0,
    });

    logger.info(`Job created successfully: ${job._id}`, {
      jobId: job._id,
      employerId,
      title: job.title,
    });

    return job;
  } catch (error) {
    logger.error('Error creating job:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
      jobData: {
        hasLocation: !!jobData.location,
        hasCoordinates: !!(jobData.location && jobData.location.coordinates),
        locationKeys: jobData.location ? Object.keys(jobData.location) : [],
      },
    });
    throw error;
  }
};

/**
 * Get job by ID
 * @param {String} jobId - Job ID
 * @returns {Promise<Object>} Job details
 */
export const getJobById = async (jobId) => {
  try {
    const job = await Job.findById(jobId)
      .where({ isActive: true })
      .populate('employerId', EMPLOYER_POPULATE_SELECT);

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    return normalizeJobEmployer(job);
  } catch (error) {
    if (error.name === 'CastError') {
      throw new BadRequestException('Invalid job ID format');
    }
    throw error;
  }
};

/**
 * Get all jobs with filtering, searching, sorting, and pagination
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Jobs list with pagination
 */
export const getAllJobs = async (options = {}) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      status,
      search,
      minSalary,
      maxSalary,
      salaryType,
      district,
      province,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = options;

    // Build query
    const query = { isActive: true };

    // Filter by category
    if (category) {
      query.category = category;
    }

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Filter by district
    if (district) {
      query['location.district'] = new RegExp(district, 'i');
    }

    // Filter by province
    if (province) {
      query['location.province'] = new RegExp(province, 'i');
    }

    // Filter by salary range
    if (minSalary || maxSalary) {
      query.salaryAmount = {};
      if (minSalary) query.salaryAmount.$gte = Number(minSalary);
      if (maxSalary) query.salaryAmount.$lte = Number(maxSalary);
    }

    // Filter by salary type
    if (salaryType) {
      query.salaryType = salaryType;
    }

    // Text search
    if (search) {
      query.$text = { $search: search };
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query
    const [jobs, totalCount] = await Promise.all([
      Job.find(query)
        .sort(sort)
        .skip(skip)
        .limit(Number(limit))
        .populate('employerId', EMPLOYER_POPULATE_SELECT),
      Job.countDocuments(query),
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return {
      jobs: jobs.map(normalizeJobEmployer),
      pagination: {
        currentPage: Number(page),
        totalPages,
        totalCount,
        limit: Number(limit),
        hasNextPage,
        hasPrevPage,
      },
    };
  } catch (error) {
    logger.error('Error fetching jobs:', error);
    throw error;
  }
};

/**
 * Get jobs by employer ID
 * @param {String} employerId - Employer ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Employer's jobs
 */
export const getJobsByEmployer = async (employerId, options = {}) => {
  try {
    const { includeInactive = false, status } = options;

    const query = { employerId };

    if (!includeInactive) {
      query.isActive = true;
    }

    if (status) {
      query.status = status;
    }

    const jobs = await Job.find(query)
      .sort({ createdAt: -1 })
      .populate('employerId', EMPLOYER_POPULATE_SELECT);

    logger.info(`Retrieved ${jobs.length} jobs for employer: ${employerId}`);

    return jobs.map(normalizeJobEmployer);
  } catch (error) {
    logger.error('Error fetching employer jobs:', error);
    throw error;
  }
};

/**
 * Get nearby jobs using geospatial query (Mapbox integration)
 * @param {Number} longitude - User's longitude
 * @param {Number} latitude - User's latitude
 * @param {Number} radiusInKm - Search radius in kilometers (default: 50km)
 * @returns {Promise<Array>} Nearby jobs
 */
export const getNearbyJobs = async (longitude, latitude, radiusInKm = 50) => {
  try {
    // Validate coordinates
    if (
      longitude === undefined ||
      longitude === null ||
      latitude === undefined ||
      latitude === null
    ) {
      throw new BadRequestException('Longitude and latitude are required');
    }

    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new BadRequestException('Invalid longitude value');
    }

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new BadRequestException('Invalid latitude value');
    }

    // Convert km to meters
    const radiusInMeters = radiusInKm * 1000;

    try {
      const jobs = await Job.findNearby(longitude, latitude, radiusInMeters).populate(
        'employerId',
        EMPLOYER_POPULATE_SELECT
      );

      logger.info(`Found ${jobs.length} jobs within ${radiusInKm}km radius`);
      return jobs.map(normalizeJobEmployer);
    } catch (geoError) {
      const missingGeoIndex =
        geoError?.name === 'MongoServerError' &&
        typeof geoError?.message === 'string' &&
        geoError.message
          .toLowerCase()
          .includes('unable to find index for $geoNear query'.toLowerCase());

      if (!missingGeoIndex) {
        throw geoError;
      }

      logger.warn('2dsphere index missing. Falling back to manual nearby calculation.');

      const jobsWithCoordinates = await Job.find({
        status: 'open',
        isActive: true,
        'location.coordinates.type': 'Point',
      }).populate('employerId', EMPLOYER_POPULATE_SELECT);

      const nearbyJobs = jobsWithCoordinates
        .map((jobDoc) => {
          const job = normalizeJobEmployer(jobDoc);
          const coords = job?.location?.coordinates?.coordinates;

          if (!Array.isArray(coords) || coords.length !== 2) return null;
          const [jobLng, jobLat] = coords;
          if (!Number.isFinite(jobLng) || !Number.isFinite(jobLat)) return null;

          const distanceKm = calculateDistanceKm(latitude, longitude, jobLat, jobLng);
          if (distanceKm > radiusInKm) return null;

          return { ...job, distance: Number(distanceKm.toFixed(2)) };
        })
        .filter(Boolean)
        .sort((a, b) => a.distance - b.distance);

      logger.info(`Found ${nearbyJobs.length} jobs within ${radiusInKm}km radius (fallback mode)`);
      return nearbyJobs;
    }
  } catch (error) {
    logger.error('Error fetching nearby jobs:', error);
    throw error;
  }
};

/**
 * Search jobs by text
 * @param {String} searchText - Search query
 * @returns {Promise<Array>} Matching jobs
 */
export const searchJobs = async (searchText) => {
  try {
    if (!searchText || searchText.trim().length === 0) {
      throw new BadRequestException('Search text is required');
    }

    const jobs = await Job.searchJobs(searchText);

    logger.info(`Search "${searchText}" returned ${jobs.length} results`);

    return jobs;
  } catch (error) {
    logger.error('Error searching jobs:', error);
    throw error;
  }
};

/**
 * Get job statistics for employer dashboard
 * @param {String} employerId - Employer ID
 * @returns {Promise<Object>} Statistics
 */
export const getEmployerStats = async (employerId) => {
  try {
    // Convert string employerId to mongoose.Types.ObjectId for aggregation
    const employerObjectId = new mongoose.Types.ObjectId(employerId);

    const [totalJobs, openJobs, closedJobs, filledJobs, totalApplicants] = await Promise.all([
      Job.countDocuments({ employerId: employerObjectId, isActive: true }),
      Job.countDocuments({ employerId: employerObjectId, status: 'open', isActive: true }),
      Job.countDocuments({ employerId: employerObjectId, status: 'closed', isActive: true }),
      Job.countDocuments({ employerId: employerObjectId, status: 'filled', isActive: true }),
      Job.aggregate([
        { $match: { employerId: employerObjectId, isActive: true } },
        { $group: { _id: null, total: { $sum: '$applicantsCount' } } },
      ]),
    ]);

    return {
      totalJobs,
      openJobs,
      closedJobs,
      filledJobs,
      totalApplicants: totalApplicants[0]?.total || 0,
    };
  } catch (error) {
    logger.error('Error fetching employer stats:', error);
    throw error;
  }
};

/**
 * Update job details
 * @param {String} jobId - Job ID
 * @param {String} employerId - Employer ID (for authorization)
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} Updated job
 */
export const updateJob = async (jobId, employerId, updateData) => {
  try {
    const job = await Job.findById(jobId);

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    // Authorization check
    if (job.employerId.toString() !== employerId) {
      throw new BadRequestException('You are not authorized to update this job');
    }

    // Business rule: Cannot update if job is not active
    if (!job.isActive) {
      throw new BadRequestException('Cannot update inactive job');
    }

    if (typeof updateData.description === 'string') {
      updateData.description = sanitizeJobDescription(updateData.description);
    }

    // Assign only fields supported by the employer update API. Ownership,
    // counters, soft-delete state, timestamps, and document IDs remain server-owned.
    for (const [field, value] of Object.entries(pickWritableJobFields(updateData))) {
      job[field] = value;
    }

    // Keep category/categoryLabel consistent when category is changed
    if (Object.prototype.hasOwnProperty.call(updateData, 'category')) {
      if (updateData.category !== 'other') {
        job.categoryLabel = undefined;
      } else {
        const label =
          typeof updateData.categoryLabel === 'string' ? updateData.categoryLabel.trim() : '';
        job.categoryLabel = label || undefined;
      }
    }

    await job.save();

    logger.info(`Job updated successfully: ${jobId}`, {
      jobId,
      employerId,
    });

    return job;
  } catch (error) {
    logger.error('Error updating job:', error);
    throw error;
  }
};

/**
 * Close a job posting
 * @param {String} jobId - Job ID
 * @param {String} employerId - Employer ID
 * @returns {Promise<Object>} Updated job
 */
export const closeJob = async (jobId, employerId) => {
  try {
    const job = await Job.findById(jobId);

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (job.employerId.toString() !== employerId) {
      throw new BadRequestException('You are not authorized to close this job');
    }

    await job.closeJob();

    logger.info(`Job closed: ${jobId}`);

    return job;
  } catch (error) {
    logger.error('Error closing job:', error);
    throw error;
  }
};

/**
 * Mark job as filled
 * @param {String} jobId - Job ID
 * @param {String} employerId - Employer ID
 * @returns {Promise<Object>} Updated job
 */
export const markJobAsFilled = async (jobId, employerId) => {
  try {
    const job = await Job.findById(jobId);

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (job.employerId.toString() !== employerId) {
      throw new BadRequestException('You are not authorized to update this job');
    }

    await job.markAsFilled();

    logger.info(`Job marked as filled: ${jobId}`);

    return job;
  } catch (error) {
    logger.error('Error marking job as filled:', error);
    throw error;
  }
};

/**
 * Delete a job (soft delete)
 * @param {String} jobId - Job ID
 * @param {String} employerId - Employer ID
 * @returns {Promise<Object>} Deleted job
 */
export const deleteJob = async (jobId, employerId) => {
  try {
    const job = await Job.findById(jobId);

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (job.employerId.toString() !== employerId) {
      throw new BadRequestException('You are not authorized to delete this job');
    }

    // Check if there are applications
    if (job.applicantsCount > 0) {
      throw new BadRequestException(
        'Cannot delete job with existing applications. Please close the job instead.'
      );
    }

    // Soft delete
    job.isActive = false;
    await job.save();

    logger.info(`Job deleted (soft): ${jobId}`);

    return job;
  } catch (error) {
    logger.error('Error deleting job:', error);
    throw error;
  }
};

/**
 * Hard delete a job (admin only - for future implementation)
 * @param {String} jobId - Job ID
 * @returns {Promise<void>}
 */
export const hardDeleteJob = async (jobId) => {
  try {
    const job = await Job.findByIdAndDelete(jobId);

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    logger.warn(`Job permanently deleted: ${jobId}`);

    return job;
  } catch (error) {
    logger.error('Error permanently deleting job:', error);
    throw error;
  }
};

/**
 * Generate a job description using a third-party AI API
 * @param {Object} input - Job draft data
 * @returns {Promise<{description: string, source: string}>}
 */
export const generateJobDescription = async (input = {}) => {
  const payload = {
    title: input.title?.trim() || '',
    category: input.category?.trim() || '',
    jobRole: input.jobRole?.trim() || '',
    employmentType: input.employmentType?.trim() || '',
    salaryType: input.salaryType?.trim() || '',
    salaryAmount: input.salaryAmount || '',
    experienceRequired: input.experienceRequired?.trim() || '',
    positions: input.positions || '',
    skillsRequired: Array.isArray(input.skillsRequired) ? input.skillsRequired : [],
    location: {
      village: input.location?.village?.trim() || '',
      district: input.location?.district?.trim() || '',
      province: input.location?.province?.trim() || '',
      fullAddress: input.location?.fullAddress?.trim() || '',
    },
  };

  if (!payload.title && !payload.jobRole && !payload.category) {
    throw new BadRequestException(
      'Provide at least one of title, job role, or category to generate a description'
    );
  }

  const promptLines = [
    'Generate a professional, well-structured job description in HTML for a job post.',
    'Use ONLY these HTML tags: p, h3, ul, li, strong.',
    'Do NOT return markdown, code fences, or explanations.',
    'Keep it practical and clear (140-240 words).',
    'Use this exact section order:',
    '1) <h3>Job Overview</h3> + one <p>',
    '2) <h3>Key Responsibilities</h3> + one <ul> with 4-6 <li>',
    '3) <h3>Requirements</h3> + one <ul> with 4-6 <li>',
    '4) <h3>Benefits</h3> + one <ul> with 3-5 <li>',
    'Use concrete details from the inputs below.',
    'If a value is missing, infer sensible neutral wording without mentioning that data is missing.',
    '',
    `Title: ${payload.title || 'Not provided'}`,
    `Category: ${payload.category || 'Not provided'}`,
    `Job Role: ${payload.jobRole || 'Not provided'}`,
    `Employment Type: ${payload.employmentType || 'Not provided'}`,
    `Salary: ${payload.salaryAmount || 'Not provided'} ${
      payload.salaryType ? `(${payload.salaryType})` : ''
    }`,
    `Experience Level: ${payload.experienceRequired || 'Not provided'}`,
    `Positions: ${payload.positions || 'Not provided'}`,
    `Skills: ${payload.skillsRequired.length > 0 ? payload.skillsRequired.join(', ') : 'Not provided'}`,
    `Location: ${
      payload.location.fullAddress ||
      [payload.location.village, payload.location.district, payload.location.province]
        .filter(Boolean)
        .join(', ') ||
      'Not provided'
    }`,
  ];

  const fallbackHtml = `<h3>Job Overview</h3><p>We are looking for ${
    payload.title || payload.jobRole || 'a motivated candidate'
  } to join our team${
    payload.location.district ? ` in ${payload.location.district}` : ''
  }. This role is ideal for someone who can work with commitment and deliver consistent results.</p><h3>Key Responsibilities</h3><ul><li>Carry out day-to-day tasks related to ${
    payload.jobRole || payload.category || 'the assigned role'
  }.</li><li>Collaborate with team members and follow workplace standards.</li><li>Maintain quality, productivity, and safety throughout all duties.</li></ul><h3>Requirements</h3><ul><li>${
    payload.experienceRequired
      ? `Experience level: ${payload.experienceRequired}.`
      : 'Willingness to learn and adapt.'
  }</li><li>${
    payload.skillsRequired.length > 0
      ? `Skills: ${payload.skillsRequired.join(', ')}.`
      : 'Good communication and responsibility.'
  }</li><li>${
    payload.employmentType
      ? `Employment type: ${payload.employmentType}.`
      : 'Ability to work according to business needs.'
  }</li></ul>`;

  if (!envConfig.cohereApiKey) {
    logger.warn('COHERE_API_KEY is not configured. Returning template-based description.');
    return { description: fallbackHtml, source: 'template', reason: 'cohere_key_missing' };
  }

  try {
    const systemPrompt =
      'You write high-quality job descriptions. Respond only with valid HTML and no markdown fences.';

    const requestConfig = {
      headers: {
        Authorization: `Bearer ${envConfig.cohereApiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    };

    const parseCohereText = (data) => {
      const messageContent = data?.message?.content;
      let text = '';

      if (Array.isArray(messageContent)) {
        text = messageContent
          .map((item) => {
            if (typeof item === 'string') return item;
            if (item && typeof item.text === 'string') return item.text;
            return '';
          })
          .filter(Boolean)
          .join('\n')
          .trim();
      } else if (typeof messageContent === 'string') {
        text = messageContent.trim();
      }

      if (!text) {
        text =
          data?.message?.text?.trim() ||
          data?.text?.trim() ||
          data?.generations?.[0]?.text?.trim() ||
          '';
      }

      return text;
    };

    const userPrompt = promptLines.join('\n');
    let aiHtml = '';
    let response;

    // Try Cohere v2 chat first
    try {
      response = await axios.post(
        `${envConfig.cohereApiBaseUrl}/chat`,
        {
          model: envConfig.cohereModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.7,
        },
        requestConfig
      );
      aiHtml = parseCohereText(response?.data);
    } catch (v2Error) {
      // Fallback for keys/models wired to Cohere v1 chat payloads
      logger.warn('Cohere v2 chat failed, retrying with v1 chat payload', {
        message: v2Error.message,
        status: v2Error.response?.status,
      });

      const v1BaseUrl = envConfig.cohereApiBaseUrl.replace(/\/v2\/?$/, '/v1');
      response = await axios.post(
        `${v1BaseUrl}/chat`,
        {
          model: envConfig.cohereModel,
          preamble: systemPrompt,
          message: userPrompt,
          temperature: 0.7,
        },
        requestConfig
      );
      aiHtml = parseCohereText(response?.data);
    }

    // Clean common model wrappers like markdown code fences
    if (aiHtml) {
      aiHtml = aiHtml
        .replace(/^```html\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '');
      aiHtml = normalizeToAllowedHtml(aiHtml);
    }

    if (!aiHtml) {
      logger.warn('AI returned empty content. Falling back to template.');
      return { description: fallbackHtml, source: 'template', reason: 'cohere_empty_response' };
    }

    return { description: aiHtml, source: 'ai', provider: 'cohere' };
  } catch (error) {
    logger.error('Job description generation failed, using template fallback', {
      message: error.message,
      status: error.response?.status,
      responseData: error.response?.data,
    });
    return {
      description: fallbackHtml,
      source: 'template',
      reason: `cohere_request_failed_${error.response?.status || 'unknown'}`,
    };
  }
};

/**
 * Get recommended jobs for a user based on their skills
 * @param {Object} user - User object
 * @returns {Promise<Array>} Recommended jobs
 */
export const getRecommendedJobs = async (user) => {
  try {
    const { skills } = user;

    if (!skills || skills.length === 0) {
      // If no skills, return latest open jobs
      return await Job.find({ status: 'open', isActive: true }).sort({ createdAt: -1 }).limit(10);
    }

    // Find jobs that require at least one of the user's skills
    const jobs = await Job.find({
      status: 'open',
      isActive: true,
      skillsRequired: { $in: skills.map((skill) => new RegExp(skill, 'i')) },
    })
      .sort({ createdAt: -1 })
      .limit(20);

    logger.info(`Found ${jobs.length} recommendations for user: ${user._id}`);

    return jobs;
  } catch (error) {
    logger.error('Error fetching recommended jobs:', error);
    throw error;
  }
};

export default {
  createJob,
  getJobById,
  getAllJobs,
  getJobsByEmployer,
  getNearbyJobs,
  searchJobs,
  generateJobDescription,
  getRecommendedJobs,
  getEmployerStats,
  updateJob,
  closeJob,
  markJobAsFilled,
  deleteJob,
  hardDeleteJob,
};
