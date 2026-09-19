import User from './user.model.js';
import * as smsService from '../../services/sms.service.js';
import crypto from 'crypto';
import { generateToken as jwtGenerateToken } from '../../utils/jwt.utils.js';
import { PUBLIC_REGISTRATION_ROLES } from './user.constants.js';
import { revokeToken } from './token-revocation.service.js';

const generateToken = (user) => {
  return jwtGenerateToken({
    userId: user._id,
    email: user.email,
    role: user.role,
  });
};

export const registerUser = async (userData) => {
  const { firstName, lastName, email, password, phone, role, location, companyName } = userData;

  if (!PUBLIC_REGISTRATION_ROLES.includes(role)) {
    throw new Error('Invalid role for public registration');
  }

  const userExists = await User.findOne({ email });

  if (userExists) {
    throw new Error('User already exists');
  }

  // Generate OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  const user = await User.create({
    firstName,
    lastName,
    email,
    password,
    phone,
    role,
    location,
    companyName,
    verificationOtp: otp,
    verificationOtpExpires: otpExpires,
    isVerified: false,
    isActive: true,
  });

  if (user) {
    // Send SMS
    try {
      await smsService.sendOtp(phone, otp);
    } catch (error) {
      console.error('Failed to send verification SMS:', error);
      // We don't throw here to allow the user to retry sending OTP
    }

    return {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      isVerified: user.isVerified,
    };
  } else {
    throw new Error('Invalid user data');
  }
};

/**
 * Verify user registration OTP
 * @param {string} phone
 * @param {string} otp
 * @returns {Object} { user, token }
 */
export const verifyRegistration = async (phone, otp) => {
  const user = await User.findOne({
    phone,
    verificationOtp: otp,
    verificationOtpExpires: { $gt: Date.now() },
  });

  if (!user) {
    throw new Error('Invalid or expired OTP');
  }

  user.isVerified = true;
  user.verificationOtp = null;
  user.verificationOtpExpires = null;
  await user.save();

  return {
    _id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    token: generateToken(user),
  };
};

/**
 * Handle forgot password - Send OTP
 * @param {string} phone
 */
export const forgotPassword = async (phone) => {
  const user = await User.findOne({ phone });

  if (!user) {
    throw new Error('User not found with this phone number');
  }

  // Generate OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  user.passwordResetOtp = otp;
  user.passwordResetOtpExpires = otpExpires;
  await user.save();

  // Send SMS
  await smsService.sendOtp(phone, otp);

  return { message: 'OTP sent to your phone' };
};

/**
 * Verify password reset OTP
 * @param {string} phone
 * @param {string} otp
 * @returns {Object} { message, resetToken }
 */
export const verifyPasswordReset = async (phone, otp) => {
  const user = await User.findOne({
    phone,
    passwordResetOtp: otp,
    passwordResetOtpExpires: { $gt: Date.now() },
  });

  if (!user) {
    throw new Error('Invalid or expired OTP');
  }

  // Generate a temporary reset token to pass to the reset password step
  const resetToken = crypto.randomBytes(20).toString('hex');
  user.passwordResetOtp = resetToken; // Reuse this field or add a new one, let's reuse for simplicity in this flow
  // user.passwordResetOtpExpires remains the same or we could extend it
  await user.save();

  return { message: 'OTP verified', resetToken };
};

/**
 * Reset password
 * @param {string} phone
 * @param {string} resetToken
 * @param {string} newPassword
 */
export const resetPassword = async (phone, resetToken, newPassword) => {
  const user = await User.findOne({
    phone,
    passwordResetOtp: resetToken,
    passwordResetOtpExpires: { $gt: Date.now() },
  });

  if (!user) {
    throw new Error('Invalid or expired reset token');
  }

  user.password = newPassword;
  user.passwordResetOtp = null;
  user.passwordResetOtpExpires = null;
  await user.save();

  return { message: 'Password reset successful' };
};

/**
 * Authenticate user & get token
 * @param {string} email
 * @param {string} password
 * @returns {Object} { user, token }
 */
export const loginUser = async (email, password) => {
  const user = await User.findOne({ email });

  if (user && (await user.comparePassword(password))) {
    return {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      token: generateToken(user),
    };
  } else {
    throw new Error('Invalid email or password');
  }
};

