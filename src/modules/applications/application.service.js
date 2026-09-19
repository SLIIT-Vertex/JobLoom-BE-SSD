import Application from './application.model.js';
import Job from '../jobs/job.model.js';
import User from '../users/user.model.js';
import HttpException from '../../models/http-exception.js';
import envConfig from '../../config/env.config.js';
import logger from '../../config/logger.config.js';
import { generateJitsiRoomName } from '../../utils/jitsiRoom.js';
import {
  sendInterviewScheduledEmail,
  sendEmployerInterviewScheduledEmail,
  sendInterviewCancelledEmail,
  sendEmployerInterviewCancelledEmail,
  sendApplicationDecisionEmail,
  sendEmployerApplicationDecisionEmail,
} from '../../services/email.service.js';

/** Populated fields returned to clients / used in notifications */
const JOB_SELECT_BASIC = 'title category status';
const JOB_SELECT_SEEKER = 'title category status employmentType location';
const EMPLOYER_SELECT = 'firstName lastName email phone companyName companyWebsite';
const SEEKER_SELECT = 'firstName lastName email phone skills';
const SEEKER_SELECT_EMPLOYER = 'firstName lastName email phone skills ratingStats';

/**
 * Company / organization label for the employer posting the job (fallback to contact name)
 * @param {object|null|undefined} employer - populated User (employer)
 * @returns {string}
 */
const employerCompanyDisplay = (employer) => {
  if (!employer || typeof employer !== 'object') return '';
  const cn = employer.companyName?.trim();
  if (cn) return cn;
  return [employer.firstName, employer.lastName].filter(Boolean).join(' ') || '';
};

/**
 * Application Service
 * Business logic for job application operations
 */

/**
 * Valid status transitions map
 * Defines which statuses a given status can transition to
 */
const STATUS_TRANSITIONS = {
  pending: ['reviewed', 'shortlisted', 'accepted', 'rejected'],
  reviewed: ['shortlisted', 'accepted', 'rejected'],
  shortlisted: ['accepted', 'rejected'],
  accepted: [], // final
  rejected: [], // final
  withdrawn: [], // final
};

/**
 * Apply for a job
 * @param {ObjectId} jobSeekerId - ID of the job seeker applying
 * @param {Object} applicationData - Application data (jobId, coverLetter, resumeUrl)
 * @returns {Object} Created application
 */
export const applyForJob = async (jobSeekerId, applicationData) => {
  const { jobId, coverLetter, resumeUrl, cvId } = applicationData;

  // Validate: the Job exists
  const job = await Job.findById(jobId);
  if (!job) {
    throw new HttpException(404, 'Job not found');
  }

  // Validate: the Job status is open
  if (job.status !== 'open') {
    throw new HttpException(400, 'This job is no longer accepting applications');
  }

  // Validate: the job seeker is not the employer who posted the job
  if (jobSeekerId.toString() === job.employerId.toString()) {
    throw new HttpException(400, 'You cannot apply to your own job posting');
  }

  // Resolve CV from the user's profile if cvId is provided
  let resolvedResumeUrl = resumeUrl;
  if (cvId) {
    const user = await User.findById(jobSeekerId).select('cvs');
    if (!user) {
      throw new HttpException(404, 'User not found');
    }
    const selectedCv = user.cvs.id(cvId);
    if (!selectedCv) {
      throw new HttpException(404, 'Selected CV not found in your profile');
    }
    resolvedResumeUrl = selectedCv.url;
  }

  // Create the application
  try {
    const application = await Application.create({
      jobId,
      jobSeekerId,
      employerId: job.employerId,
      coverLetter,
      resumeUrl: resolvedResumeUrl,
      status: 'pending',
    });

    // Populate related fields before returning
    await application.populate([
      { path: 'jobId', select: JOB_SELECT_BASIC },
      { path: 'jobSeekerId', select: SEEKER_SELECT },
      { path: 'employerId', select: EMPLOYER_SELECT },
    ]);

    return application;
  } catch (error) {
    // Handle duplicate application error (unique index on {jobId, jobSeekerId})
    if (error.code === 11000) {
      throw new HttpException(409, 'You have already applied for this job');
    }
    throw error;
  }
};

/**
 * Get application by ID with authorization
 * @param {ObjectId} applicationId - Application ID
 * @param {ObjectId} requestingUserId - ID of user making the request
 * @param {string} requestingUserRole - Role of user making the request
 * @returns {Object} Application
 */
