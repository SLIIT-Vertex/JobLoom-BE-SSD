import * as reviewRepository from './review.repository.js';
import * as ratingStatsService from './rating-stats.service.js';
import * as applicationService from '../applications/application.service.js';
import * as userService from '../users/user.service.js';
import * as jobService from '../jobs/job.service.js';
import HttpException from '../../models/http-exception.js';
import {
  calculateWeightedRating,
  calculateTrustScore,
  determineBadge,
} from '../../utils/rating.utils.js';

/**
 * Review Service
 * Business logic for review operations
 */

// Edit/Delete permission window
const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Determine whether a review may still be edited or deleted by its author.
 * A review is modifiable if:
 *   - It was submitted within the last 24 hours, OR
 *   - It has been reported by at least one other user (reporter re-opens the window
 *     so the author can correct/remove the flagged content).
 */
const canModifyReview = (review) => {
  const withinWindow = Date.now() - new Date(review.createdAt).getTime() < EDIT_WINDOW_MS;
  const hasReports = Array.isArray(review.reportedBy) && review.reportedBy.length > 0;
  return withinWindow || hasReports;
};

/**
 * Check if user can review another user for a specific job
 * @param {ObjectId} reviewerId - ID of user giving review
 * @param {ObjectId} revieweeId - ID of user being reviewed
 * @param {ObjectId} jobId - Job ID
 * @returns {boolean} Can user review
 */
export const canUserReview = async (reviewerId, revieweeId, jobId) => {
  // Internal call: the reviewer is always checking their own eligibility,
  // so reviewerId is passed as both the subject and the authorized requester.
  const { hasAcceptedApplication } = await applicationService.checkApplicationEligibility(
    jobId,
    reviewerId,
    reviewerId,
    null
  );
  return hasAcceptedApplication;
};

/**
 * Create a new review
 * @param {Object} reviewData - Review data
 * @returns {Object} Created review
 */
export const createReview = async (reviewData) => {
  const { reviewerId, revieweeId, jobId } = reviewData;

  // Check if reviewer and reviewee are different
  if (reviewerId.toString() === revieweeId.toString()) {
    throw new HttpException(400, 'You cannot review yourself');
  }

  // Check if user can review (has accepted application)
  const canReview = await canUserReview(reviewerId, revieweeId, jobId);
  if (!canReview) {
    throw new HttpException(403, 'You can only review users you have worked with on accepted jobs');
  }

  // Check for duplicate review
  const existingReview = await reviewRepository.findReview({
    reviewerId,
    revieweeId,
    jobId,
  });

  if (existingReview) {
    throw new HttpException(409, 'You have already reviewed this user for this job');
  }

  // Verify job exists
  try {
    await jobService.getJobById(jobId);
  } catch {
    throw new HttpException(404, 'Job not found');
  }

  // Verify reviewee exists
  try {
    await userService.getUserProfile(revieweeId);
  } catch {
    throw new HttpException(404, 'Reviewee not found');
  }

  // Calculate weighted rating if multiple criteria provided
  if (
    reviewData.workQuality ||
    reviewData.communication ||
    reviewData.punctuality ||
    reviewData.paymentOnTime
  ) {
    reviewData.rating = calculateWeightedRating(reviewData);
  }

  // Create review
  const review = await reviewRepository.createReview(reviewData);

  // Populate related data
  await review.populate([
    { path: 'reviewerId', select: 'firstName lastName email role' },
    { path: 'revieweeId', select: 'firstName lastName email role' },
    { path: 'jobId', select: 'title' },
  ]);

  return review;
};

/**
 * Get review by ID
 * @param {ObjectId} reviewId - Review ID
 * @returns {Object} Review
 */
export const getReviewById = async (reviewId) => {
  const review = await reviewRepository.findReviewById(reviewId, {
    populate: [
      { path: 'reviewerId', select: 'firstName lastName email role' },
      { path: 'revieweeId', select: 'firstName lastName email role' },
      { path: 'jobId', select: 'title description' },
    ],
  });

  if (!review) {
    throw new HttpException(404, 'Review not found');
  }

  return review;
};

/**
 * Update a review
 * @param {ObjectId} reviewId - Review ID
 * @param {ObjectId} userId - User ID (must be reviewer)
 * @param {Object} updateData - Data to update
 * @returns {Object} Updated review
 */
export const updateReview = async (reviewId, userId, updateData) => {
  // Find review
  const review = await reviewRepository.findReviewById(reviewId, { includeDeleted: true });

  if (!review) {
    throw new HttpException(404, 'Review not found');
  }

  if (review.isDeleted) {
    throw new HttpException(404, 'Review not found');
  }

  // Verify ownership
  if (review.reviewerId.toString() !== userId.toString()) {
    throw new HttpException(403, 'You can only edit your own reviews');
  }

  // Reviews can only be edited within the 24-hour window OR if they have been reported
  if (!canModifyReview(review)) {
    throw new HttpException(
      403,
      'Reviews can only be edited within 24 hours of submission. They can be re-opened for editing if they have been reported.'
    );
  }

  // Allowed fields to update
  const allowedUpdates = [
    'rating',
    'comment',
    'workQuality',
    'communication',
    'punctuality',
    'paymentOnTime',
    'wouldRecommend',
  ];

  // Filter update data
  const updates = {};
  for (const key of allowedUpdates) {
    if (updateData[key] !== undefined) {
      updates[key] = updateData[key];
    }
  }

  // Recalculate weighted rating if criteria changed
  if (
    updates.workQuality ||
    updates.communication ||
    updates.punctuality ||
    updates.paymentOnTime
  ) {
    updates.rating = calculateWeightedRating({ ...review.toObject(), ...updates });
  }

  // Update review
  const updatedReview = await reviewRepository.updateReviewById(reviewId, updates, {
    populate: [
      { path: 'reviewerId', select: 'firstName lastName email role' },
      { path: 'revieweeId', select: 'firstName lastName email role' },
      { path: 'jobId', select: 'title' },
    ],
  });

  return updatedReview;
};