export const logoutUser = async (tokenClaims) => {
  await revokeToken(tokenClaims);
  return { message: 'Logged out successfully' };
};

/**
 * Fields safe to expose on a user profile viewed by someone other than
 * the profile owner (or an admin). Excludes OTP/reset secrets, phone,
 * and other data that should stay private to the account holder.
 */
const PUBLIC_PROFILE_FIELDS =
  'firstName lastName role profileImage cvs skills experience companyName companyWebsite companyDescription industry createdAt';

/**
 * Get user profile
 * @param {string} id - profile being requested
 * @param {Object} [requester] - the authenticated caller ({ _id, role }); when
 *   omitted or when the caller is not the owner/admin, only public fields are returned
 * @returns {Object} user
 */
export const getUserProfile = async (id, requester) => {
  const isOwnerOrAdmin =
    requester && (requester.role === 'admin' || requester._id.toString() === id.toString());

  const user = await User.findById(id).select(isOwnerOrAdmin ? '-password' : PUBLIC_PROFILE_FIELDS);

  if (user) {
    return user;
  } else {
    throw new Error('User not found');
  }
};

/**
 * Update user profile
 * @param {Object} user - The user object from request
 * @param {Object} updates - The updates
 * @returns {Object} updatedUser
 */
export const updateUserProfile = async (user, updates) => {
  user.firstName = updates.firstName || user.firstName;
  user.lastName = updates.lastName || user.lastName;
  user.phone = updates.phone || user.phone;
  user.location = updates.location || user.location;
  user.skills = updates.skills || user.skills;
  user.experience = updates.experience || user.experience;

  // Employer fields
  user.companyName = updates.companyName || user.companyName;
  user.companyWebsite = updates.companyWebsite || user.companyWebsite;
  user.companyDescription = updates.companyDescription || user.companyDescription;
  user.industry = updates.industry || user.industry;

  if (updates.password) {
    user.password = updates.password;
  }

  if (updates.profileImage) {
    // Normalize path to use forward slashes
    user.profileImage = updates.profileImage.replace(/\\/g, '/');
  }

  // Handle multiple CVs
  if (updates.newCVs) {
    // If user already has CVs, append new ones.
    const isFirstCV = user.cvs.length === 0;
    const mappedCVs = updates.newCVs.map((cv, index) => ({
      ...cv,
      url: cv.url.replace(/\\/g, '/'), // Normalize path
      isPrimary: isFirstCV && index === 0,
    }));
    user.cvs.push(...mappedCVs);
  }

  // Handle setting a CV as primary if requested
  if (updates.primaryCvId) {
    user.cvs.forEach((cv) => {
      cv.isPrimary = cv._id.toString() === updates.primaryCvId;
    });
  }

  // Handle deleting a CV if requested
  if (updates.deleteCvId) {
    user.cvs = user.cvs.filter((cv) => cv._id.toString() !== updates.deleteCvId);
  }

  const updatedUser = await user.save();

  return {
    _id: updatedUser._id,
    firstName: updatedUser.firstName,
    lastName: updatedUser.lastName,
    email: updatedUser.email,
    role: updatedUser.role,
    companyName: updatedUser.companyName,
    companyWebsite: updatedUser.companyWebsite,
    companyDescription: updatedUser.companyDescription,
    industry: updatedUser.industry,
    profileImage: updatedUser.profileImage,
    cvs: updatedUser.cvs,
    skills: updatedUser.skills,
    experience: updatedUser.experience,
    location: updatedUser.location,
    token: generateToken(updatedUser),
  };
};

/**
 * Delete user (soft delete)
 * @param {string} id
 * @param {string} password
 */
export const deleteUser = async (id, password) => {
  const user = await User.findById(id);

  if (user) {
    if (await user.comparePassword(password)) {
      user.isActive = false;
      await user.save();
      return { message: 'User removed' };
    } else {
      throw new Error('Invalid password');
    }
  } else {
    throw new Error('User not found');
  }
};

export default {
  registerUser,
  verifyRegistration,
  loginUser,
  logoutUser,
  getUserProfile,
  updateUserProfile,
  deleteUser,
  forgotPassword,
  verifyPasswordReset,
  resetPassword,
};
