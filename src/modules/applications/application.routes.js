import express from 'express';
import * as applicationController from './application.controller.js';
import * as applicationValidation from './application.validation.js';
import { protect } from '../../middleware/auth/authMiddleware.js';
import { requireJobSeeker, requireEmployer } from '../../middleware/role.middleware.js';
import { validate } from '../../middleware/validation.middleware.js';

const router = express.Router();

/**
 * Application Routes
 * All routes for Job Application management
 */

// Protected routes (authentication required)

/**
 * Check application eligibility (used by Review module)
 * Caller must be authenticated as the userId being checked (or an admin) —
 * this previously had no auth at all and leaked the full application record.
 */
router.get('/check/:jobId/:userId', protect, applicationController.checkApplicationEligibility);

/**
 * Get my applications (job seeker)
 * Must be defined before /:id to avoid matching "my-applications" as an :id
 */
router.get(
  '/my-applications',
  protect,
  requireJobSeeker,
  applicationValidation.getMyApplicationsValidation,
  validate,
  applicationController.getMyApplications
);

/**
 * Get aggregate application stats for a job (employer dashboard)
 * Must be defined before /job/:jobId to avoid :jobId consuming "stats"
 */
router.get(
  '/job/:jobId/stats',
  protect,
  requireEmployer,
  applicationValidation.getApplicationStatsValidation,
  validate,
  applicationController.getApplicationStats
);

/**
 * Get all applications for a job (employer)
 * Must be defined before /:id to avoid matching "job" as an :id
 */
router.get(
  '/job/:jobId',
  protect,
  requireEmployer,
  applicationValidation.getJobApplicationsValidation,
  validate,
  applicationController.getJobApplications
);

/**
 * Virtual interview Jitsi join context (employer or applicant on this application)
 * Must be registered before GET /:id
 */
router.get(
  '/:id/interview-join-context',
  protect,
  applicationValidation.getInterviewJoinContextValidation,
  validate,
  applicationController.getInterviewJoinContext
);

/**
 * Get application by ID
 */
router.get(
  '/:id',
  protect,
  applicationValidation.getApplicationValidation,
  validate,
  applicationController.getApplicationById
);

/**
 * Apply for a job
 */
router.post(
  '/',
  protect,
  requireJobSeeker,
  applicationValidation.applyForJobValidation,
  validate,
  applicationController.applyForJob
);

/**
 * Update application status (employer)
 */
router.patch(
  '/:id/status',
  protect,
  requireEmployer,
  applicationValidation.updateStatusValidation,
  validate,
  applicationController.updateApplicationStatus
);

/**
 * Update personal notes on an application (job seeker)
 */
router.patch(
  '/:id/notes',
  protect,
  requireJobSeeker,
  applicationValidation.updateNotesValidation,
  validate,
  applicationController.updateApplicationNotes
);

/**
 * Schedule or update an interview (employer)
 */
router.patch(
  '/:id/interview',
  protect,
  requireEmployer,
  applicationValidation.scheduleInterviewValidation,
  validate,
  applicationController.scheduleInterview
);

/**
 * Cancel scheduled interview (employer)
 */
router.delete(
  '/:id/interview',
  protect,
  requireEmployer,
  applicationValidation.getApplicationValidation,
  validate,
  applicationController.cancelInterview
);

/**
 * Withdraw an application (job seeker)
 */
router.patch(
  '/:id/withdraw',
  protect,
  requireJobSeeker,
  applicationValidation.withdrawApplicationValidation,
  validate,
  applicationController.withdrawApplication
);

export default router;