/**
 * Delete a review
 * @param {ObjectId} reviewId - Review ID
 * @param {ObjectId} userId - User ID
 * @param {boolean} isAdmin - Is user an admin
 * @returns {Object} Success message
 */
export const deleteReview = async (reviewId, userId, isAdmin = false) => {
  const review = await reviewRepository.findReviewById(reviewId, { includeDeleted: true });

  if (!review) {
    throw new HttpException(404, 'Review not found');
  }

  if (review.isDeleted) {
    throw new HttpException(404, 'Review not found');
  }

  // Verify ownership or admin
  if (!isAdmin && review.reviewerId.toString() !== userId.toString()) {
    throw new HttpException(403, 'You can only delete your own reviews');
  }

  // Reviews can only be deleted within the 24-hour window OR if they have been reported
  if (!isAdmin && !canModifyReview(review)) {
    throw new HttpException(
      403,
      'Reviews can only be deleted within 24 hours of submission. They can be re-opened for deletion if they have been reported.'
    );
  }

  await reviewRepository.softDeleteReview(reviewId);

  return { message: 'Review deleted successfully' };
};

/**
 * Get reviews for a user
 * @param {ObjectId} userId - User ID (reviewee)
 * @param {Object} filters - Filter options
 * @returns {Object} Reviews and metadata
 */
export const getReviewsForUser = async (userId, filters = {}) => {
  return await reviewRepository.getReviewsForUser(userId, filters);
};

/**
 * Get reviews for a job
 * @param {ObjectId} jobId - Job ID
 * @returns {Array} Reviews
 */
export const getReviewsForJob = async (jobId) => {
  return await reviewRepository.getReviewsForJob(jobId);
};

/**
 * Get user rating statistics
 * @param {ObjectId} userId - User ID
 * @returns {Object} Rating statistics with badge
 */
export const getUserRatingStats = async (userId) => {
  // Verify user exists
  try {
    await userService.getUserProfile(userId);
  } catch {
    throw new HttpException(404, 'User not found');
  }

  // Get rating stats from service layer
  const ratingStats = await ratingStatsService.getRatingStatsForUser(userId);

  const trustScore = calculateTrustScore(ratingStats);
  const badge = determineBadge(ratingStats);

  return {
    ...ratingStats.toObject(),
    trustScore,
    badge,
  };
};

/**
 * Report a review
 * @param {ObjectId} reviewId - Review ID
 * @param {Object} reportData - Report data
 * @returns {Object} Updated review
 */
export const reportReview = async (reviewId, reportData) => {
  const { userId, reason } = reportData;

  const review = await reviewRepository.findReviewById(reviewId, { includeDeleted: true });

  if (!review) {
    throw new HttpException(404, 'Review not found');
  }

  if (review.isDeleted) {
    throw new HttpException(404, 'Review not found');
  }

  // Check if user already reported this review
  const alreadyReported = review.reportedBy.some(
    (report) => report.userId.toString() === userId.toString()
  );

  if (alreadyReported) {
    throw new HttpException(409, 'You have already reported this review');
  }

  // Add report
  review.reportedBy.push({
    userId,
    reason,
    reportedAt: new Date(),
  });

  await review.save();

  // Auto-flag for moderation if 3+ reports
  if (review.reportedBy.length >= 3) {
    // Could trigger notification to admin here
    console.log(`Review ${reviewId} flagged for moderation (${review.reportedBy.length} reports)`);
  }

  return {
    message: 'Review reported successfully',
    reportCount: review.reportedBy.length,
  };
};

/**
 * Get reviews SENT by a user (where the user is the reviewer)
 * @param {ObjectId} userId - Reviewer's user ID
 * @param {Object} filters - page, limit, sort
 * @returns {Object} { reviews, pagination }
 */
export const getSentReviewsForUser = async (userId, filters = {}) => {
  const { page = 1, limit = 20, sort = '-createdAt' } = filters;

  const criteria = {
    reviewerId: userId,
    isDeleted: false,
  };

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [reviews, total] = await Promise.all([
    reviewRepository.findReviews(criteria, {
      populate: [
        { path: 'revieweeId', select: 'firstName lastName email role' },
        { path: 'jobId', select: 'title' },
      ],
      sort,
      skip,
      limit: parseInt(limit),
    }),
    reviewRepository.countReviews(criteria),
  ]);

  // Annotate each review with client-side edit/delete permission flags.
  // Strip the raw reportedBy array so reporter identities are not leaked.
  const reviewsWithPermissions = reviews.map((review) => {
    const obj = review.toObject ? review.toObject() : { ...review };
    const canModify = canModifyReview(review);
    delete obj.reportedBy;
    return { ...obj, canEdit: canModify, canDelete: canModify };
  });

  return {
    reviews: reviewsWithPermissions,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / parseInt(limit)),
    },
  };
};

export default {
  canUserReview,
  createReview,
  getReviewById,
  updateReview,
  deleteReview,
  getReviewsForUser,
  getSentReviewsForUser,
  getReviewsForJob,
  getUserRatingStats,
  reportReview,
};
