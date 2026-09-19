import * as applicationService from './application.service.js';
import { sendSuccess, sendCreated } from '../../utils/response.utils.js';

/**
 * Application Controller
 * HTTP request handlers for application endpoints
 */

/**
 * @route   POST /api/applications
 * @desc    Apply for a job
 * @access  Private (Job Seeker)
 */
export const applyForJob = async (req, res) => {
  const application = await applicationService.applyForJob(req.user._id, req.body);

  sendCreated(res, 'Application submitted successfully', { application });
};

/**
 * @route   GET /api/applications/:id
 * @desc    Get application by ID
 * @access  Private (Job Seeker, Employer, Admin)
 */
export const getApplicationById = async (req, res) => {
  const application = await applicationService.getApplicationById(
    req.params.id,
    req.user._id,
    req.user.role
  );

  sendSuccess(res, 'Application retrieved successfully', { application });
};

/**
 * @route   GET /api/applications/my-applications
 * @desc    Get all applications for the authenticated job seeker
 * @access  Private (Job Seeker)
 */
export const getMyApplications = async (req, res) => {
  const filters = {
    status: req.query.status,
    page: req.query.page,
    limit: req.query.limit,
    sort: req.query.sort,
  };

  const result = await applicationService.getMyApplications(req.user._id, filters);

  sendSuccess(res, 'Applications retrieved successfully', result);
};

/**
 * @route   GET /api/applications/job/:jobId
 * @desc    Get all applications for a specific job
 * @access  Private (Employer)
 */
export const getJobApplications = async (req, res) => {
  const filters = {
    status: req.query.status,
    page: req.query.page,
    limit: req.query.limit,
    sort: req.query.sort,
  };

  const result = await applicationService.getJobApplications(
    req.params.jobId,
    req.user._id,
    filters
  );

  sendSuccess(res, 'Job applications retrieved successfully', result);
};

/**
 * @route   PATCH /api/applications/:id/status
 * @desc    Update application status
 * @access  Private (Employer)
 */
export const updateApplicationStatus = async (req, res) => {
  const application = await applicationService.updateApplicationStatus(
    req.params.id,
    req.user._id,
    req.body.status,
    req.body.employerNotes
  );

  sendSuccess(res, 'Application status updated successfully', { application });
};

/**
 * @route   PATCH /api/applications/:id/withdraw
 * @desc    Withdraw an application
 * @access  Private (Job Seeker)
 */
export const withdrawApplication = async (req, res) => {
  const result = await applicationService.withdrawApplication(
    req.params.id,
    req.user._id,
    req.body.withdrawalReason
  );

  sendSuccess(res, result.message);
};

/**
 * @route   PATCH /api/applications/:id/notes
 * @desc    Update the job seeker's personal notes on an application
 * @access  Private (Job Seeker)
 */
export const updateApplicationNotes = async (req, res) => {
  const application = await applicationService.updateApplicationNotes(
    req.params.id,
    req.user._id,
    req.body.notes
  );

  sendSuccess(res, 'Application notes updated successfully', { application });
};

/**
 * @route   PATCH /api/applications/:id/interview
 * @desc    Schedule or update an interview for an application
 * @access  Private (Employer)
 */
export const scheduleInterview = async (req, res) => {
  const application = await applicationService.scheduleInterview(
    req.params.id,
    req.user._id,
    req.body
  );

  sendSuccess(res, 'Interview scheduled successfully', { application });
};

/**
 * @route   DELETE /api/applications/:id/interview
 * @desc    Cancel scheduled interview (clears interview fields; seeker notified by email)
 * @access  Private (Employer)
 */
export const cancelInterview = async (req, res) => {
  const application = await applicationService.cancelInterview(req.params.id, req.user._id);

  sendSuccess(res, 'Interview cancelled successfully', { application });
};

/**
 * @route   GET /api/applications/:id/interview-join-context
 * @desc    Jitsi join context for a virtual interview (employer or applicant)
 * @access  Private
 */
export const getInterviewJoinContext = async (req, res) => {
  const context = await applicationService.getInterviewJoinContext(req.params.id, req.user._id);

  sendSuccess(res, 'Interview join context retrieved', context);
};

/**
 * @route   GET /api/applications/job/:jobId/stats
 * @desc    Get aggregate application stats for a job
 * @access  Private (Employer)
 */
export const getApplicationStats = async (req, res) => {
  const stats = await applicationService.getApplicationStats(req.params.jobId, req.user._id);

  sendSuccess(res, 'Application stats retrieved successfully', { stats });
};

/**
 * @route   GET /api/applications/check/:jobId/:userId
 * @desc    Check if user has accepted application for job (review eligibility)
 * @access  Private (the userId being checked, or an admin)
 */
export const checkApplicationEligibility = async (req, res) => {
  const result = await applicationService.checkApplicationEligibility(
    req.params.jobId,
    req.params.userId,
    req.user._id,
    req.user.role
  );

  sendSuccess(res, 'Application check completed', result);
};

export default {
  applyForJob,
  getApplicationById,
  getMyApplications,
  getJobApplications,
  updateApplicationStatus,
  withdrawApplication,
  getApplicationStats,
  updateApplicationNotes,
  scheduleInterview,
  cancelInterview,
  getInterviewJoinContext,
  checkApplicationEligibility,
};