export const getApplicationById = async (applicationId, requestingUserId, requestingUserRole) => {
  const application = await Application.findById(applicationId)
    .active()
    .populate('jobId', JOB_SELECT_SEEKER)
    .populate('jobSeekerId', SEEKER_SELECT)
    .populate('employerId', EMPLOYER_SELECT);

  if (!application) {
    throw new HttpException(404, 'Application not found');
  }

  // Authorization: only the job seeker, the employer, or an admin can view
  const isJobSeeker = application.jobSeekerId._id.toString() === requestingUserId.toString();
  const isEmployer = application.employerId._id.toString() === requestingUserId.toString();
  const isAdmin = requestingUserRole === 'admin';

  if (!isJobSeeker && !isEmployer && !isAdmin) {
    throw new HttpException(403, 'You are not authorized to view this application');
  }

  // Strip fields that are private to the other party
  if (isJobSeeker && !isAdmin) {
    const applicationObj = application.toObject();
    delete applicationObj.employerNotes;
    return applicationObj;
  }

  if (isEmployer && !isAdmin) {
    const applicationObj = application.toObject();
    delete applicationObj.notes;
    return applicationObj;
  }

  return application;
};

/**
 * Get applications for the authenticated job seeker
 * @param {ObjectId} jobSeekerId - Job seeker's user ID
 * @param {Object} filters - Filter options (status, page, limit, sort)
 * @returns {Object} Applications and pagination metadata
 */
export const getMyApplications = async (jobSeekerId, filters = {}) => {
  const { status, page = 1, limit = 20, sort = '-createdAt' } = filters;

  const query = { jobSeekerId };
  if (status) {
    query.status = status;
  }

  const skip = (page - 1) * limit;

  const [applications, total] = await Promise.all([
    Application.find(query)
      .active()
      .populate('jobId', JOB_SELECT_BASIC)
      .populate('employerId', EMPLOYER_SELECT)
      .sort(sort)
      .skip(skip)
      .limit(limit),
    Application.countDocuments(query).active(),
  ]);

  return {
    applications,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / limit),
    },
  };
};

/**
 * Get all applications for a specific job (employer view)
 * @param {ObjectId} jobId - Job ID
 * @param {ObjectId} employerId - Employer's user ID (for authorization)
 * @param {Object} filters - Filter options (status, page, limit, sort)
 * @returns {Object} Applications and pagination metadata
 */
export const getJobApplications = async (jobId, employerId, filters = {}) => {
  const { status, page = 1, limit = 20, sort = '-createdAt' } = filters;

  // Verify the job exists and belongs to this employer
  const job = await Job.findById(jobId);
  if (!job) {
    throw new HttpException(404, 'Job not found');
  }

  if (job.employerId.toString() !== employerId.toString()) {
    throw new HttpException(403, 'You are not authorized to view applications for this job');
  }

  const query = { jobId };
  if (status) {
    query.status = status;
  }

  const skip = (page - 1) * limit;

  const [applications, total] = await Promise.all([
    Application.find(query)
      .active()
      .populate('jobSeekerId', SEEKER_SELECT_EMPLOYER)
      .populate('jobId', JOB_SELECT_BASIC)
      .sort(sort)
      .skip(skip)
      .limit(limit),
    Application.countDocuments(query).active(),
  ]);

  return {
    applications,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / limit),
    },
  };
};

/**
 * Update application status (employer action)
 * @param {ObjectId} applicationId - Application ID
 * @param {ObjectId} employerId - Employer's user ID
 * @param {string} newStatus - New status value
 * @param {string} employerNotes - Optional employer notes
 * @returns {Object} Updated application
 */
