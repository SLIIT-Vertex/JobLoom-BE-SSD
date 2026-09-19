import { body, checkExact, param, query } from 'express-validator';

/**
 * Validation schemas for job endpoints
 * Using express-validator like the reviews module
 */

// Category enum (Expanded)
export const JOB_CATEGORIES = [
  'agriculture',
  'farming',
  'livestock',
  'fishing',
  'construction',
  'carpentry',
  'masonry',
  'plumbing',
  'electrical',
  'welding',
  'manufacturing',
  'factory_work',
  'assembly',
  'food_service',
  'cooking',
  'catering',
  'hospitality',
  'retail',
  'sales',
  'customer_service',
  'transportation',
  'driving',
  'delivery',
  'logistics',
  'cleaning',
  'maintenance',
  'janitorial',
  'security',
  'guard_services',
  'tailoring',
  'textiles',
  'garment_making',
  'beauty_services',
  'salon',
  'spa',
  'education',
  'teaching',
  'tutoring',
  'healthcare',
  'nursing',
  'caregiving',
  'IT',
  'technology',
  'software',
  'general_labor',
  'manual_labor',
  'other',
];

// Employment types
export const EMPLOYMENT_TYPES = [
  'full-time',
  'part-time',
  'contract',
  'temporary',
  'internship',
  'seasonal',
  'freelance',
];

// Salary type enum
export const SALARY_TYPES = ['daily', 'weekly', 'monthly', 'contract'];

// Experience levels
export const EXPERIENCE_LEVELS = ['none', 'beginner', 'intermediate', 'advanced', 'expert'];

// Job status enum
export const JOB_STATUS = ['open', 'closed', 'filled'];

/**
 * Create job validation
 */
export const createJobValidation = [
  body('title')
    .optional()
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Title must be between 3 and 100 characters if provided'),

  body('description')
    .optional()
    .trim()
    .isLength({ min: 20 })
    .withMessage('Description must be at least 20 characters if provided'),

  body('category')
    .optional()
    .isIn(JOB_CATEGORIES)
    .withMessage(`Category must be one of: ${JOB_CATEGORIES.join(', ')}`),

  body('categoryLabel')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Category label must be between 1 and 100 characters if provided'),

  body('jobRole')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Job role must be between 2 and 100 characters if provided'),

  body('employmentType')
    .optional()
    .isIn(EMPLOYMENT_TYPES)
    .withMessage(`Employment type must be one of: ${EMPLOYMENT_TYPES.join(', ')}`),

  body('location.village').optional().trim().isString().withMessage('Village must be a string'),

  body('location.district').optional().trim().isString().withMessage('District must be a string'),

  body('location.province').optional().trim().isString().withMessage('Province must be a string'),

  body('location.fullAddress')
    .optional()
    .trim()
    .isString()
    .withMessage('Full address must be a string'),

  body('location.coordinates.coordinates')
    .optional()
    .isArray({ min: 2, max: 2 })
    .withMessage('Coordinates must be an array of 2 numbers [longitude, latitude]'),

  body('location.coordinates.coordinates.*')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Coordinate values must be valid numbers'),

  body('salaryType')
    .optional()
    .isIn(SALARY_TYPES)
    .withMessage(`Salary type must be one of: ${SALARY_TYPES.join(', ')}`),

  body('salaryAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Salary amount must be a positive number if provided'),

  body('currency')
    .optional()
    .isIn(['LKR', 'USD'])
    .withMessage('Currency must be either LKR or USD'),

  body('skillsRequired').optional().isArray().withMessage('Skills required must be an array'),

  body('skillsRequired.*').optional().trim().isString().withMessage('Each skill must be a string'),

  body('experienceRequired')
    .optional()
    .isIn(EXPERIENCE_LEVELS)
    .withMessage(`Experience level must be one of: ${EXPERIENCE_LEVELS.join(', ')}`),

  body('positions')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Positions must be a number between 1 and 100 if provided'),

  body('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date if provided'),

  body('endDate').optional().isISO8601().withMessage('End date must be a valid ISO 8601 date'),
];

/**
 * Update job validation
 */
