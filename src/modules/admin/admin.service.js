import User from '../users/user.model.js';
import Job from '../jobs/job.model.js';
import Application from '../applications/application.model.js';
import { sanitizeJobDescription } from '../jobs/job-description-sanitize.js';

/**
 * Get dashboard statistics for admin
 * @returns {Promise<Object>} Statistics object
 */
export const getDashboardStats = async () => {
  const [
    totalUsers,
    totalJobs,
    totalApplications,
    recentUsers,
    recentJobs,
    jobStats,
    userStats,
    categoryStats,
    provinceStats,
    verifiedUsers,
  ] = await Promise.all([
    User.countDocuments(),
    Job.countDocuments(),
    Application.countDocuments(),
    User.find().sort({ createdAt: -1 }).limit(8).select('-password'),
    Job.find()
      .sort({ createdAt: -1 })
      .limit(8)
      .populate('employerId', 'firstName lastName companyName profileImage'),
    Job.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
    Job.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    Job.aggregate([
      { $group: { _id: '$location.province', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    User.countDocuments({ isVerified: true }),
  ]);

  const verificationRate = totalUsers > 0 ? (verifiedUsers / totalUsers) * 100 : 0;
  const avgApplications = totalJobs > 0 ? (totalApplications / totalJobs).toFixed(1) : 0;

  return {
    overview: {
      totalUsers,
      totalJobs,
      totalApplications,
      verificationRate: Math.round(verificationRate),
      avgApplications,
    },
    recentUsers,
    recentJobs,
    jobStats,
    userStats,
    categoryStats,
    provinceStats,
  };
};

/**
 * Get all users with pagination and filters
 * @param {Object} query - Filter and pagination options
 */
export const getAllUsers = async (query = {}) => {
  const { page = 1, limit = 10, role, search } = query;
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;

  const filter = {};
  if (role) filter.role = role;
  if (search) {
    const searchRegex = { $regex: search, $options: 'i' };
    filter.$or = [
      { firstName: searchRegex },
      { lastName: searchRegex },
      { email: searchRegex },
      { phone: searchRegex },
      { companyName: searchRegex },
    ];
  }

  const users = await User.find(filter)
    .sort({ createdAt: -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum)
    .select('-password');

  const total = await User.countDocuments(filter);

  return {
    users,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    },
  };
};

export const updateUserByAdmin = async (userId, updateData) => {
  const user = await User.findByIdAndUpdate(userId, updateData, { new: true }).select('-password');
  return user;
};

/**
 * Get all jobs with pagination and filters
 * @param {Object} query - Filter and pagination options
 */
export const getAllJobs = async (query = {}) => {
  const { page = 1, limit = 10, status, search, category } = query;
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;

  const filter = {};
  if (status) filter.status = status;
  if (category) filter.category = category;

  if (search) {
    const searchRegex = { $regex: search, $options: 'i' };
    filter.$or = [{ title: searchRegex }, { companyName: searchRegex }, { jobRole: searchRegex }];
  }

  const jobs = await Job.find(filter)
    .sort({ createdAt: -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum)
    .populate('employerId', 'firstName lastName email companyName');

  const total = await Job.countDocuments(filter);

  return {
    jobs,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    },
  };
};

/**
 * Update job status or details by admin
 * @param {string} jobId
 * @param {Object} updateData
 */
export const updateJobByAdmin = async (jobId, updateData) => {
  const sanitizedUpdate = { ...updateData };
  if (typeof sanitizedUpdate.description === 'string') {
    sanitizedUpdate.description = sanitizeJobDescription(sanitizedUpdate.description);
  }

  const job = await Job.findByIdAndUpdate(jobId, sanitizedUpdate, { new: true }).populate(
    'employerId',
    'firstName lastName email companyName'
  );
  return job;
};

export default {
  getDashboardStats,
  getAllUsers,
  updateUserByAdmin,
  getAllJobs,
  updateJobByAdmin,
};