export const updateApplicationStatus = async (
  applicationId,
  employerId,
  newStatus,
  employerNotes
) => {
  const application = await Application.findById(applicationId).active();

  if (!application) {
    throw new HttpException(404, 'Application not found');
  }

  // Verify the employer making the request owns this application
  if (application.employerId.toString() !== employerId.toString()) {
    throw new HttpException(403, 'You are not authorized to update this application');
  }

  // Validate status transition
  const allowedTransitions = STATUS_TRANSITIONS[application.status] || [];
  if (!allowedTransitions.includes(newStatus)) {
    throw new HttpException(
      400,
      `Cannot transition from '${application.status}' to '${newStatus}'. Allowed transitions: ${allowedTransitions.join(', ') || 'none (final status)'}`
    );
  }

  // Update status and optional employer notes
  application.status = newStatus;
  application._statusChangedBy = employerId; // Used by pre-save hook for statusHistory

  if (employerNotes !== undefined) {
    application.employerNotes = employerNotes;
  }

  // Set reviewedAt timestamp on first review
  if (newStatus === 'reviewed' && !application.reviewedAt) {
    application.reviewedAt = new Date();
  }

  await application.save();

  // TODO: After accepting, check if accepted count equals job.positions
  // and consider updating the job status to 'filled'. This would require
  // coordination with the Job module and could be implemented as an event
  // or a post-save hook in a future enhancement.

  // Populate and return
  await application.populate([
    { path: 'jobId', select: JOB_SELECT_BASIC },
    { path: 'jobSeekerId', select: SEEKER_SELECT },
    { path: 'employerId', select: EMPLOYER_SELECT },
  ]);

  if (newStatus === 'accepted' || newStatus === 'rejected') {
    const seekerEmail = application.jobSeekerId?.email;
    const seekerPhone = application.jobSeekerId?.phone;
    const seekerName = [application.jobSeekerId?.firstName, application.jobSeekerId?.lastName]
      .filter(Boolean)
      .join(' ');
    const employerName = [application.employerId?.firstName, application.employerId?.lastName]
      .filter(Boolean)
      .join(' ');
    const employerEmail = application.employerId?.email;
    const employerPhone = application.employerId?.phone;
    const companyDisplayName = employerCompanyDisplay(application.employerId);
    const jobTitle = application.jobId?.title || 'a position';
    const jobCategory = application.jobId?.category;
    const jobListingStatus = application.jobId?.status;
    const baseUrl = (envConfig.frontendUrl || 'http://localhost:5173').replace(/\/$/, '');
    const applicationUrl = `${baseUrl}/my-applications/${application._id}`;
    const employerApplicationUrl = `${baseUrl}/employer/applications/${application._id}`;

    if (seekerEmail) {
      sendApplicationDecisionEmail({
        to: seekerEmail,
        seekerName,
        seekerEmailOnFile: seekerEmail,
        seekerPhone,
        employerName,
        employerEmail,
        employerPhone,
        companyDisplayName,
        jobTitle,
        jobCategory,
        jobListingStatus,
        outcome: newStatus,
        applicationUrl,
      }).catch((err) =>
        logger.error('Failed to send application decision email', { err: err.message })
      );
    }
    if (employerEmail && employerEmail !== seekerEmail) {
      sendEmployerApplicationDecisionEmail({
        to: employerEmail,
        employerName,
        seekerName,
        seekerEmailOnFile: seekerEmail,
        seekerPhone,
        companyDisplayName,
        jobTitle,
        jobCategory,
        jobListingStatus,
        outcome: newStatus,
        employerApplicationUrl,
      }).catch((err) =>
        logger.error('Failed to send employer application decision email', { err: err.message })
      );
    }
  }

  return application;
};

/**
 * Withdraw an application (job seeker action)
 * @param {ObjectId} applicationId - Application ID
 * @param {ObjectId} jobSeekerId - Job seeker's user ID
 * @param {string} reason - Optional withdrawal reason
 * @returns {Object} Success message
 */
export const withdrawApplication = async (applicationId, jobSeekerId, reason) => {
  const application = await Application.findById(applicationId).active();

  if (!application) {
    throw new HttpException(404, 'Application not found');
  }

  // Verify the job seeker making the request is the one who applied
  if (application.jobSeekerId.toString() !== jobSeekerId.toString()) {
    throw new HttpException(403, 'You are not authorized to withdraw this application');
  }

  // Only allow withdrawal from pending, reviewed, or shortlisted
  const withdrawableStatuses = ['pending', 'reviewed', 'shortlisted'];
  if (!withdrawableStatuses.includes(application.status)) {
    throw new HttpException(
      400,
      `Cannot withdraw an application with status '${application.status}'. Withdrawal is only allowed when status is: ${withdrawableStatuses.join(', ')}`
    );
  }

  // Update status and save reason
  application.status = 'withdrawn';
  application._statusChangedBy = jobSeekerId;

  if (reason) {
    application.withdrawalReason = reason;
  }

  await application.save();

  return { message: 'Application withdrawn successfully' };
};