export const updateJobValidation = [
  param('id').isMongoId().withMessage('Invalid job ID'),

  body('title')
    .optional()
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Title must be between 3 and 100 characters'),

  body('description')
    .optional()
    .trim()
    .isLength({ min: 20 })
    .withMessage('Description must be at least 20 characters'),

  body('category')
    .optional()
    .isIn(JOB_CATEGORIES)
    .withMessage(`Category must be one of: ${JOB_CATEGORIES.join(', ')}`),

  body('categoryLabel')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Category label must be between 1 and 100 characters if provided'),

  body('jobRole')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Job role must be between 2 and 100 characters'),

  body('employmentType')
    .optional()
    .isIn(EMPLOYMENT_TYPES)
    .withMessage(`Employment type must be one of: ${EMPLOYMENT_TYPES.join(', ')}`),

  body('location.village').optional().trim().isString().withMessage('Village must be a string'),

  body('location.district').optional().trim().isString().withMessage('District must be a string'),

  body('location.province').optional().trim().isString().withMessage('Province must be a string'),

  body('location.fullAddress')
    .optional()
    .trim()
    .isString()
    .withMessage('Full address must be a string'),

  body('location.coordinates.type')
    .optional()
    .equals('Point')
    .withMessage('Coordinate type must be Point'),

  body('location.coordinates.coordinates')
    .optional()
    .isArray({ min: 2, max: 2 })
    .withMessage('Coordinates must be an array of 2 numbers [longitude, latitude]'),

  body('location.coordinates.coordinates.*')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Coordinate values must be valid numbers'),

  body('salaryType')
    .optional()
    .isIn(SALARY_TYPES)
    .withMessage(`Salary type must be one of: ${SALARY_TYPES.join(', ')}`),

  body('salaryAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Salary amount must be a positive number'),

  body('currency')
    .optional()
    .isIn(['LKR', 'USD'])
    .withMessage('Currency must be either LKR or USD'),

  body('skillsRequired').optional().isArray().withMessage('Skills required must be an array'),

  body('skillsRequired.*').optional().trim().isString().withMessage('Each skill must be a string'),

  body('experienceRequired')
    .optional()
    .isIn(EXPERIENCE_LEVELS)
    .withMessage(`Experience level must be one of: ${EXPERIENCE_LEVELS.join(', ')}`),

  body('positions')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Positions must be a number between 1 and 100'),

  body('status')
    .optional()
    .isIn(JOB_STATUS)
    .withMessage(`Status must be one of: ${JOB_STATUS.join(', ')}`),

  body('startDate').optional().isISO8601().withMessage('Start date must be a valid ISO 8601 date'),

  body('endDate').optional().isISO8601().withMessage('End date must be a valid ISO 8601 date'),

  checkExact([], {
    locations: ['body'],
    message: 'Unexpected field(s) in job update',
  }),
];

/**
 * Get job by ID validation
 */
export const getJobValidation = [param('id').isMongoId().withMessage('Invalid job ID')];

/**
 * Delete job validation
 */
export const deleteJobValidation = [param('id').isMongoId().withMessage('Invalid job ID')];

/**
 * Job query validation (for GET /api/jobs)
 */
export const getJobsValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),

  query('category')
    .optional()
    .isIn(JOB_CATEGORIES)
    .withMessage(`Category must be one of: ${JOB_CATEGORIES.join(', ')}`),

  query('status')
    .optional()
    .isIn(JOB_STATUS)
    .withMessage(`Status must be one of: ${JOB_STATUS.join(', ')}`),

  query('minSalary')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Min salary must be a positive number'),

  query('maxSalary')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Max salary must be a positive number'),

  query('salaryType')
    .optional()
    .isIn(SALARY_TYPES)
    .withMessage(`Salary type must be one of: ${SALARY_TYPES.join(', ')}`),

  query('district').optional().trim().isString().withMessage('District must be a string'),

  query('province').optional().trim().isString().withMessage('Province must be a string'),

  query('search').optional().trim().isString().withMessage('Search must be a string'),

  query('sortBy')
    .optional()
    .isIn(['createdAt', 'salaryAmount', 'title', 'applicantsCount'])
    .withMessage('Sort by must be one of: createdAt, salaryAmount, title, applicantsCount'),

  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be either "asc" or "desc"'),
];

/**
 * Nearby jobs validation
 */
export const getNearbyJobsValidation = [
  query('lat')
    .notEmpty()
    .withMessage('Latitude is required')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),

  query('lng')
    .notEmpty()
    .withMessage('Longitude is required')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),

  query('radius')
    .optional()
    .isFloat({ min: 1, max: 1000 })
    .withMessage('Radius must be between 1 and 1000 km'),
];

/**
 * Get employer jobs validation
 */
export const getEmployerJobsValidation = [
  query('includeInactive').optional().isBoolean().withMessage('Include inactive must be a boolean'),

  query('status')
    .optional()
    .isIn(JOB_STATUS)
    .withMessage(`Status must be one of: ${JOB_STATUS.join(', ')}`),
];

/**
 * Generate job description validation
 */
export const generateJobDescriptionValidation = [
  body('title')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Title must be between 2 and 100 characters if provided'),

  body('category')
    .optional()
    .isIn(JOB_CATEGORIES)
    .withMessage(`Category must be one of: ${JOB_CATEGORIES.join(', ')}`),

  body('jobRole')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Job role must be between 2 and 100 characters if provided'),

  body('employmentType')
    .optional()
    .isIn(EMPLOYMENT_TYPES)
    .withMessage(`Employment type must be one of: ${EMPLOYMENT_TYPES.join(', ')}`),

  body('salaryType')
    .optional()
    .isIn(SALARY_TYPES)
    .withMessage(`Salary type must be one of: ${SALARY_TYPES.join(', ')}`),

  body('salaryAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Salary amount must be a positive number if provided'),

  body('experienceRequired')
    .optional()
    .isIn(EXPERIENCE_LEVELS)
    .withMessage(`Experience level must be one of: ${EXPERIENCE_LEVELS.join(', ')}`),

  body('positions')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Positions must be a number between 1 and 100 if provided'),

  body('skillsRequired').optional().isArray().withMessage('Skills required must be an array'),

  body('skillsRequired.*').optional().trim().isString().withMessage('Each skill must be a string'),

  body('location.village').optional().trim().isString().withMessage('Village must be a string'),

  body('location.district').optional().trim().isString().withMessage('District must be a string'),

  body('location.province').optional().trim().isString().withMessage('Province must be a string'),

  body('location.fullAddress')
    .optional()
    .trim()
    .isString()
    .withMessage('Full address must be a string'),
];

export default {
  createJobValidation,
  updateJobValidation,
  getJobValidation,
  deleteJobValidation,
  getJobsValidation,
  getNearbyJobsValidation,
  getEmployerJobsValidation,
  generateJobDescriptionValidation,
};