/**
 * Get aggregate application stats for a job (employer dashboard)
 * @param {ObjectId} jobId - Job ID
 * @param {ObjectId} employerId - Employer's user ID
 * @returns {Object} Status counts
 */
export const getApplicationStats = async (jobId, employerId) => {
  // Verify the job exists and belongs to this employer
  const job = await Job.findById(jobId);
  if (!job) {
    throw new HttpException(404, 'Job not found');
  }

  if (job.employerId.toString() !== employerId.toString()) {
    throw new HttpException(403, 'You are not authorized to view stats for this job');
  }

  const stats = await Application.aggregate([
    { $match: { jobId: job._id, isActive: true } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]);

  // Convert to a friendlier object format
  const statusCounts = {
    pending: 0,
    reviewed: 0,
    shortlisted: 0,
    accepted: 0,
    rejected: 0,
    withdrawn: 0,
    total: 0,
  };

  for (const stat of stats) {
    statusCounts[stat._id] = stat.count;
    statusCounts.total += stat.count;
  }

  return statusCounts;
};

/**
 * Update the job seeker's personal notes on an application
 * @param {ObjectId} applicationId - Application ID
 * @param {ObjectId} jobSeekerId - Job seeker's user ID
 * @param {string} notes - Personal notes (pass null/empty string to clear)
 * @returns {Object} Updated application (without employerNotes)
 */
export const updateApplicationNotes = async (applicationId, jobSeekerId, notes) => {
  const application = await Application.findById(applicationId).active();

  if (!application) {
    throw new HttpException(404, 'Application not found');
  }

  if (application.jobSeekerId.toString() !== jobSeekerId.toString()) {
    throw new HttpException(403, 'You are not authorized to update notes for this application');
  }

  application.notes = notes ?? '';
  await application.save();

  await application.populate([
    { path: 'jobId', select: JOB_SELECT_BASIC },
    { path: 'jobSeekerId', select: SEEKER_SELECT },
    { path: 'employerId', select: EMPLOYER_SELECT },
  ]);

  const applicationObj = application.toObject();
  delete applicationObj.employerNotes;
  return applicationObj;
};

/**
 * Schedule (or update) an interview for an application (employer action)
 * @param {ObjectId} applicationId - Application ID
 * @param {ObjectId} employerId - Employer's user ID
 * @param {Object} interviewData - interviewDate, interviewType, optional duration/location fields
 * @returns {Object} Updated application
 */
export const scheduleInterview = async (applicationId, employerId, interviewData) => {
  const {
    interviewDate,
    interviewType,
    interviewDuration,
    interviewLocation,
    interviewLocationNotes,
  } = interviewData;

  const application = await Application.findById(applicationId).active();

  if (!application) {
    throw new HttpException(404, 'Application not found');
  }

  if (application.employerId.toString() !== employerId.toString()) {
    throw new HttpException(
      403,
      'You are not authorized to schedule an interview for this application'
    );
  }

  const finalStatuses = ['accepted', 'rejected', 'withdrawn'];
  if (finalStatuses.includes(application.status)) {
    throw new HttpException(
      400,
      `Cannot schedule an interview for an application with status '${application.status}'`
    );
  }

  if (application.status !== 'shortlisted') {
    throw new HttpException(
      400,
      'Interviews can only be scheduled for shortlisted applications. Shortlist the candidate first.'
    );
  }

  if (new Date(interviewDate) <= new Date()) {
    throw new HttpException(400, 'Interview date must be in the future');
  }

  application.interviewDate = new Date(interviewDate);
  application.interviewType = interviewType;
  application.interviewDuration = interviewDuration ?? 30;

  if (interviewType === 'virtual') {
    if (!application.jitsiRoomName) {
      application.jitsiRoomName = generateJitsiRoomName(applicationId);
    }
    application.interviewLocation = undefined;
    application.interviewLocationNotes = undefined;
  } else {
    application.jitsiRoomName = undefined;
    application.interviewLocation = interviewLocation;
    application.interviewLocationNotes = interviewLocationNotes || undefined;
  }

  await application.save();

  await application.populate([
    { path: 'jobId', select: JOB_SELECT_BASIC },
    { path: 'jobSeekerId', select: SEEKER_SELECT },
    { path: 'employerId', select: EMPLOYER_SELECT },
  ]);

  const seekerEmail = application.jobSeekerId?.email;
  const seekerPhone = application.jobSeekerId?.phone;
  const seekerName = [application.jobSeekerId?.firstName, application.jobSeekerId?.lastName]
    .filter(Boolean)
    .join(' ');
  const employerName = [application.employerId?.firstName, application.employerId?.lastName]
    .filter(Boolean)
    .join(' ');
  const employerEmail = application.employerId?.email;
  const employerPhone = application.employerId?.phone;
  const companyDisplayName = employerCompanyDisplay(application.employerId);
  const jobTitle = application.jobId?.title || 'a position';
  const jobCategory = application.jobId?.category;
  const jobListingStatus = application.jobId?.status;

  const baseUrl = (envConfig.frontendUrl || 'http://localhost:5173').replace(/\/$/, '');
  const joinUrl = interviewType === 'virtual' ? `${baseUrl}/interview/${applicationId}` : undefined;
  const viewApplicationUrl = `${baseUrl}/my-applications/${applicationId}`;

  if (seekerEmail) {
    sendInterviewScheduledEmail({
      to: seekerEmail,
      seekerName,
      seekerEmailOnFile: seekerEmail,
      seekerPhone,
      employerName,
      employerEmail,
      employerPhone,
      companyDisplayName,
      jobTitle,
      jobCategory,
      jobListingStatus,
      interviewDate: application.interviewDate,
      interviewType,
      interviewDuration: application.interviewDuration,
      interviewLocation: application.interviewLocation,
      interviewLocationNotes: application.interviewLocationNotes,
      joinUrl,
      applicationId,
      viewApplicationUrl,
    }).catch((err) => logger.error('Failed to send interview email', { err: err.message }));
  }
  if (employerEmail && employerEmail !== seekerEmail) {
    sendEmployerInterviewScheduledEmail({
      to: employerEmail,
      employerName,
      seekerName,
      seekerEmailOnFile: seekerEmail,
      seekerPhone,
      companyDisplayName,
      jobTitle,
      jobCategory,
      jobListingStatus,
      interviewDate: application.interviewDate,
      interviewType,
      interviewDuration: application.interviewDuration,
      interviewLocation: application.interviewLocation,
      interviewLocationNotes: application.interviewLocationNotes,
      joinUrl,
      applicationId,
      manageApplicationUrl: `${baseUrl}/employer/applications/${applicationId}`,
    }).catch((err) =>
      logger.error('Failed to send employer interview email', { err: err.message })
    );
  }

  return application;
};

/**
 * Cancel a scheduled interview (employer only). Clears all interview fields and emails the seeker.
 * @param {ObjectId} applicationId
 * @param {ObjectId} employerId
 * @returns {Promise<Object>} Updated application (populated)
 */
export const cancelInterview = async (applicationId, employerId) => {
  const application = await Application.findById(applicationId).active();

  if (!application) {
    throw new HttpException(404, 'Application not found');
  }

  if (application.employerId.toString() !== employerId.toString()) {
    throw new HttpException(403, 'You are not authorized to cancel this interview');
  }

  if (!application.interviewDate) {
    throw new HttpException(400, 'No interview is scheduled for this application');
  }

  await Application.updateOne(
    { _id: applicationId, isActive: true },
    {
      $unset: {
        interviewDate: '',
        interviewType: '',
        jitsiRoomName: '',
        interviewLocation: '',
        interviewLocationNotes: '',
        interviewDuration: '',
      },
    }
  );

  const updated = await Application.findById(applicationId)
    .active()
    .populate([
      { path: 'jobId', select: JOB_SELECT_BASIC },
      { path: 'jobSeekerId', select: SEEKER_SELECT },
      { path: 'employerId', select: EMPLOYER_SELECT },
    ]);

  const seekerEmail = updated.jobSeekerId?.email;
  const seekerPhone = updated.jobSeekerId?.phone;
  const seekerName = [updated.jobSeekerId?.firstName, updated.jobSeekerId?.lastName]
    .filter(Boolean)
    .join(' ');
  const employerEmail = updated.employerId?.email;
  const employerPhone = updated.employerId?.phone;
  const employerName = [updated.employerId?.firstName, updated.employerId?.lastName]
    .filter(Boolean)
    .join(' ');
  const companyDisplayName = employerCompanyDisplay(updated.employerId);
  const jobTitle = updated.jobId?.title || 'a position';
  const jobCategory = updated.jobId?.category;
  const jobListingStatus = updated.jobId?.status;
  const baseUrl = (envConfig.frontendUrl || 'http://localhost:5173').replace(/\/$/, '');
  const viewApplicationUrl = `${baseUrl}/my-applications/${applicationId}`;

  if (seekerEmail) {
    sendInterviewCancelledEmail({
      to: seekerEmail,
      seekerName,
      seekerEmailOnFile: seekerEmail,
      seekerPhone,
      employerName,
      employerEmail,
      employerPhone,
      companyDisplayName,
      jobTitle,
      jobCategory,
      jobListingStatus,
      viewApplicationUrl,
    }).catch((err) =>
      logger.error('Failed to send interview cancelled email', { err: err.message })
    );
  }
  if (employerEmail && employerEmail !== seekerEmail) {
    sendEmployerInterviewCancelledEmail({
      to: employerEmail,
      employerName,
      seekerName,
      seekerEmailOnFile: seekerEmail,
      seekerPhone,
      companyDisplayName,
      jobTitle,
      jobCategory,
      jobListingStatus,
      manageApplicationUrl: `${baseUrl}/employer/applications/${applicationId}`,
    }).catch((err) =>
      logger.error('Failed to send employer interview cancelled email', { err: err.message })
    );
  }

  return updated;
};

/**
 * Join context for embedding Jitsi (employer or applicant on this application only)
 * @param {ObjectId} applicationId
 * @param {ObjectId} userId
 * @returns {Promise<Object>}
 */
export const getInterviewJoinContext = async (applicationId, userId) => {
  const application = await Application.findById(applicationId)
    .active()
    .populate('jobId', 'title')
    .populate('jobSeekerId', 'firstName lastName')
    .populate('employerId', 'firstName lastName');

  if (!application) {
    throw new HttpException(404, 'Application not found');
  }

  const employerRef = application.employerId;
  const seekerRef = application.jobSeekerId;
  const employerIdStr = employerRef?._id?.toString?.() ?? employerRef?.toString?.();
  const seekerIdStr = seekerRef?._id?.toString?.() ?? seekerRef?.toString?.();
  const userIdStr = userId.toString();

  const isEmployer = employerIdStr === userIdStr;
  const isSeeker = seekerIdStr === userIdStr;

  if (!isEmployer && !isSeeker) {
    throw new HttpException(403, 'You are not authorized to join this interview');
  }

  if (!application.interviewDate) {
    throw new HttpException(400, 'No interview has been scheduled for this application');
  }

  if (application.interviewType !== 'virtual') {
    throw new HttpException(400, 'This is an in-person interview — no video room available');
  }

  if (!application.jitsiRoomName) {
    throw new HttpException(
      400,
      'Video room is not set for this interview. The employer may need to reschedule as a virtual interview.'
    );
  }

  const user = isEmployer ? employerRef : seekerRef;
  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Participant';

  return {
    domain: process.env.JITSI_DOMAIN || 'meet.jit.si',
    roomName: application.jitsiRoomName,
    displayName,
    jobTitle: application.jobId?.title || 'Interview',
    interviewDate: application.interviewDate,
    interviewDuration: application.interviewDuration,
    role: isEmployer ? 'employer' : 'job_seeker',
  };
};

/**
 * Check application eligibility (used by Review module)
 * @param {ObjectId} jobId - Job ID
 * @param {ObjectId} userId - User ID being checked
 * @param {ObjectId} [requesterId] - authenticated caller; must match userId unless admin
 * @param {string} [requesterRole] - authenticated caller's role
 * @returns {Object} Eligibility result — boolean only, no raw application document
 */
export const checkApplicationEligibility = async (jobId, userId, requesterId, requesterRole) => {
  if (requesterRole !== 'admin' && (!requesterId || requesterId.toString() !== userId.toString())) {
    throw new HttpException(403, 'You are not authorized to check this application');
  }

  const application = await Application.findOne({
    jobId,
    $or: [{ jobSeekerId: userId }, { employerId: userId }],
    status: 'accepted',
  });

  return {
    hasAcceptedApplication: !!application,
  };
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
